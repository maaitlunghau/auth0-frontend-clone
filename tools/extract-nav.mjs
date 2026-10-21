#!/usr/bin/env node
// Dump the five mega-menu trees and the announcement ticker items.
import fs from "node:fs";
import path from "node:path";
import { systemChromium } from "./web-clone-scripts/lib/system-browser.mjs";

const url = process.argv[2] || "https://auth0.com/";
const outFile = process.argv[3] || "RECON/nav.json";
process.env.OD_CLONE_DISMISS_CONSENT = "1";

const browser = await systemChromium.launch({
  executablePath: process.env.OD_BROWSER_EXECUTABLE_PATH
    || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const nav = await page.evaluate(() => {
    const norm = (v) => String(v || "").replace(/\s+/g, " ").trim();
    const header = document.querySelector("header");
    const topLevel = Array.from(header.querySelectorAll("li"))
      .filter((li) => {
        const label = li.querySelector(":scope > p, :scope > button, :scope > a");
        return label && ["Build", "Product", "Solutions", "Library", "Pricing"].includes(norm(label.textContent));
      });

    const menus = topLevel.map((li) => {
      const label = norm(li.querySelector(":scope > p, :scope > button, :scope > a")?.textContent);
      const columns = [];
      for (const title of Array.from(li.querySelectorAll("p"))) {
        const text = norm(title.textContent);
        if (!text || text === label) continue;
        const list = title.parentElement?.querySelector("ul")
          || title.nextElementSibling?.matches?.("ul") && title.nextElementSibling;
        if (!list) continue;
        const items = Array.from(list.querySelectorAll(":scope > li")).map((item) => {
          const anchor = item.querySelector(":scope > a") || item.querySelector("a");
          const img = item.querySelector("img");
          const sub = Array.from(item.querySelectorAll("li a")).map((a) => norm(a.textContent)).filter(Boolean);
          return {
            text: norm(anchor?.childNodes?.[0]?.textContent || anchor?.textContent).slice(0, 80),
            href: anchor?.getAttribute("href") || "",
            icon: img ? (img.currentSrc || img.src).split("/").pop() : "",
            external: Boolean(item.querySelector("span")?.textContent?.includes("↗")),
            sub: sub.length > 1 ? sub.slice(1) : [],
          };
        });
        if (items.length) columns.push({ title: text, items });
      }
      return { label, columns };
    });

    const ticker = Array.from(header.querySelectorAll("a"))
      .map((a) => ({ text: norm(a.textContent), href: a.getAttribute("href") || "" }))
      .filter((a) => a.text.length > 25);

    const right = Array.from(header.querySelectorAll("a, button"))
      .map((el) => ({ tag: el.tagName.toLowerCase(), text: norm(el.textContent), href: el.getAttribute("href") || "" }))
      .filter((el) => ["Login", "Sign up", "Let's connect"].includes(el.text));

    return { menus, ticker, right };
  });

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(nav, null, 1)}\n`);
  console.log(`${outFile} · ${nav.menus.length} menus · ${nav.ticker.length} ticker items`);
} finally {
  await browser.close().catch(() => {});
}
