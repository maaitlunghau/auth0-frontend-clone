#!/usr/bin/env node
// Pull the inline SVG icon set and every tab panel (including the ones that are
// rendered but hidden) so the clone ships Auth0's real marks and the real copy
// behind each tab rather than a guess at what the inactive states say.
import fs from "node:fs";
import path from "node:path";
import { systemChromium } from "./web-clone-scripts/lib/system-browser.mjs";

const url = process.argv[2] || "https://auth0.com/";
const outFile = process.argv[3] || "RECON/parts.json";
process.env.OD_CLONE_DISMISS_CONSENT = "1";

const browser = await systemChromium.launch({
  executablePath: process.env.OD_BROWSER_EXECUTABLE_PATH
    || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 700) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 110));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1500);

  const parts = await page.evaluate(() => {
    const norm = (v) => String(v || "").replace(/\s+/g, " ").trim();
    const svgs = [];
    const seen = new Set();
    for (const svg of Array.from(document.querySelectorAll("svg"))) {
      const markup = svg.outerHTML.replace(/\s+/g, " ");
      if (markup.length > 9000 || seen.has(markup)) continue;
      seen.add(markup);
      const host = svg.closest("a, button, li, div");
      svgs.push({
        markup,
        width: svg.getAttribute("width") || "",
        height: svg.getAttribute("height") || "",
        viewBox: svg.getAttribute("viewBox") || "",
        near: norm(host?.textContent).slice(0, 60),
        rect: (() => {
          const r = svg.getBoundingClientRect();
          return `${Math.round(r.width)}x${Math.round(r.height)} y${Math.round(r.top + window.scrollY)}`;
        })(),
      });
    }

    // Industry / code / resource panels keep their inactive siblings in the DOM.
    const panels = [];
    for (const el of Array.from(document.querySelectorAll("[role='tabpanel'], [data-state], [aria-hidden]"))) {
      const text = norm(el.textContent);
      if (text.length < 40 || text.length > 1200) continue;
      panels.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || "",
        role: el.getAttribute("role") || "",
        state: el.getAttribute("data-state") || "",
        hidden: el.getAttribute("aria-hidden") || "",
        text: text.slice(0, 900),
        imgs: Array.from(el.querySelectorAll("img")).map((i) => i.currentSrc || i.src).slice(0, 8),
      });
    }

    const tabs = Array.from(document.querySelectorAll("[role='tab'], button"))
      .map((b) => ({
        text: norm(b.textContent).slice(0, 50),
        role: b.getAttribute("role") || "",
        selected: b.getAttribute("aria-selected") || "",
        controls: b.getAttribute("aria-controls") || "",
      }))
      .filter((b) => b.text);

    const imageSizes = Array.from(document.querySelectorAll("img"))
      .filter((i) => /cdn\.auth0\.com|ctfassets/.test(i.currentSrc || i.src))
      .map((i) => ({
        src: (i.currentSrc || i.src).split("/").slice(-2).join("/"),
        natural: `${i.naturalWidth}x${i.naturalHeight}`,
        rendered: `${Math.round(i.getBoundingClientRect().width)}x${Math.round(i.getBoundingClientRect().height)}`,
        alt: i.alt,
        y: Math.round(i.getBoundingClientRect().top + window.scrollY),
      }));

    return { svgs, panels, tabs, imageSizes };
  });

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(parts, null, 1)}\n`);
  console.log(`${outFile} · ${parts.svgs.length} svgs · ${parts.panels.length} panels · ${parts.imageSizes.length} images`);
} finally {
  await browser.close().catch(() => {});
}
