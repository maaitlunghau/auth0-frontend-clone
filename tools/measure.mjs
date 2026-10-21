#!/usr/bin/env node
// Pull exact computed typography, spacing, colour and geometry off the live
// page so the clone's scale is copied rather than eyeballed.
import fs from "node:fs";
import path from "node:path";
import { systemChromium } from "./web-clone-scripts/lib/system-browser.mjs";

const url = process.argv[2] || "https://auth0.com/";
const outFile = process.argv[3] || "RECON/measurements.json";
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

  const data = await page.evaluate(() => {
    const norm = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const describe = (el, label) => {
      if (!el) return { label, missing: true };
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        label,
        tag: el.tagName.toLowerCase(),
        text: norm(el.textContent).slice(0, 70),
        box: {
          w: Math.round(r.width * 10) / 10,
          h: Math.round(r.height * 10) / 10,
          x: Math.round(r.x),
          top: Math.round(r.top + window.scrollY),
        },
        type: {
          fontFamily: s.fontFamily,
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
          lineHeight: s.lineHeight,
          letterSpacing: s.letterSpacing,
          textTransform: s.textTransform,
          color: s.color,
        },
        boxStyle: {
          backgroundColor: s.backgroundColor,
          backgroundImage: s.backgroundImage.slice(0, 220),
          border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
          borderRadius: s.borderRadius,
          padding: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
          margin: `${s.marginTop} ${s.marginRight} ${s.marginBottom} ${s.marginLeft}`,
          gap: s.gap,
          display: s.display,
          position: s.position,
          boxShadow: s.boxShadow.slice(0, 160),
          backdropFilter: s.backdropFilter,
          opacity: s.opacity,
          overflow: s.overflow,
          maxWidth: s.maxWidth,
          zIndex: s.zIndex,
        },
      };
    };
    const byText = (selector, needle) => Array.from(document.querySelectorAll(selector))
      .find((el) => norm(el.textContent).toLowerCase().startsWith(String(needle).toLowerCase()));

    const out = [];
    const push = (el, label) => out.push(describe(el, label));

    push(document.documentElement, "html");
    push(document.body, "body");
    push(document.querySelector("header"), "header");
    push(document.querySelector("header nav"), "header>nav");
    push(document.querySelector("h1"), "h1");
    push(document.querySelector("h1")?.parentElement, "h1 parent");
    push(byText("h2", "Identity for the entire"), "h2 lifecycle");
    push(byText("h2", "Built for industries"), "h2 industries");
    push(byText("h2", "Integrate auth into"), "h2 integrate");
    push(byText("h2", "You’re in great"), "h2 company");
    push(byText("h2", "Read. Watch."), "h2 resources");
    push(byText("h2", "Get ready to ship"), "h2 cta");
    push(byText("h3", "Built for what"), "h3 tabber title");
    push(byText("h3", "Ship AI agents"), "h3 card title");
    push(byText("p", "Auth0 makes every login"), "hero sub");
    push(byText("a", "See it in action"), "cta primary");
    push(byText("a", "Talk to an expert"), "cta secondary");
    push(byText("a", "Sign up"), "nav signup");
    push(byText("a", "Let's connect"), "nav connect");
    push(byText("button", "Retail"), "pill active");
    push(byText("button", "Financial Services"), "pill idle");
    push(byText("button", "B2C"), "toggle b2c");
    push(byText("div", "3 billion+"), "stat value wrap");
    push(byText("p", "SECURITY BUILT-IN") || byText("span", "SECURITY BUILT-IN") || byText("div", "SECURITY BUILT-IN"), "stat eyebrow");
    push(byText("p", "FEATURED CAPABILITIES") || byText("span", "FEATURED CAPABILITIES") || byText("div", "FEATURED CAPABILITIES"), "featured label");
    push(document.querySelector("footer"), "footer");
    push(byText("p", "STARTING WITH AUTH0") || byText("h3", "STARTING WITH AUTH0") || byText("div", "STARTING WITH AUTH0"), "footer col title");
    push(document.querySelector("footer a"), "footer link");
    push(document.querySelector("main"), "main");
    push(document.querySelector("video"), "hero video");

    // Common wrappers: find the widest repeated content container width.
    const widths = {};
    for (const el of Array.from(document.querySelectorAll("div, section"))) {
      const r = el.getBoundingClientRect();
      if (r.width > 700 && r.width < 1441) {
        const key = Math.round(r.width);
        widths[key] = (widths[key] || 0) + 1;
      }
    }
    const containerWidths = Object.entries(widths)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([w, count]) => ({ width: Number(w), count }));

    // Section rhythm: top offsets and heights of the direct children of main.
    const main = document.querySelector("main") || document.body;
    const sectionRhythm = Array.from(main.children).map((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        top: Math.round(r.top + window.scrollY),
        h: Math.round(r.height),
        padding: `${s.paddingTop} ${s.paddingBottom}`,
        bg: s.backgroundColor,
        text: norm(el.textContent).slice(0, 60),
      };
    });

    return { out, containerWidths, sectionRhythm };
  });

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(data, null, 1)}\n`);
  console.log(`${outFile} · ${data.out.length} measurements`);
} finally {
  await browser.close().catch(() => {});
}
