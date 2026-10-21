#!/usr/bin/env node
// Print the document-y offset of the same landmarks on any page, so the clone's
// vertical rhythm can be tuned against the original's numbers.
import { systemChromium } from "./web-clone-scripts/lib/system-browser.mjs";
const url = process.argv[2];
process.env.OD_CLONE_DISMISS_CONSENT = "1";
const b = await systemChromium.launch({
  executablePath: process.env.OD_BROWSER_EXECUTABLE_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await p.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await p.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 110)); }
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(1500);
  const out = await p.evaluate(() => {
    const norm = (v) => String(v || "").replace(/\s+/g, " ").trim();
    const find = (sel, needle) => Array.from(document.querySelectorAll(sel))
      .find((el) => norm(el.textContent).toLowerCase().startsWith(needle.toLowerCase()));
    const Y = (el) => (el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null);
    const H = (el) => (el ? Math.round(el.getBoundingClientRect().height) : null);
    const marks = {
      h1: find("h1", "Convert, protect"),
      badge: find("a", "Auth0 platform announcements"),
      heroCta: find("a", "See it in action"),
      firstLogo: document.querySelector("img[alt='McLaren']"),
      lifecycleH2: find("h2", "Identity for the entire"),
      statEyebrow: find("p", "SECURITY BUILT-IN"),
      tabberH: find("h2,h3", "Built for what"),
      card0: find("h3", "Ship AI agents"),
      industriesH2: find("h2", "Built for industries"),
      retailH3: find("h3", "Retail"),
      agentsH2: find("h2", "Integrate auth into"),
      companyH2: find("h2", "You’re in great") || find("h2", "You're in great"),
      resourcesH2: find("h2", "Read. Watch."),
      finalH2: find("h2", "Get ready to ship"),
      footer: document.querySelector("footer"),
      legal: find("p", "©2026 Okta"),
    };
    const res = {};
    for (const [k, el] of Object.entries(marks)) res[k] = { y: Y(el), h: H(el) };
    document.querySelectorAll(".tcard, [data-tabber-card], article").forEach((el, i) => {
      if (el.className && String(el.className).indexOf("tcard") === -1) return;
      res["tcard" + i] = { y: Y(el), h: H(el) };
    });
    res.__scrollHeight = { y: document.documentElement.scrollHeight, h: 0 };
    return res;
  });
  console.log(JSON.stringify(out));
} finally { await b.close().catch(() => {}); }
