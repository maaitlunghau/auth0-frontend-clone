#!/usr/bin/env node
// Project-local content extractor: dumps the semantic content of the target
// page (nav menus, section copy, tab panels, cards, code samples, footer) so
// the clone is built from the real DOM instead of from a screenshot reading.
import fs from "node:fs";
import path from "node:path";
import { systemChromium } from "./web-clone-scripts/lib/system-browser.mjs";

const url = process.argv[2] || "https://auth0.com/";
const outFile = process.argv[3] || "RECON/content-dump.json";
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
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1500);

  const dump = await page.evaluate(() => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const outline = [];
    const walk = (node, depth) => {
      for (const child of node.children) {
        const tag = child.tagName.toLowerCase();
        if (["script", "style", "noscript", "svg", "path"].includes(tag)) continue;
        const rect = child.getBoundingClientRect();
        const ownText = clean(Array.from(child.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent)
          .join(" "));
        const interesting = ownText
          || ["img", "video", "input", "button", "a", "h1", "h2", "h3", "h4", "li"].includes(tag);
        if (interesting && depth < 26) {
          outline.push({
            depth,
            tag,
            cls: clean(child.getAttribute("class")).slice(0, 110),
            text: ownText.slice(0, 220),
            href: child.getAttribute("href") || "",
            src: child.currentSrc || child.getAttribute("src") || "",
            srcset: (child.getAttribute("srcset") || "").slice(0, 300),
            alt: child.getAttribute("alt") || "",
            placeholder: child.getAttribute("placeholder") || "",
            ariaLabel: child.getAttribute("aria-label") || "",
            w: Math.round(rect.width),
            h: Math.round(rect.height),
            top: Math.round(rect.top + window.scrollY),
          });
        }
        walk(child, depth + 1);
      }
    };
    walk(document.body, 0);

    const codeBlocks = Array.from(document.querySelectorAll("pre, code"))
      .map((n) => clean(n.innerText))
      .filter((t) => t.length > 20)
      .slice(0, 20);

    const footerLinks = Array.from(document.querySelectorAll("footer a")).map((a) => ({
      text: clean(a.innerText),
      href: a.getAttribute("href") || "",
    }));

    const navTop = Array.from(document.querySelectorAll("header a, header button, nav a, nav button"))
      .slice(0, 60)
      .map((n) => ({ tag: n.tagName.toLowerCase(), text: clean(n.innerText), href: n.getAttribute("href") || "" }));

    const videos = Array.from(document.querySelectorAll("video")).map((v) => ({
      src: v.currentSrc || v.getAttribute("src") || "",
      sources: Array.from(v.querySelectorAll("source")).map((s) => ({ src: s.getAttribute("src") || "", media: s.getAttribute("media") || "", type: s.getAttribute("type") || "" })),
      poster: v.getAttribute("poster") || "",
      loop: v.loop,
      muted: v.muted,
      autoplay: v.autoplay,
      w: Math.round(v.getBoundingClientRect().width),
      h: Math.round(v.getBoundingClientRect().height),
      top: Math.round(v.getBoundingClientRect().top + window.scrollY),
    }));

    const images = Array.from(document.querySelectorAll("img")).map((img) => ({
      src: img.currentSrc || img.src || "",
      alt: img.alt || "",
      nw: img.naturalWidth,
      nh: img.naturalHeight,
      w: Math.round(img.getBoundingClientRect().width),
      h: Math.round(img.getBoundingClientRect().height),
      top: Math.round(img.getBoundingClientRect().top + window.scrollY),
    })).filter((i) => i.src);

    return {
      bodyText: document.body.innerText,
      outline,
      codeBlocks,
      footerLinks,
      navTop,
      videos,
      images,
      scrollHeight: document.documentElement.scrollHeight,
    };
  });

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(dump, null, 1)}\n`);
  console.log(`${outFile} · outline ${dump.outline.length} nodes · ${dump.images.length} imgs · ${dump.videos.length} videos`);
} finally {
  await browser.close().catch(() => {});
}
