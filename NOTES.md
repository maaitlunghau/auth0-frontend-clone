# auth0-clone · clone notes

## Source

- Original URL: https://auth0.com/
- Source repository: **none found**. Searched GitHub (`search/repositories` for auth0 website/marketing/homepage) with an authenticated `gh`; no public repo ships this marketing site.
- Original author: Okta, Inc. (Auth0)
- License: **proprietary, all rights reserved**. Nothing about this site is open source.
- Attribution requirement: the clone is a local study/reconstruction. See "Pre-deploy replacement list" — do not publish as-is.

## Stack (detected)

- Next.js + React (`#__next`, `/_next/` chunks), styled-components (`sc-*` class hashes)
- 102 scripts, 4 stylesheets, 0 `<canvas>`, 5 `<video>` — no WebGL/Three.js
- Self-hosted fonts from `cdn.auth0.com`: **Aeonik** (400/500) and **Aeonik Mono** (400/500) are the real UI faces; Inter / SpaceGrotesk / RobotoMono also load but are not used for the homepage body
- No smooth-scroll library (no Lenis/GSAP detected); `scroll-behavior: auto`, 0 scroll-snap rules, 4 sticky/fixed elements
- Motion comes from: an autoplaying `<video>` hero gradient, a CSS marquee, scroll-driven active state on the sticky tabber, and a timed auto-advance on the lifecycle arc

## Pre-clone assessment

- **Complexity: L4.** Content-heavy marketing page (10 151px tall at 1440) with five independent interactive systems — five mega-menus, a 4-state auto-rotating SVG arc with a B2C/B2B mode switch, a scroll-driven sticky tabber, three tab groups (industries / coding agents / resources), and a looping logo marquee. No 3D or shader work, which keeps it out of L5–L6.
- **Mode: faithful clone (忠实复刻).** The brief is "clone this website", so fidelity is the goal: real Aeonik fonts, real images and video, computed colours copied verbatim from `RECON/original-recon.json`. Brand/trademark substitution is deliberately *not* done here — it is listed below as a pre-deploy step for the owner to decide.
- **High fidelity achievable:** layout and type scale, colour system, all copy, the hero gradient video, logo marquee, stats strip, tabber, industries, code-agent tabs, customer bento, resource cards, footer, mega-menus, responsive behaviour at 1440/768/390.
- **Approximated / simplified:** the lifecycle arc's auto-advance timing curve (the original's easing is not recoverable from the DOM); the product mega-menu's "featured content" column was only partially exposed by the DOM walk; nav dropdown enter/exit easing.
- **Not cloned:** login/signup, the Okta/Auth0 dashboard, search, the OneTrust consent manager, language switching (the selector renders but does not swap content), all analytics and ad pixels (removed on purpose), and every server-side behaviour behind the marketing shell.
- **Main risks:** (1) trademark — the Auth0 wordmark, customer logos (McLaren, Siemens, CLAAS, Zapier, Cribl, PGA, Jersey Mike's, Browse AI, Recidiviz …) and customer photography are all third-party marks; (2) the hero and tabber `.webm` files are ~a few MB each; (3) the site A/B-tests its hero CTA and rotates the announcement ticker, so a pixel diff will never be 100%.

## Recon evidence

| Artefact | Path |
|---|---|
| Recon JSON + summary (frameworks, palette, fonts, resources) | `RECON/original-recon.json`, `RECON/original-summary.md` |
| Full-page screenshots 1440 / 768 / 390 | `RECON/screenshots/original-*.png` |
| Section reference bands at 1440 | `RECON/crops/band-*.png` |
| Downloaded asset map (originalUrl → localPath) | `RECON/asset-manifest.json` |
| Computed type/colour/box measurements | `RECON/measurements.json`, `RECON/measurements-2.json` |
| Page copy + DOM outline | `RECON/content-dump.json` |
| Inline SVG icon set, image intrinsic sizes | `RECON/parts.json` |
| Every tab state's real copy | `RECON/tab-states.json` |
| Lifecycle arc states (B2C + B2B) and geometry | `RECON/lifecycle.json`, `RECON/arc.json` |
| Mega-menu trees + ticker items | `RECON/nav.json` |
| Interaction probe (hover/click/scroll) | `RECON/interactions/` |
| Route map (10 routes, depth 1) | `RECON/routes/` |

## Design tokens (copied from computed values — not eyeballed)

| Token | Value | Where it came from |
|---|---|---|
| `--bg` | `#20003A` | `palette.body.backgroundColor` = `rgb(32, 0, 58)` |
| `--surface` | `#120021` | `palette.nav/footer.backgroundColor` = `rgb(18, 0, 33)` |
| `--fg` | `#FFFEFA` | `palette.body.color` = `rgb(255, 254, 250)` |
| `--fg-strong` | `#FFFFFF` | heading colour |
| `--mono-accent` | `#EBD3FF` | mono eyebrow colour = `rgb(235, 211, 255)` |
| `--accent` | `#9921FE` | `rgb(153, 33, 254)` (card gradient, footer CTA, tab progress) |
| `--accent-deep` | `#490186` | ticker border-image stop |
| `--accent-orange` | `#FF6217` | ticker border-image stop |
| `--hairline` | `rgba(255,255,255,0.33)` | card/stat/footer borders |
| Display/body face | `Aeonik, sans-serif` | `palette.*.fontFamily` |
| Mono face | `"Aeonik Mono", monospace` | eyebrow + badge computed `fontFamily` |

Type scale (all Aeonik, `letter-spacing: -1px` on display sizes): 64/72 hero + final CTA · 56/64 lifecycle h2 · 48/56 section h2 and stat values · 40/48 tabber title · 32/44 card titles · 20/28 hero sub · 18/28 w500 buttons and nav · 16/22 pills · 14/28 body · 14/20 w500 `ls 1.5px` uppercase mono eyebrows.

Grid: 1248px content column inside a 1440px viewport (96px gutters); `main` is a flex column with a 128px section gap and `banner-gradient-lg.png` as a `contain / 50% 100%` background.

## Local patches to the skill's scripts

`tools/web-clone-scripts/` is a project-local copy of the skill's `scripts/` (the staged `.od-skills/` copy is read-only). Two patches in `lib/system-browser.mjs`, both needed to get any recon at all on this host:

1. **Tiled full-page screenshots.** A single `Page.captureScreenshot` of a tall surface tore down the CDP connection ("CDP connection closed", reproduced at 1440×10151). The patch captures viewport-height bands addressed by document `y` (`captureBeyondViewport` treats clip coordinates as document coordinates) and stitches them on a scratch page's canvas. Tiles and the stitched PNG are moved one chunk per CDP message — a single multi-megabyte `Runtime.evaluate` payload also drops the websocket.
2. **Consent dismissal** behind `OD_CLONE_DISMISS_CONSENT=1`. The OneTrust modal covers the fold and poisons both the screenshots and the computed palette behind it.

All recon commands were run with `env -u OD_DAEMON_URL OD_BROWSER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"` against the system Chrome.

## Run it

```bash
python3 -m http.server 8123
# open http://127.0.0.1:8123/
```

## Pre-deploy replacement list (do this before publishing anywhere)

1. The Auth0 wordmark (inline SVG in `index.html`) and favicon — replace with your own mark.
2. Every customer logo and photo under `assets/images/cdn.auth0.com/` (`logo-*.png`, `customers-bento/*`, `mclaren-bg`, `class-bg`, industry photography).
3. All copy — it is Auth0's marketing text verbatim.
4. The hero and tabber `.webm` gradients under `assets/media/`.
5. The Aeonik / Aeonik Mono font files: licensed webfonts, not redistributable. Swap for a licensed or open face.
6. `©2026 Okta, Inc.` in the footer and all `auth0.com` outbound links.

## Changes vs the original

- All analytics, ad and heatmap tags removed (GTM, GA, LinkedIn, Twitter/X, Quora, 6sense, Bizible, AdRoll, TechTarget, StackAdapt, Heap, PubMatic, Rubicon, OpenX, Taboola, Outbrain, Tapad, TVSquared, Everest, BidSwitch, Casale, 3lift, Smart AdServer, ml314, pippio, DoubleClick).
- OneTrust cookie banner removed.
- Fonts, images and video are self-hosted from `assets/` with relative paths; nothing hotlinks `cdn.auth0.com`.
- Hero CTA is pinned to the "See it in action / Talk to an expert" variant (the original A/B-tests this slot against an email capture).
- Announcement ticker rotates a fixed set of the real messages captured in `RECON/nav.json`.
