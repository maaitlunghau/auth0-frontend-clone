#!/usr/bin/env node
// Drive the real tab/toggle controls and read what each state actually renders.
// The inactive panels are in the DOM but their copy only resolves once selected,
// so clicking is the only way to get the true content for every state.
import fs from "node:fs";
import path from "node:path";
import { systemChromium } from "./web-clone-scripts/lib/system-browser.mjs";

const url = process.argv[2] || "https://auth0.com/";
const outFile = process.argv[3] || "RECON/tab-states.json";
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

  const groups = {
    lifecycle: ["B2C", "B2B"],
    lifecycleStage: ["Sign up", "Login", "Checkout", "Agentic experience"],
    industries: ["Retail", "Financial Services", "Healthcare", "Tech & Media", "Manufacturing"],
    code: ["Claude", "Cursor", "Codex", "Antigravity"],
    resources: ["AI Future-Proofing", "Identity Security", "Product Innovation", "Customer Experience"],
  };

  const result = {};
  for (const [group, labels] of Object.entries(groups)) {
    result[group] = [];
    for (const label of labels) {
      const state = await page.evaluate(async (want) => {
        const norm = (v) => String(v || "").replace(/\s+/g, " ").trim();
        const control = Array.from(document.querySelectorAll("button, [role='tab'], a[role='button']"))
          .find((el) => norm(el.textContent).toLowerCase() === want.toLowerCase());
        if (!control) return { missing: true };
        control.scrollIntoView({ block: "center" });
        control.click();
        await new Promise((r) => setTimeout(r, 900));
        // Report the nearest section so the captured copy belongs to this tab.
        const section = control.closest("section") || control.parentElement?.closest("div")?.parentElement;
        const scope = section || document.body;
        return {
          text: norm(scope.innerText).slice(0, 1600),
          imgs: Array.from(scope.querySelectorAll("img"))
            .filter((i) => i.getBoundingClientRect().width > 10)
            .map((i) => ({ src: (i.currentSrc || i.src).split("/").slice(-2).join("/"), alt: i.alt }))
            .slice(0, 12),
          code: Array.from(scope.querySelectorAll("pre, code"))
            .map((n) => norm(n.innerText))
            .filter((t) => t.length > 10)
            .slice(0, 6),
        };
      }, label);
      result[group].push({ label, ...state });
    }
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(result, null, 1)}\n`);
  console.log(`${outFile} written`);
} finally {
  await browser.close().catch(() => {});
}
