# 022: Link previews and search

**Status:** Approved
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** website (with the publish command in deploy)
**Branch:** 022-link-previews

## Summary

Every route of the published site gets its own HTML file, with its own title, description and link-preview image. A link shared on Discord, Telegram and similar apps shows the page's preview, and search engines can read each page's content. The site gets a 404 page, a sitemap and `robots.txt`.

This spec is Part B of the draft of spec 021. It moved here unchanged when the owner approved that draft and its split on 22 November. Spec 021 keeps the publish pipeline.

## Goals and non-goals

**Goals**

- A real HTML page per route, with its title, description, canonical URL and Open Graph and Twitter tags.
- A preview image per combos page that changes whenever its screenshot changes.
- Titles that stay right after in-app navigation.
- A 404 page with a real 404 status, a sitemap and `robots.txt`.

**Non-goals**

- Per-combo pages. A combo stays `?3d=<id>` on its finish page (spec 021, Design, Per-combo pages). They come later with a share control.
- Server rendering or hydrating the React app, and JSON-LD (Design).
- Everything spec 021 owns: the publish command, data files, images, headers, credentials, backups and runbooks. Its non-goals apply here too.

## Context

- Spec 021 (Approved) deploys the website with its data files (`/data/combo-counts.json` and `/data/<kind>/<type>/<finish>.json`) from one commit, uploads images to `img.combo.skin`, and generates `_headers`. Until this spec, the site has no `404.html`, so Pages answers every path with `index.html` (spec 021, Design, Routing).
- `website/src/App.tsx` has the routes `/`, `/gloves`, `/gloves/:gloveId`, `/gloves/:itemId/:finishId/combos`, and the same for knives, with no catch-all. No page sets `document.title`, and `index.html` has one title for every page.
- `website/src/components/comboText.ts` holds the card wording (pattern seeds with the group name, floats). `src/data/catalog.json` holds 8 glove types with 94 finishes and 20 knife types with 576 finishes.
- The site's CSP (spec 021, R18) allows no inline script and `style-src 'self'`.
- The coming-soon page has a 1200 × 630 `og.jpg` made from an HTML source with Chrome.

## Requirements

- R1. Every route has its own HTML file in the deploy: `index.html`, `gloves.html`, `knives.html`, `gloves/<type>.html` (8), `knives/<type>.html` (20), and `gloves/<type>/<finish>/combos.html` (94) and the knife ones (576). That is 701 pages for today's catalog, made from the built `index.html` by a website script (`npm run prerender`) that the publish command runs. Pages serves each at its path with no trailing slash and no redirect.
- R2. Each page has its own `<title>`, `<meta name="description">`, `<link rel="canonical">` on the site origin, and Open Graph and Twitter tags (`og:site_name`, `og:type`, `og:title`, `og:description`, `og:url`, `og:image` with its width, height and type, `twitter:card`). A combos page with combos uses a 1280 × 720 JPEG made from its best-rated combo's 1920 version, at `https://img.combo.skin/og/<combo id>/<version id>.jpg`, so a changed screenshot always gets a new preview URL. The publish command makes and uploads it like the other images (spec 021, R15). A combos page without combos uses the finish's picture copy with `twitter:card` `summary`. Other pages use a site preview image (`/og.jpg`, 1200 × 630, made like the coming-soon page's, without "coming soon").
- R3. Inside `#root` each page holds plain HTML of its content until the app replaces it: the heading, the count line, and on combos pages each combo's other item, rating, pattern and float text and description, with links to the type and kind pages. All text from data (names, descriptions, pattern group names) is escaped. The page has no inline script or style.
- R4. The app sets `document.title` on every route with the same function the prerender uses, so titles match after in-app navigation.
- R5. A catch-all route shows "Page not found" with links to home, gloves and knives. `404.html` (with `noindex`) is in the deploy, so unknown paths answer 404.
- R6. Combos pages without combos, and `404.html`, carry `<meta name="robots" content="noindex">`.
- R7. `/sitemap.xml` lists home, `/gloves`, `/knives`, every type page and every combos page with combos, on the site origin. `/robots.txt` allows everything except `/data/` and names the sitemap.

## Design

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Per-combo pages (owner's choice, spec 021) | Finish pages only. A shared `?3d=<id>` link shows its finish's preview with the best combo | `/combos/<id>` pages: visitors have no way to get those links yet; they need a share control first |
| Route files | `<path>.html`, which Pages serves at `<path>` without a redirect | `<path>/index.html`: Pages redirects `<path>` to `<path>/`, which changes every URL the site has |
| Page content for crawlers | Plain HTML inside `#root`, replaced when the app mounts. No hydration | Server rendering the React app at publish time: the app touches `window`, Swiper and WebGL checks at import; a large change for content crawlers mostly read from the tags. JSON-LD: needs an inline script, so a CSP hash |
| Preview image format | JPEG 1280 × 720 from the watermarked 1920 version, keyed by combo and version | The WebP versions directly: some apps still don't show WebP previews. A 1200 × 630 crop: it can cut the watermark |
| Titles | Home "Combo Skin: CS2 knife and glove combos"; combos pages "`<type> \| <finish>`: `<n>` knife combos – Combo Skin" (or glove combos); type and kind pages "`<type>` finishes – Combo Skin" and "Gloves – Combo Skin"; a description under 160 characters naming the best-rated pairings. One TypeScript function used by the app and the prerender | Titles in the publish command's Python: two copies of the wording |
| Where the prerender lives | A website script in TypeScript, sharing the title function and `comboText.ts` with the app, run by the publish command after the build with the data folder as input | Python in `deploy/`: the wording would drift from the cards |
| Not-found pages | The app's catch-all route, with `404.html` made from `index.html` like the other pages | A separate static page: a second look to keep in step |

**Limits:** about 1,425 files per deploy with these pages, of Pages' 20,000. About 0.1 GB of preview JPEGs at 2,000 combos (spec 021, Free-tier limits).

## API / data model

No API changes. New public bucket keys: `og/<combo id>/<version id>.jpg`, `Content-Type: image/jpeg`, `Cache-Control: public, max-age=31536000, immutable`, pruned with the other images (spec 021, R17).

## Security

- S1. Text from data is escaped wherever the prerender writes it: titles, meta tags and body (R3).
- S2. Pages hold no inline script or `style` attribute, so spec 021's CSP stays as it is.
- S3. `noindex` stays on every `pages.dev` address (spec 021, R20).

## Acceptance criteria

1. `npm run prerender` (Vitest on a small catalog and data): one file per route at the paths of R1, each with the title, description, canonical and Open Graph tags of R2 and the content of R3; for today's catalog it writes 701 pages.
2. A description `<script>alert(1)</script>` and a group name `A "&" <B>` appear escaped in the title, meta tags and body; no page has an inline script or `style` attribute.
3. A combos page with combos has `og:image` `https://img.combo.skin/og/<id>/<version>.jpg` with width 1280 and height 720, and the publish uploads that JPEG; a new screenshot version gives a new URL; a page without combos uses the finish's picture, `twitter:card` `summary`, and `noindex`.
4. In-app navigation sets `document.title` to the prerendered title of the route (Vitest).
5. An unknown path renders "Page not found" (Vitest); on the preview URL, `curl -sI` of an unknown path gives 404 and of `/gloves/specialist` gives 200 with no redirect.
6. `sitemap.xml` is valid XML listing exactly the pages of R7; `robots.txt` disallows `/data/` and names the sitemap.
7. Manual: a combos page URL on the preview address, pasted in a private Discord and a private Telegram chat, shows the page's title, description and screenshot.

## Test plan

| Criterion | How it is checked |
| --- | --- |
| 1 to 6 | Vitest in `website/` (pytest in `deploy/` for the JPEG upload in 3); `curl -sI` on the preview URL for 5 |
| 7 | Manual, in Discord and Telegram |

Commands:

```bash
cd website && npm ci && npm run api:types:check && npm run lint && npm test && npm run build
cd deploy && uv sync --locked && uv run ruff check && uv run ruff format --check && uv run mypy && uv run pytest
gitleaks git --no-banner --redact
```

## Open questions

None. The owner approved this part with the rest of spec 021's draft on 22 November.

## Implementation notes

Filled in during implementation: deviations from the design and why, follow-ups discovered, and which test covers each acceptance criterion.

## Audit

Filled in by the audit: one line per acceptance criterion (pass or fail, with evidence), the results of lint, tests, build and the secret scan, and a verdict of Pass, Pass with follow-ups, or Fail.
