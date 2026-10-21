#!/usr/bin/env node
// Second measurement pass: the chrome, strips and card shells that the first
// pass did not name — read with their ancestor chain so the real wrapper
// (not the text node's immediate parent) is the one that gets copied.
import fs from "node:fs";
import path from "node:path";
import { systemChromium } from "./web-clone-scripts/lib/system-browser.mjs";

const url = process.argv[2] || "https://auth0.com/";
const outFile = process.argv[3] || "RECON/measurements-2.json";
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
    const norm = (v) => String(v || "").replace(/\s+/g, " ").trim();
    const shot = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        text: norm(el.textContent).slice(0, 48),
        rect: `${Math.round(r.width)}x${Math.round(r.height)} @x${Math.round(r.x)} y${Math.round(r.top + window.scrollY)}`,
        font: `${s.fontSize}/${s.lineHeight} w${s.fontWeight} ls${s.letterSpacing} ${s.fontFamily.split(",")[0]} ${s.textTransform}`,
        color: s.color,
        bg: s.backgroundColor,
        bgImage: s.backgroundImage === "none" ? "" : s.backgroundImage.slice(0, 260),
        border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor} | B ${s.borderBottomWidth} ${s.borderBottomColor} | L ${s.borderLeftWidth} ${s.borderLeftColor}`,
        radius: s.borderRadius,
        pad: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
        gap: s.gap,
        display: `${s.display} ${s.flexDirection} ${s.justifyContent} ${s.alignItems}`,
        grid: s.gridTemplateColumns,
        position: `${s.position} t${s.top} z${s.zIndex}`,
        opacity: s.opacity,
        shadow: s.boxShadow.slice(0, 200),
        filter: s.filter,
        backdrop: s.backdropFilter,
        transform: s.transform,
        overflow: s.overflow,
        maxWidth: s.maxWidth,
        minHeight: s.minHeight,
        transition: s.transition.slice(0, 160),
      };
    };
    const chain = (el, up = 3) => {
      const list = [];
      let node = el;
      for (let i = 0; i <= up && node; i += 1) {
        list.push({ up: i, ...shot(node) });
        node = node.parentElement;
      }
      return list;
    };
    const byText = (selector, needle, exact = false) => Array.from(document.querySelectorAll(selector))
      .find((el) => {
        const t = norm(el.textContent);
        return exact ? t === needle : t.toLowerCase().startsWith(String(needle).toLowerCase());
      });

    const result = {};
    result.announcement = chain(byText("p", "Streamcast Ep") || byText("p", "B2B Connect") || document.querySelector("header p"), 4);
    result.navBar = chain(document.querySelector("header a[aria-label='Auth0 logo']"), 3);
    result.navLink = chain(byText("p", "Build", true) || byText("button", "Build"), 2);
    result.heroBadge = chain(byText("a", "Auth0 platform announcements") || byText("span", "Auth0 platform announcements"), 2);
    result.heroSection = chain(document.querySelector("video")?.parentElement, 3);
    result.logoStrip = chain(document.querySelector("img[alt*='McLaren' i], img[src*='mclaren' i]"), 3);
    result.statsStrip = chain(byText("p", "SECURITY BUILT-IN"), 4);
    result.statValue = chain(byText("p", "3 billion+") || byText("span", "3 billion+") || byText("div", "3 billion+"), 1);
    result.tabberCard = chain(byText("h3", "Ship AI agents"), 4);
    result.tabberList = chain(byText("button", "AI Agents", true) || byText("li", "AI Agents", true), 3);
    result.industryPills = chain(byText("button", "Retail", true), 2);
    result.codeTabs = chain(byText("button", "Claude", true), 3);
    result.codeBlock = chain(document.querySelector("pre"), 2);
    result.companyGrid = chain(byText("h3", "McLaren achieved"), 4);
    result.resourceTabs = chain(byText("button", "AI Future-Proofing", true), 3);
    result.resourceCard = chain(byText("h3", "When AI moves faster"), 4);
    result.finalCta = chain(byText("h2", "Get ready to ship"), 3);
    result.footerCta = chain(byText("p", "Connect with a sales"), 2);
    result.legalRow = chain(byText("p", "©2026 Okta"), 2);
    return result;
  });

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(data, null, 1)}\n`);
  console.log(`${outFile} · ${Object.keys(data).length} groups`);
} finally {
  await browser.close().catch(() => {});
}
