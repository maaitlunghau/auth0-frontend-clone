#!/usr/bin/env node
// One-shot: replace the <!--SVG:name--> placeholders in index.html with the
// real inline SVG captured from auth0.com (RECON/parts.json, RECON/arc.json).
// Hard-coded brand fills are swapped for currentColor so the marks follow the
// element's text colour in every state.
import fs from "node:fs";

const parts = JSON.parse(fs.readFileSync("RECON/parts.json", "utf8"));
const arc = JSON.parse(fs.readFileSync("RECON/arc.json", "utf8"));
const file = "index.html";
let html = fs.readFileSync(file, "utf8");

const svg = (i) => parts.svgs[i].markup;
const recolor = (markup) => markup
  .replace(/fill="#1E1E1E"/gi, 'fill="currentColor"')
  .replace(/fill="#FBFBFA"/gi, 'fill="currentColor"')
  .replace(/fill="white"/gi, 'fill="currentColor"')
  .replace(/stroke="#bcbaff"/gi, 'stroke="currentColor"');

const sized = (markup, w, h) => markup
  .replace(/^<svg /, `<svg width="${w}" height="${h}" `)
  .replace(/(<svg[^>]*?)\swidth="[^"]*"([^>]*?)\swidth="[^"]*"/, "$1$2")
  .replace(/(<svg[^>]*?)\sheight="[^"]*"([^>]*?)\sheight="[^"]*"/, "$1$2");

// The arc arms: two unique sector shapes, the right-hand pair mirrored in CSS.
// The second path in each is the lit edge highlight — tag it so CSS can fade it
// in only for the active arm.
const arms = arc.sectors.map((sector, i) => {
  const markup = sector.markup
    // the lit edge is the one path without the 0.2 base opacity
    .replace(/<path d="M297\.3/, '<path class="arc-edge" d="M297.3')
    .replace(/<path d="M186\.38/, '<path class="arc-edge" d="M186.38')
    // gradient ids repeat across the four copies; keep them unique per arm
    .replace(/arc-(outer|inner)_svg__paint0_linear_\d+_\d+/g, `arcgrad${i}`);
  return `        <div class="uj-arm" data-arm="${i}" data-active="${i === 0}" aria-hidden="true">${markup}</div>`;
}).join("\n");

const navChevron = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const map = {
  "SVG:globe": recolor(sized(svg(29), 20, 20)),
  "SVG:chevron": navChevron,
  "SVG:arrow-sm": svg(5),
  "SVG:hex": svg(10),
  "SVG:arc-arms": arms,
  "SVG:claude": recolor(svg(13)),
  "SVG:cursor": recolor(svg(14)),
  "SVG:codex": recolor(svg(15)),
  "SVG:antigravity": recolor(svg(16)),
  "SVG:copy": recolor(svg(18)),
  "SVG:x": svg(26),
  "SVG:linkedin": svg(27),
  "SVG:github": svg(28),
  "SVG:icons": `<script>window.__A0_ICONS={doc:'${recolor(svg(23)).replace(/'/g, "\\'")}',play:'${recolor(svg(25)).replace(/'/g, "\\'")}'};<\/script>`,
};

let replaced = 0;
for (const [name, markup] of Object.entries(map)) {
  const token = `<!--${name}-->`;
  while (html.includes(token)) {
    html = html.replace(token, markup);
    replaced += 1;
  }
}

const leftovers = html.match(/<!--SVG:[a-z-]+-->/g);
fs.writeFileSync(file, html);
console.log(`injected ${replaced} placeholders`);
if (leftovers) console.error(`LEFTOVER placeholders: ${[...new Set(leftovers)].join(", ")}`);
