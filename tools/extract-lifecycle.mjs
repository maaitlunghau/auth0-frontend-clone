#!/usr/bin/env node
// The lifecycle arc auto-rotates through its stages and has a B2C/B2B toggle
// that is not a plain <button>, so the copy for each stage can only be read by
// watching the section change over time in both modes.
import fs from "node:fs";
import path from "node:path";
import { systemChromium } from "./web-clone-scripts/lib/system-browser.mjs";

const url = process.argv[2] || "https://auth0.com/";
const outFile = process.argv[3] || "RECON/lifecycle.json";
process.env.OD_CLONE_DISMISS_CONSENT = "1";

const browser = await systemChromium.launch({
  executablePath: process.env.OD_BROWSER_EXECUTABLE_PATH
    || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(2000);

  const controls = await page.evaluate(() => {
    const norm = (v) => String(v || "").replace(/\s+/g, " ").trim();
    return Array.from(document.querySelectorAll("button, [role='tab'], [role='switch'], label, span, div"))
      .filter((el) => ["b2c", "b2b"].includes(norm(el.textContent).toLowerCase()))
      .slice(0, 10)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        text: norm(el.textContent),
        cls: norm(el.className).slice(0, 80),
        rect: (() => {
          const r = el.getBoundingClientRect();
          return `${Math.round(r.width)}x${Math.round(r.height)} @x${Math.round(r.x)} y${Math.round(r.top + window.scrollY)}`;
        })(),
      }));
  });

  const sample = async (mode) => {
    const states = [];
    const seen = new Set();
    for (let i = 0; i < 40; i += 1) {
      const snap = await page.evaluate(() => {
        const norm = (v) => String(v || "").replace(/\s+/g, " ").trim();
        const heading = Array.from(document.querySelectorAll("h2"))
          .find((h) => norm(h.textContent).startsWith("Identity for the entire"));
        const section = heading?.closest("section") || heading?.parentElement?.parentElement;
        if (!section) return null;
        const active = Array.from(section.querySelectorAll("p, h3, span, div"))
          .map((el) => norm(el.textContent))
          .filter(Boolean);
        return {
          text: norm(section.innerText).slice(0, 700),
          imgs: Array.from(section.querySelectorAll("img"))
            .filter((i) => i.getBoundingClientRect().width > 8)
            .map((i) => (i.currentSrc || i.src).split("/").pop()),
          sample: active.slice(0, 4),
        };
      });
      if (snap && !seen.has(snap.text)) {
        seen.add(snap.text);
        states.push(snap);
      }
      await page.waitForTimeout(900);
    }
    return { mode, states };
  };

  const result = { controls, modes: [] };
  result.modes.push(await sample("B2C"));

  const switched = await page.evaluate(() => {
    const norm = (v) => String(v || "").replace(/\s+/g, " ").trim();
    const target = Array.from(document.querySelectorAll("button, [role='tab'], label, span, div"))
      .find((el) => norm(el.textContent).toLowerCase() === "b2b" && el.getBoundingClientRect().width > 10);
    if (!target) return false;
    target.click();
    return true;
  });
  if (switched) {
    await page.waitForTimeout(1200);
    result.modes.push(await sample("B2B"));
  }

  // Every resource-tab image URL, so the non-default tabs ship real artwork too.
  const resourceImages = await page.evaluate(async () => {
    const norm = (v) => String(v || "").replace(/\s+/g, " ").trim();
    const urls = new Set();
    const labels = ["AI Future-Proofing", "Identity Security", "Product Innovation", "Customer Experience"];
    for (const label of labels) {
      const tab = Array.from(document.querySelectorAll("button, [role='tab']"))
        .find((el) => norm(el.textContent) === label);
      if (!tab) continue;
      tab.scrollIntoView({ block: "center" });
      tab.click();
      await new Promise((r) => setTimeout(r, 1100));
      for (const img of Array.from(document.querySelectorAll("img"))) {
        const src = img.currentSrc || img.src;
        if (src.includes("ctfassets")) urls.add(src);
      }
    }
    return Array.from(urls);
  });
  result.resourceImages = resourceImages;

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(result, null, 1)}\n`);
  console.log(`${outFile} · ${result.modes.map((m) => `${m.mode}:${m.states.length}`).join(" ")} · ${resourceImages.length} resource images`);
} finally {
  await browser.close().catch(() => {});
}
