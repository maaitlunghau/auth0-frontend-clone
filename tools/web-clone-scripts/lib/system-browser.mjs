import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const COMMAND_TIMEOUT_MS = 30_000;

function withTimeout(promise, timeoutMs, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      timer.unref?.();
    }),
  ]).finally(() => clearTimeout(timer));
}

class CdpConnection {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.closed = false;
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", () => reject(new Error(`CDP WebSocket failed: ${url}`)), { once: true });
    });
    this.socket.addEventListener("message", (event) => this.#handleMessage(event.data));
    this.socket.addEventListener("close", () => {
      this.closed = true;
      for (const { reject } of this.pending.values()) reject(new Error("CDP connection closed"));
      this.pending.clear();
    });
  }

  #handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else pending.resolve(message.result || {});
      return;
    }
    if (!message.method) return;
    for (const listener of this.listeners.get(message.method) || []) {
      try {
        listener(message.params || {});
      } catch {
        // A consumer event handler must not break the CDP stream.
      }
    }
  }

  async send(method, params = {}, timeoutMs = COMMAND_TIMEOUT_MS) {
    await this.ready;
    if (this.closed || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("CDP connection closed");
    }
    const id = this.nextId++;
    const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify({ id, method, params }));
    return withTimeout(result, timeoutMs, method);
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => listeners.delete(listener);
  }

  close() {
    this.closed = true;
    this.socket.close();
  }
}

function normalizeResourceType(value = "other") {
  const lower = String(value).toLowerCase();
  return lower === "xhr" || lower === "fetch" ? lower : lower;
}

function requestView(entry) {
  return {
    url: () => entry.url,
    method: () => entry.method,
    resourceType: () => normalizeResourceType(entry.resourceType),
    headers: () => entry.headers,
    postData: () => entry.postData || null,
  };
}

function responseView(page, entry) {
  return {
    url: () => entry.url,
    status: () => entry.status,
    ok: () => entry.status >= 200 && entry.status < 400,
    headers: () => entry.headers,
    request: () => requestView(entry.request),
    body: async () => page.responseBody(entry.requestId),
  };
}

export function fullPageScreenshotClip(metrics, viewport) {
  const content = metrics.cssContentSize || metrics.contentSize || {};
  return {
    x: 0,
    y: 0,
    // On Linux, a non-overlay vertical scrollbar reduces cssContentSize.width
    // even though the requested browser viewport is unchanged. Preserve the
    // requested viewport while still capturing genuine horizontal overflow.
    width: Math.max(1, viewport.width, content.width || 0),
    height: Math.max(1, viewport.height, content.height || 0),
    scale: 1,
  };
}

class CdpPage {
  static async create(browser, target, options = {}) {
    const page = new CdpPage(browser, target, options);
    await page.initialize();
    return page;
  }

  constructor(browser, target, options) {
    this.browser = browser;
    this.target = target;
    this.connection = new CdpConnection(target.webSocketDebuggerUrl);
    this.listeners = new Map();
    this.requests = new Map();
    this.finishedRequests = new Map();
    this.inflight = new Set();
    this.lastNetworkActivity = Date.now();
    this.navigationEpoch = 0;
    this.domContentEpoch = 0;
    this.loadEpoch = 0;
    this.mainFrameId = null;
    this.mainResponse = null;
    this.currentUrl = target.url || "about:blank";
    this.mousePosition = { x: 0, y: 0 };
    this.viewport = options.viewport || { width: 1280, height: 720 };
    this.deviceScaleFactor = options.deviceScaleFactor || 1;
  }

  async initialize() {
    await this.connection.ready;
    this.connection.on("Runtime.consoleAPICalled", ({ type, args = [] }) => {
      const text = args.map((arg) => arg.value ?? arg.description ?? "").join(" ");
      this.emit("console", { type: () => type, text: () => text });
    });
    this.connection.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      this.emit("pageerror", new Error(exceptionDetails?.exception?.description || exceptionDetails?.text || "Page error"));
    });
    this.connection.on("Page.domContentEventFired", () => {
      this.domContentEpoch = this.navigationEpoch;
      this.emit("__domcontentloaded", {});
    });
    this.connection.on("Page.loadEventFired", () => {
      this.loadEpoch = this.navigationEpoch;
      this.emit("__load", {});
    });
    this.connection.on("Network.requestWillBeSent", (event) => this.#onRequest(event));
    this.connection.on("Network.responseReceived", (event) => this.#onResponse(event));
    this.connection.on("Network.loadingFinished", ({ requestId }) => this.#finishRequest(requestId, null));
    this.connection.on("Network.loadingFailed", ({ requestId, errorText }) => this.#finishRequest(requestId, errorText || "failed"));
    await Promise.all([
      this.connection.send("Page.enable"),
      this.connection.send("Runtime.enable"),
      this.connection.send("Network.enable", { maxTotalBufferSize: 100_000_000, maxResourceBufferSize: 25_000_000 }),
      this.connection.send("Emulation.setDeviceMetricsOverride", {
        width: this.viewport.width,
        height: this.viewport.height,
        deviceScaleFactor: this.deviceScaleFactor,
        mobile: false,
      }),
    ]);
  }

  #onRequest(event) {
    const request = {
      url: event.request?.url || "",
      method: event.request?.method || "GET",
      headers: event.request?.headers || {},
      postData: event.request?.postData || "",
      resourceType: event.type || "Other",
    };
    this.requests.set(event.requestId, request);
    if (!request.url.startsWith("data:")) this.inflight.add(event.requestId);
    this.lastNetworkActivity = Date.now();
    this.emit("request", requestView(request));
  }

  #onResponse(event) {
    const request = this.requests.get(event.requestId) || {
      url: event.response?.url || "",
      method: "GET",
      headers: {},
      postData: "",
      resourceType: event.type || "Other",
    };
    request.resourceType = event.type || request.resourceType;
    const headers = Object.fromEntries(
      Object.entries(event.response?.headers || {}).map(([key, value]) => [key.toLowerCase(), String(value)]),
    );
    const response = {
      requestId: event.requestId,
      url: event.response?.url || request.url,
      status: event.response?.status || 0,
      headers,
      request,
    };
    if (event.type === "Document" && (!this.mainFrameId || event.frameId === this.mainFrameId)) {
      this.mainResponse = response;
      this.currentUrl = response.url;
    }
    this.emit("response", responseView(this, response));
  }

  #finishRequest(requestId, error) {
    this.inflight.delete(requestId);
    this.lastNetworkActivity = Date.now();
    const pending = this.finishedRequests.get(requestId);
    if (pending) {
      this.finishedRequests.delete(requestId);
      if (error) pending.reject(new Error(error));
      else pending.resolve();
    } else {
      this.finishedRequests.set(requestId, { done: true, error });
    }
  }

  emit(name, payload) {
    for (const listener of this.listeners.get(name) || []) {
      try {
        const result = listener(payload);
        result?.catch?.(() => {});
      } catch {
        // Consumer listeners are observational.
      }
    }
  }

  on(name, listener) {
    const listeners = this.listeners.get(name) || new Set();
    listeners.add(listener);
    this.listeners.set(name, listeners);
    return this;
  }

  off(name, listener) {
    this.listeners.get(name)?.delete(listener);
    return this;
  }

  waitForEvent(name, predicate, timeoutMs) {
    return withTimeout(new Promise((resolve) => {
      const listener = (payload) => {
        if (predicate && !predicate(payload)) return;
        this.off(name, listener);
        resolve(payload);
      };
      this.on(name, listener);
    }), timeoutMs, name);
  }

  async goto(url, { waitUntil = "load", timeout = 30_000 } = {}) {
    this.navigationEpoch += 1;
    this.mainResponse = null;
    const epoch = this.navigationEpoch;
    const eventName = waitUntil === "domcontentloaded" ? "__domcontentloaded" : "__load";
    const eventWait = waitUntil === "networkidle"
      ? null
      : this.waitForEvent(eventName, () => this.navigationEpoch === epoch, timeout);
    const result = await this.connection.send("Page.navigate", { url }, timeout);
    if (result.errorText) throw new Error(`Navigation failed: ${result.errorText}`);
    this.mainFrameId = result.frameId || this.mainFrameId;
    this.currentUrl = url;
    if (waitUntil === "networkidle") await this.waitForNetworkIdle(timeout);
    else await eventWait;
    // LOCAL PATCH (see NOTES.md): a cookie-consent modal covers the fold on the
    // target site, poisoning every screenshot and the computed palette behind it.
    // Opt-in via OD_CLONE_DISMISS_CONSENT=1 so the behaviour stays explicit.
    if (process.env.OD_CLONE_DISMISS_CONSENT === "1") await this.#dismissConsent();
    return this.mainResponse ? responseView(this, this.mainResponse) : null;
  }

  async #dismissConsent() {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const clicked = await this.evaluate(() => {
        const selectors = [
          "#onetrust-accept-btn-handler",
          "#onetrust-reject-all-handler",
          ".onetrust-close-btn-handler",
          "#truste-consent-button",
          "button[aria-label='Accept all cookies']",
          "button[data-testid='accept-all-cookies']",
        ];
        for (const selector of selectors) {
          const node = document.querySelector(selector);
          if (node && node.offsetParent !== null) {
            node.click();
            return selector;
          }
        }
        return "";
      }).catch(() => "");
      if (clicked) {
        await this.waitForTimeout(700);
        await this.evaluate(() => {
          for (const id of ["onetrust-consent-sdk", "truste-consent-track"]) {
            document.getElementById(id)?.remove();
          }
          document.documentElement.style.removeProperty("overflow");
          document.body?.style.removeProperty("overflow");
        }).catch(() => {});
        return clicked;
      }
      await this.waitForTimeout(400);
    }
    return "";
  }

  async waitForLoadState(state, { timeout = 30_000 } = {}) {
    if (state === "networkidle") return this.waitForNetworkIdle(timeout);
    const epoch = this.navigationEpoch;
    if (state === "domcontentloaded" && this.domContentEpoch === epoch) return;
    if (state === "load" && this.loadEpoch === epoch) return;
    return this.waitForEvent(state === "domcontentloaded" ? "__domcontentloaded" : "__load", null, timeout);
  }

  async waitForNetworkIdle(timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (this.inflight.size === 0 && Date.now() - this.lastNetworkActivity >= 500) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`networkidle timed out after ${timeoutMs}ms`);
  }

  waitForTimeout(timeoutMs) {
    return new Promise((resolve) => setTimeout(resolve, timeoutMs));
  }

  async evaluate(fn, ...args) {
    const serializedArgs = args.map((arg) => JSON.stringify(arg ?? null)).join(",");
    const expression = `(${fn.toString()})(${serializedArgs})`;
    const result = await this.connection.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Evaluation failed");
    }
    return result.result?.value;
  }

  url() {
    return this.currentUrl;
  }

  async screenshot({ path: outputPath, fullPage = false } = {}) {
    const params = { format: "png", fromSurface: true, captureBeyondViewport: true };
    if (fullPage) {
      const metrics = await this.connection.send("Page.getLayoutMetrics");
      const clip = fullPageScreenshotClip(metrics, this.viewport);
      // LOCAL PATCH (see NOTES.md): on this host, a single captureScreenshot of a
      // tall surface kills the browser process ("CDP connection closed",
      // reproduced at 1440x10151 on auth0.com). Capture viewport-sized tiles and
      // stitch them instead — same pixels, no oversized compositor surface.
      if (clip.height > this.viewport.height + 4) {
        const png = await this.#captureTiledFullPage(clip);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, png);
        return;
      }
      params.clip = clip;
    } else {
      params.clip = { x: 0, y: 0, width: this.viewport.width, height: this.viewport.height, scale: 1 };
    }
    const { data } = await this.connection.send("Page.captureScreenshot", params, 60_000);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, Buffer.from(data, "base64"));
  }

  async #captureTiledFullPage(clip) {
    // captureBeyondViewport treats clip coordinates as document coordinates, so
    // each band is addressed by its y offset. No scrolling is involved — the
    // caller has already scrolled the page once to trigger lazy loading.
    const tileHeight = this.viewport.height;
    const tiles = [];
    for (let y = 0; y < clip.height; y += tileHeight) {
      const height = Math.min(tileHeight, clip.height - y);
      const { data } = await this.connection.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: true,
        clip: { x: 0, y, width: clip.width, height, scale: 1 },
      }, 60_000);
      tiles.push({ y, data: `data:image/png;base64,${data}` });
    }

    const scratch = await this.browser.newPage({
      viewport: { width: 400, height: 300 },
      deviceScaleFactor: 1,
    });
    try {
      await scratch.evaluate((size) => {
        const canvas = document.createElement("canvas");
        canvas.width = size.width;
        canvas.height = size.height;
        window.__odCanvas = canvas;
        window.__odCtx = canvas.getContext("2d");
      }, { width: clip.width, height: clip.height });
      // One tile per CDP message: a single multi-megabyte Runtime.evaluate
      // expression carrying every tile drops the websocket.
      for (const tile of tiles) {
        await scratch.evaluate(async (payload) => {
          const image = new Image();
          await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = () => reject(new Error("tile decode failed"));
            image.src = payload.data;
          });
          const scale = window.__odCanvas.width / image.width;
          window.__odCtx.drawImage(image, 0, payload.y, window.__odCanvas.width, image.height * scale);
          return true;
        }, tile);
      }
      // Read the stitched PNG back in chunks: a single multi-megabyte
      // returnByValue payload also drops the websocket.
      const total = await scratch.evaluate(() => {
        window.__odPng = window.__odCanvas.toDataURL("image/png").split(",")[1];
        return window.__odPng.length;
      });
      const chunkSize = 512 * 1024;
      let base64 = "";
      for (let offset = 0; offset < total; offset += chunkSize) {
        base64 += await scratch.evaluate(
          (range) => window.__odPng.slice(range.start, range.end),
          { start: offset, end: Math.min(offset + chunkSize, total) },
        );
      }
      return Buffer.from(base64, "base64");
    } finally {
      await scratch.close().catch(() => {});
    }
  }

  async responseBody(requestId) {
    const finished = this.finishedRequests.get(requestId);
    if (!finished) {
      await withTimeout(new Promise((resolve, reject) => {
        this.finishedRequests.set(requestId, { resolve, reject });
      }), 30_000, "response body");
    } else if (!finished.done) {
      await withTimeout(new Promise((resolve, reject) => {
        this.finishedRequests.set(requestId, { resolve, reject });
      }), 30_000, "response body");
    } else if (finished.error) {
      throw new Error(finished.error);
    }
    const result = await this.connection.send("Network.getResponseBody", { requestId });
    return Buffer.from(result.body || "", result.base64Encoded ? "base64" : "utf8");
  }

  locator(selector) {
    const page = this;
    const locate = async () => {
      const rect = await page.evaluate((value) => {
        const element = document.querySelector(value);
        if (!element) return null;
        element.scrollIntoView({ block: "center", inline: "center" });
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      }, selector);
      if (!rect || rect.width <= 0 || rect.height <= 0) throw new Error(`Element not actionable: ${selector}`);
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    };
    return {
      first() {
        return this;
      },
      async hover() {
        const point = await locate();
        await page.mouse.move(point.x, point.y);
      },
      async click() {
        const point = await locate();
        await page.mouse.move(point.x, point.y);
        await page.mouse.down();
        await page.mouse.up();
      },
    };
  }

  mouse = {
    move: async (x, y, { steps = 1 } = {}) => {
      const start = this.mousePosition;
      for (let step = 1; step <= steps; step += 1) {
        const next = {
          x: start.x + ((x - start.x) * step) / steps,
          y: start.y + ((y - start.y) * step) / steps,
        };
        await this.connection.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...next });
        this.mousePosition = next;
      }
    },
    down: async () => {
      await this.connection.send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        ...this.mousePosition,
        button: "left",
        buttons: 1,
        clickCount: 1,
      });
    },
    up: async () => {
      await this.connection.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        ...this.mousePosition,
        button: "left",
        buttons: 0,
        clickCount: 1,
      });
    },
  };

  async close() {
    this.connection.close();
    await fetch(`${this.browser.httpBase}/json/close/${this.target.id}`).catch(() => undefined);
  }
}

class BrowserRequestContext {
  constructor(context) {
    this.context = context;
  }

  async get(url, { headers = {}, maxRedirects = 5, timeout = 30_000 } = {}) {
    let cookies = [];
    try {
      const page = this.context.pages.at(-1);
      cookies = page ? (await page.connection.send("Network.getCookies", { urls: [url] })).cookies || [] : [];
    } catch {}
    const cookie = cookies.map((entry) => `${entry.name}=${entry.value}`).join("; ");
    const response = await fetch(url, {
      headers: { ...headers, ...(cookie ? { cookie } : {}) },
      redirect: maxRedirects > 0 ? "follow" : "manual",
      signal: AbortSignal.timeout(timeout),
    });
    return {
      ok: () => response.ok,
      status: () => response.status,
      body: async () => Buffer.from(await response.arrayBuffer()),
    };
  }
}

class CdpContext {
  constructor(browser, options = {}) {
    this.browser = browser;
    this.options = options;
    this.pages = [];
    this.request = new BrowserRequestContext(this);
  }

  async newPage() {
    const page = await this.browser.createPage(this.options);
    this.pages.push(page);
    return page;
  }
}

class SystemBrowser {
  constructor(child, profileDir, browserSocketUrl, closeRemote = null) {
    this.child = child;
    this.profileDir = profileDir;
    this.closeRemote = closeRemote;
    const socket = new URL(browserSocketUrl);
    this.httpBase = `http://${socket.host}`;
    this.closed = false;
  }

  async createPage(options = {}) {
    const response = await fetch(`${this.httpBase}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" });
    if (!response.ok) throw new Error(`Chrome target creation failed: HTTP ${response.status}`);
    const target = await response.json();
    return CdpPage.create(this, target, options);
  }

  newPage(options = {}) {
    return this.createPage(options);
  }

  newContext(options = {}) {
    return Promise.resolve(new CdpContext(this, options));
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    if (this.closeRemote) {
      await this.closeRemote();
      return;
    }
    this.child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => this.child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
    if (this.child.exitCode == null) this.child.kill("SIGKILL");
    fs.rmSync(this.profileDir, { recursive: true, force: true });
  }
}

async function connectOverDaemon({ daemonUrl, projectId }) {
  if (!daemonUrl || !projectId) throw new Error("OD_DAEMON_URL and OD_PROJECT_ID are required");
  const endpoint = `${daemonUrl.replace(/\/$/, "")}/api/projects/${encodeURIComponent(projectId)}/browser-sessions`;
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" } });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`daemon browser session failed: HTTP ${response.status}${detail ? ` ${detail}` : ""}`);
  }
  const payload = await response.json();
  const session = payload.browserSession;
  if (!session?.id || !session?.websocketUrl) throw new Error("daemon returned an invalid browser session");
  return new SystemBrowser(null, null, session.websocketUrl, async () => {
    await fetch(`${endpoint}/${encodeURIComponent(session.id)}`, { method: "DELETE" }).catch(() => undefined);
  });
}

async function launchSystemBrowser({ executablePath }) {
  if (!executablePath) throw new Error("A system browser executable path is required");
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "od-web-clone-browser-"));
  const child = spawn(executablePath, [
    "--headless=new",
    "--remote-debugging-port=0",
    "--remote-allow-origins=*",
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-sync",
    "--metrics-recording-only",
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  const browserSocketUrl = await withTimeout(new Promise((resolve, reject) => {
    let output = "";
    const inspect = (chunk) => {
      output += String(chunk);
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) resolve(match[1]);
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`System browser exited before CDP was ready (code ${code})`)));
  }), 15_000, "system browser startup").catch((error) => {
    child.kill("SIGKILL");
    fs.rmSync(profileDir, { recursive: true, force: true });
    throw error;
  });

  return new SystemBrowser(child, profileDir, browserSocketUrl);
}

export const systemChromium = {
  launch: launchSystemBrowser,
  connectOverDaemon,
};
