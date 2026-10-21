#!/usr/bin/env node
// Capture arbitrary document-coordinate bands of a live page at 1:1, so the
// original and the clone can be read and compared section by section without
// shipping multi-megabyte images through the CDP channel.
import fs from "node:fs";
import path from "node:path";
import { systemChromium } from "./web-clone-scripts/lib/system-browser.mjs";

const [url, outDir, bandsArg, heightArg, widthArg] = process.argv.slice(2);
if (!url || !outDir) {
  console.error("usage: band-shot.mjs <url> <outDir> <y1,y2,...> [bandHeight=820] [viewportWidth=1440]");
  process.exit(1);
}
const bands = (bandsArg || "0").split(",").map(Number);
const bandHeight = Number(heightArg || 820);
const width = Number(widthArg || 1440);
process.env.OD_CLONE_DISMISS_CONSENT = "1";

const browser = await systemChromium.launch({
  executablePath: process.env.OD_BROWSER_EXECUTABLE_PATH
    || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 700) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1800);
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  fs.mkdirSync(outDir, { recursive: true });
  for (const y of bands) {
    const height = Math.min(bandHeight, Math.max(1, total - y));
    const { data } = await page.connection.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { x: 0, y, width, height, scale: 1 },
    }, 60_000);
    const file = path.join(outDir, `band-${y}.png`);
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    console.log(`${file} (${width}x${height} @ y=${y})`);
  }
  console.log(`scrollHeight=${total}`);
} finally {
  await browser.close().catch(() => {});
}
