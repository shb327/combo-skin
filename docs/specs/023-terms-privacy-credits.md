# 023: Terms of Usage, Privacy Policy and Credits

**Status:** Approved
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** website (with a small export in api)
**Branch:** 023-terms-privacy-credits

## Summary

The footer links to `/terms` and `/privacy`, and neither page exists. This spec adds both, with their full text drafted here in plain English from what the site really does, and a `/credits` page that credits the pattern guides, the item data, the font, the 3D viewer's origins and the open-source code the site ships. All three pages must be merged before `combo.skin` goes live (spec 021, Going live). The texts name the operator as "Combo Skin" with a contact address, from one setting, so a legal name can be added later in one line.

## Goals and non-goals

**Goals**

- `/terms`, `/privacy` and `/credits` pages in the site's style, each with a "Last updated" date on Terms and Privacy.
- A Terms of Usage that also serves as the service's terms ("regulamin") under the Polish Act on providing services by electronic means, where that Act applies.
- A Privacy Policy that gives every item GDPR Article 13 asks for, for each kind of data the site really touches.
- A Credits page whose pattern-guide list is generated from the pattern groups' stored sources, so new groups' guides appear without editing the page.
- Guards that keep the texts true: a test that fails when the CSP gains a host the Privacy Policy doesn't name, and one that fails when a text changes without its date.
- A list of the later features that each need these texts updated before they ship.

**Non-goals**

- A cookie or consent banner. None is needed today (Design, Consent banner).
- Covering later features: our own visitor counts, Steam login, votes, ads, partner links, on-site submissions, prices. Each is named as a trigger for an update (Design, Triggers for an update), not covered.
- A Polish translation of the texts (Honest limits).
- The 3D viewer's own repository: any notice or page on `view.combo.skin` itself is that repository's work. Serving the viewer's licences on `view.combo.skin` is a follow-up for that repository (Design, ChainSkins credit).
- Legal advice. These texts are a careful draft by the owner, not a lawyer's opinion (Honest limits).

## Context

The site, checked against the code on `main` at the merge of spec 021's publish fixes:

- `website/src/App.tsx`: routes for `/`, `/gloves`, `/knives`, their type pages and combos pages. No `/terms`, `/privacy` or `/credits`, and no catch-all (spec 022 adds one).
- `website/src/components/Footer.tsx`: links to `/terms` ("Terms of Usage") and `/privacy` ("Privacy Policy"), which today fall through to an empty `<main>`. It also shows "Powered by Steam.", "Not affiliated with Valve Corp." and "2026 @ CHOOSE, LLC." (Design, Footer).
- `website/src/pages/Home.tsx`: three `mailto:` cards, `bugs@combo.skin`, `combos@combo.skin` ("Submit a Combo") and `partners@combo.skin`. The About text says the site is a solo project seeking partnerships with marketplaces and creators, with "price integrations" on the roadmap. No form posts anywhere: the CSP has `form-action 'none'`.
- `website/src/staleChunks.ts`: after a new deployment, a page from the old one that fails to load a code chunk reloads once. It writes one `sessionStorage` entry, `combo-skin:reloaded-for-a-missing-chunk`, holding a timestamp, only when that happens. This is the site's only browser storage. `website/src` has no `localStorage`, `IndexedDB`, Cache API, service worker or `document.cookie` use.
- `website/src/api/images.ts`: screenshots load only from `img.combo.skin`. Catalog pictures load from our copies there, and if one fails, once from the game's host `https://community.akamai.steamstatic.com`. Images are sent with no referrer (`website/README.md`).
- `website/src/viewer/`: "View in 3D" opens a window that frames the viewer's `/combo` embed from `view.combo.skin` (`sandbox="allow-scripts allow-same-origin"`), which downloads the game assets from `assets.combo.skin`. The frame is created only when the visitor clicks "View in 3D". On a phone, a touch-first device or with Save-Data on, and for a window opened from a shared link, it first asks for a click on "Load 3D view", with the note "The 3D view downloads about 34 MB" on phones and Save-Data (`webgl.ts`, `state.ts`). On a desktop, the click on "View in 3D" itself starts the download.
- The viewer's `/combo` embed (its own repository) stores nothing in the browser: its page and the code it loads use no `localStorage`, `sessionStorage`, `IndexedDB` or Cache API. The viewer's standalone pages on `view.combo.skin` (the full viewer, Inspect, share) do keep the visitor's own settings in `localStorage` under `3dviewer:` keys (lighting, view model, render quality, loadout, inspect history, panel state). Its CSP allows scripts only from itself and connections only to itself and `assets.combo.skin`, so it loads no analytics and no other host.
- `website/src/index.css`: Montserrat 400 to 700 is bundled from `@fontsource/montserrat`; no request goes to Google Fonts. The viewer's `font-src` is `'self'` too.
- The CSP (spec 021, R18; `deploy/tests/golden/_headers`): `script-src 'self' https://static.cloudflareinsights.com`, `connect-src 'self' https://cloudflareinsights.com`, `img-src 'self' https://img.combo.skin https://community.akamai.steamstatic.com`, `frame-src https://view.combo.skin`, `font-src 'self'`, `Referrer-Policy: strict-origin-when-cross-origin`. `website/index.html` holds no analytics script: Cloudflare adds Web Analytics' script at its edge when it is turned on for the Pages project. Spec 021's Going live runbook turns it on for the new project (`deploy/README.md`, step 4). The coming-soon page has it on today.
- Hosting (spec 021): the site and its data files are static files on Cloudflare Pages at `combo.skin`; images on a public R2 bucket at `img.combo.skin`; the viewer on Pages at `view.combo.skin`; its assets on R2 at `assets.combo.skin`. The dashboard, API, database and screenshot worker run on the owner's own computer and are never on the internet. No accounts, login, forms, comments, payments or ads.
- `api/src/combo_api/patterns/groups.json` (spec 020): 13 knife pattern groups; each has `sources`, a list of `{title, author, url, checked}`. 12 groups have sources, some shared between groups; Piss & Ice has none (the owner's own picks). The import (`python -m combo_api.patterns import`) copies sources into the `pattern_groups` table and never removes anything, so the file is the source of truth. Sources are returned only by the admin route `GET /admin/pattern-groups`; public combo items carry only `pattern_group: {slug, name}`.
- `api/src/combo_api/catalog/export.py`: the precedent for generated website data. `python -m combo_api.catalog export-website [--check]` writes `website/src/data/catalog.json` and `agents.json`, and the api workflow fails on a stale copy.
- `THIRD_PARTY_NOTICES.md`: Valve's item data and images, ByMykel/CSGO-API (MIT; the catalog), SecLists (MIT; the admin's password list, not shipped to the site) and Montserrat (SIL OFL 1.1). It does not list the npm packages the website's bundle contains (React, React Router, TanStack Query, Swiper, lucide-react, react-icons and their dependencies), whose licences ask for their notice to go with copies.
- The viewer's repository credits the ChainSkins 3D Viewer (MIT), which it started from, and ValveResourceFormat (MIT), which its asset pipeline uses.
- Spec 022 (Approved, not started): one prerendered HTML file per route, with its title, description, canonical and Open Graph tags and its content as plain HTML in `#root`; a `document.title` function shared by the app and the prerender; `sitemap.xml` and `robots.txt`.
- The website has Vitest, ESLint and a build (`website/package.json`); the api has pytest, ruff and mypy.
- Email: on 24 November `combo.skin` has no MX records, so none of the four addresses receive mail yet. The owner is setting up Cloudflare Email Routing to forward `bugs@`, `combos@`, `partners@` and `privacy@combo.skin` to a personal Gmail mailbox. `deploy/README.md`'s Going live runbook has no email step.

**Corrections to the brief.** Three points differ from what the code does, and the texts below follow the code: the 3D frame loads on the click on "View in 3D", and "Load 3D view" is an extra step only on phones, Save-Data and shared links; the viewer's standalone pages do use `localStorage` (the embed the site frames does not); and the footer names "CHOOSE, LLC", which is not the operator.

## Requirements

**Pages**

- R1. `/terms`, `/privacy` and `/credits` each render their page inside the site's app bar and footer. The footer's two links reach their pages. The footer's last line reads "© 2026 Combo Skin" (the name from `OPERATOR.name`), "Powered by Steam." is gone, and "Not affiliated with Valve Corp." and the two links stay as they are.
- R2. Terms and Privacy show a "Last updated" date under their heading, in a `<time>` element with an ISO `dateTime`, written as "24 November 2026".
- R3. The Terms of Usage page shows exactly the text of Design, The Terms of Usage, with the operator settings filled in. Its "Who owns what" section links to `/credits`.
- R4. The Privacy Policy page shows exactly the text of Design, The Privacy Policy, with the operator settings filled in.
- R5. The Credits page shows the sections of Design, The Credits page: pattern guides, item data, the game, the font, the 3D viewer, open-source software and licence texts.
- R6. Every heading inside a document has a stable `id`, so a section can be linked (`/privacy#emails`).
- R7. The pages work without JavaScript once spec 022's prerender is in place: the full text of each document is in its prerendered HTML.

**Operator settings**

- R8. One module, `website/src/legal/operator.ts`, holds the operator's public name ("Combo Skin"), an optional legal identity (`null` today), the contact address and the country. Both documents and the Credits page read only from it. Setting the legal identity to a name and address shows "Combo Skin is run by <name>, <address>" in both documents, and nothing else needs to change.
- R9. The contact address in both documents is `privacy@combo.skin`. It and the site's three other addresses receive mail before go-live (criterion 14).
- R18. `deploy/README.md`'s Going live runbook gains a step before the domain moves: "Send a test email from an outside address to each of `bugs@`, `combos@`, `partners@` and `privacy@combo.skin`, and check each arrives in the mailbox." Going live stops if one doesn't.

**Credits data**

- R10. `uv run python -m combo_api.patterns export-website` writes `website/src/data/pattern-guides.json` from `groups.json`: every distinct guide (by URL), in the order of first appearance, with its title, author, URL and the names of the groups it informs. Groups without sources are not listed. `--check` exits 1 when the committed file is stale, and the api workflow runs it.
- R11. The Credits page lists every guide in `pattern-guides.json` with its title, its author as the guide shows it, a link to it, and "Used for: Blue Gem, Gold Gem". A new group's guide appears after the next export with no change to the page's code.
- R12. The build writes `/licences.txt` into the deploy: for every npm package with code in the bundle, its name, version, licence and full licence text, from the package's own files. The Credits page links to it.
- R13. The licence texts the Credits page shows for CSGO-API and Montserrat are the same as their blocks in `THIRD_PARTY_NOTICES.md`.

**Keeping the texts true**

- R14. A website test fails when the CSP in `deploy/tests/golden/_headers` names a host the Privacy Policy doesn't list in its hosts section, naming the host.
- R15. A website test fails when the text of the Terms or the Privacy Policy changes and its "Last updated" date does not, naming the document.
- R16. Nothing on the three pages loads from another host. The CSP stays exactly as spec 021 set it.

**Spec 022**

- R17. When spec 022's prerender exists, it writes `terms.html`, `privacy.html` and `credits.html` with the titles and descriptions of Design, Titles, the site preview image, and the document's text in `#root`; `sitemap.xml` lists all three. Whichever of the two specs is implemented second does this, and the other's tests cover it.

## Design

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Operator name (owner's choice) | "Combo Skin" with a contact address, from one setting with an optional legal identity (R8). The risk is spelled out in Operator identity below | The owner's full name now: the most compliant, but the owner chose not to yet. A company name: there is no company |
| Footer (owner's choice) | "© 2026 Combo Skin" in place of "2026 @ CHOOSE, LLC.", which names a company that doesn't exist; "Powered by Steam." dropped, as the site uses no Steam service and Valve's Steam Web API Terms forbid implying endorsement; "Not affiliated with Valve Corp." and the two links kept | Keeping the footer as it is: it contradicts the operator named in both texts |
| Contact address (owner's choice) | `privacy@combo.skin`, one address for privacy, legal questions and complaints | `bugs@`: mixes bug reports with rights requests, which have a one-month deadline. A personal mailbox: shows the owner's name |
| Where the texts live | TypeScript data in `website/src/legal/` (`terms.ts`, `privacy.ts`): a document is a title, a date and sections of paragraphs, lists and links. One `LegalDocument` component renders them, and spec 022's prerender renders the same data to HTML | Markdown files: needs a parser package and an HTML sanitiser. Text written straight into JSX: the prerender can't reuse it, and the date test can't hash it |
| Credits data for guides | A generated `website/src/data/pattern-guides.json`, written by an api command with `--check` in CI, as the catalog does (R10) | Importing `groups.json` into the website: crosses into the api's files and needs Vite's file-system allow list widened. A public API route and a publish data file: an API route, an export step and a fetch for data that changes only with a commit. Reading the database at publish: the file is already the source of truth |
| Groups without sources | Not listed. Their seeds are the owner's picks, credited to no one | "Picked by Combo Skin" lines: credit to ourselves on a credits page |
| Open-source notices | A build step writes `/licences.txt` from the packages actually in the bundle (R12), a small Vite plugin in `website/scripts/` with no new dependency | A hand-kept list: goes stale with every dependency bump. A licence plugin package: a new dependency for 40 lines. Nothing: MIT and ISC ask for their notice with copies, and the bundle is a copy |
| Licence texts on Credits | CSGO-API's MIT and Montserrat's OFL in `<details>` blocks, from `.txt` files imported with Vite's `?raw`, tested against `THIRD_PARTY_NOTICES.md` (R13) | Linking to the repository's notices file: links the site to the owner's GitHub account, which the operator choice avoids |
| ChainSkins credit (owner's choice) | Credited on Credits, with ValveResourceFormat, under "3D viewer". MIT asks for its notice in copies of the code, which the viewer's bundle on `view.combo.skin` is; serving those licences there is a follow-up for the viewer's repository, not this spec | Leaving it to the viewer's repository: the visitor sees the viewer only through combo.skin |
| Credit on cards ("pattern from <guide>") (owner's choice) | No. The Credits page covers every guide | A link on each special-pattern card: long, repeated on every card, and spec 020 decided against credits on cards |
| Email (owner's choice) | Cloudflare Email Routing forwards the four addresses to a personal Gmail mailbox. The Privacy Policy names both: Cloudflare as processor, Google as the mailbox's provider under its own terms. Moving to a paid mailbox with a data processing agreement is a trigger before the site earns anything | A paid mailbox now: a monthly cost before any income. Leaving the provider unnamed: Art. 13(1)(e) asks for recipients |
| Terms → Credits link | One line in "Who owns what". Privacy doesn't link to Credits | A footer link: the footer keeps only its two links. Both documents: Privacy is about data, not credit |
| Language | English, the site's language | Polish too: a second text to keep in step; see Honest limits |
| Previous versions | Kept in the repository's history; the texts say "ask us for an earlier version" | A versions page: one more page for a text that changes rarely |
| External links | Same tab, `rel="noreferrer"` | New tabs: the site opens nothing in new tabs today |

### Layout

The site's dark style: the page gutters of the other pages (`px-4 md:px-16 lg:px-44`), the text column at most `68ch` wide, the heading `text-3xl md:text-5xl font-bold text-white` as the home page's, the date in `text-white/50 text-sm`, section headings `text-xl font-semibold text-white` with `mt-10`, body `text-white/80 leading-relaxed` with `space-y-4`, links in the accent colour with an underline. Lists are plain bullets. The Privacy Policy opens with a short contents list of its sections (anchor links, R6). On a phone the text is one column with the 16 px gutter; no horizontal scroll. No images, no inline `style`, no inline script (spec 022, S2).

### Titles

Following spec 022's wording:

| Page | Title | Description |
| --- | --- | --- |
| `/terms` | Terms of Usage – Combo Skin | The rules for using Combo Skin, a free fan site of CS2 knife and glove combos. |
| `/privacy` | Privacy Policy – Combo Skin | What data Combo Skin's site touches, why, for how long, and your rights. |
| `/credits` | Credits – Combo Skin | The pattern guides, item data, font and open-source code behind Combo Skin. |

### Operator identity

The owner runs the site alone from Poland, not as a registered business, and chose to name the operator "Combo Skin" with a contact address, not a personal name. What the law expects, and the risk:

- **GDPR.** The owner is the controller: the natural person who decides why and how the data is processed (Art. 4(7)). The household exemption (Art. 2(2)(c)) doesn't apply: a public website is open to anyone, which the Court of Justice held is not a purely personal activity (Lindqvist, C-101/01), and the owner plans to earn from it. Art. 13(1)(a) asks for "the identity and the contact details of the controller". A brand name plus an email gives contact details but arguably not identity: a visitor can't tell who is responsible. A supervisory authority could treat that as an incomplete notice. Art. 27 (a representative in the EU) applies only to controllers outside the EU, so not here. No data protection officer is required (Art. 37: no large-scale monitoring or special categories).
- **The Polish Act on providing services by electronic means (UŚUDE).** Its duties fall on a "service provider", defined in Art. 2(6) as one who provides electronic services while running, even as a side line, a gainful or professional activity. The test is earning, not registration: unregistered activity (in 2026, up to 225% of the minimum wage a quarter) still counts. Today, with no income, the owner arguably isn't one, so Art. 5 (provider information) and Art. 8 (terms) arguably don't bind yet. Once the site earns anything (ads, partners, affiliate links), Art. 5(2) asks for the provider's electronic addresses and, for an individual, their first name, surname, place of residence and address, given clearly and directly reachable on the site (Art. 5(1)). A brand name won't meet that, and Art. 23 makes leaving them out a petty offence punishable by a fine.
- **Risk of the choice.** Today: low. GDPR's transparency guidance (WP260) expects information that allows "easy identification of the controller", so a brand name alone is arguably incomplete. The likely consequence of a complaint is an order to complete the notice, not a fine, and the texts give a working contact and every other Art. 13 item. From the first income: real, as Art. 5 UŚUDE plainly asks for the name and address, with a fine for leaving them out. So the legal identity setting (R8) must be filled in before the site earns anything (Triggers for an update). A business address or a virtual office can stand in for a home address once there's a registered business.
- **Writing it as a setting.** `operator.ts` has `name: 'Combo Skin'`, `legalIdentity: null` (later `{ name, address }`), `email: 'privacy@combo.skin'`, `country: 'Poland'`. The texts say "Combo Skin is run by one person in Poland" while `legalIdentity` is `null`, and "Combo Skin is run by <name>, <address>, Poland" once it's set. Setting it puts the name in the public repository, by design.

### Consent banner

**Not needed today.** The site sets no cookies (criterion 13 checks every host's responses), stores nothing that isn't strictly necessary, and runs no ads or third-party trackers.

- The rule is Art. 5(3) of the ePrivacy Directive, in Poland Art. 399 of the Electronic Communications Law (Prawo komunikacji elektronicznej, in force since 10 November 2024): storing information on, or gaining access to information in, a visitor's device needs consent, unless it is strictly necessary to provide the service the visitor asked for (or only to carry a transmission). It covers any technology, not only cookies: `localStorage`, `sessionStorage`, and scripts that read device information (EDPB Guidelines 2/2023).
- The `sessionStorage` flag is strictly necessary: it exists only to recover a page the visitor asked for after a new deployment, is written only when that fails, holds no identifier, never leaves the browser and is gone when the tab closes.
- The viewer's standalone pages keep the settings a visitor chooses there in `localStorage`. The Article 29 Working Party's opinion on the exemption (WP194, 3.6) treats user-interface customisation as exempt for a session or slightly longer, and persistent customisation as defensible when the visitor chose it and is told. The settings are the visitor's own choices and never leave the device, and the Privacy Policy discloses them. These are pages of the viewer, not of `combo.skin`.
- Cloudflare Web Analytics sets no cookie and stores nothing on the device (no cookies, `localStorage`, `sessionStorage` or IndexedDB), and Cloudflare drops the IP at the nearest data centre. Its script does read page-load timings and the page address and send them to Cloudflare. The EDPB's guidelines put tracking pixels and scripts that have the browser send information in scope, WP194 (4.3) says first-party analytics are not exempt, and Polish law has no analytics exemption. This is the one judgement call (Honest limits). The texts disclose it, its data is aggregated and not used to identify anyone, and if a lawyer or UODO reads it the strict way, the fix is to turn Web Analytics off and keep Cloudflare's zone traffic numbers, which come from the edge with no script. The owner's choice: Web Analytics goes on at go-live as planned, with no banner, and this stays listed as a judgement call.
- Cloudflare's documentation says that on Free plans its automatically injected beacon leaves out visitors from the EEA, the UK and Switzerland by default. If that holds for Web Analytics on a Pages project, EU visitors aren't measured at all, and the judgement call shrinks to visitors elsewhere. Going live checks which applies (criterion 13), and the Privacy Policy's statistics section says it.

**What would make a banner necessary later:** any cookie or storage that isn't strictly necessary (a visitor ID, an A/B test, "remember me" beyond a login session); any ad network or affiliate tracker; analytics that store an identifier or a hashed IP across visits; a third-party embed (YouTube, Twitch, Discord, social buttons); marketing pixels; a chat widget. Steam login's own session cookie would be strictly necessary and need no banner, but its disclosure would.

### Triggers for an update

Each of these needs both documents reviewed, and the CSP test (R14) catches most of them mechanically:

| Change | What it adds to the texts |
| --- | --- |
| Our own visitor counts (a Worker with Analytics Engine or D1) | A new processing row: what is counted, whether IPs or hashes are kept and for how long; a banner if anything identifies a visitor across visits |
| Steam login | Steam ID and profile data from Valve (Art. 14 items for data from another source), a session cookie, account deletion, a longer retention table |
| Votes | Stored votes tied to a Steam ID, abuse prevention, retention |
| On-site combo submissions | A form (the CSP's `form-action` changes), stored submissions, a licence for submitted text and images with the fields of use Polish copyright law asks for. Storing visitors' content makes the site a hosting service under the Digital Services Act (Art. 3(g)), with its duties: points of contact (Arts. 11 and 12), notice and action (Art. 16), reasons for removals (Art. 17). Today the site hosts only its own content, so the DSA doesn't reach it |
| Before any income | Move the four addresses from the personal Gmail mailbox to a paid mailbox with a data processing agreement (for example a business plan of the same provider), and rewrite the email recipients and transfer lines of the Privacy Policy |
| Ads or partner and affiliate links | The legal identity (Operator identity), the paid mailbox (the row above), an ad network as a recipient, almost certainly a consent banner, labelling of paid content, and UŚUDE in full |
| Prices or market integrations | A third party as a recipient, and the "not advice" section rewritten around prices |
| Newsletters or any marketing email | Prior consent to commercial information (Electronic Communications Law, Art. 398, which replaced UŚUDE Art. 10), labelling as UŚUDE Art. 9 asks, unsubscribe |
| Registering a business | The legal identity, the business's registry details, possibly a Polish version |
| Any new host in the CSP | The hosts section of the Privacy Policy (R14) |

### The Terms of Usage

Placeholders in angle brackets come from `operator.ts` or the document's date. "Combo Skin" is `name`.

> # Terms of Usage
>
> Last updated: \<date\>
>
> ## What Combo Skin is
>
> Combo Skin (combo.skin) is a free website with ideas for pairing knife and glove skins in Counter-Strike 2. It shows each pairing as a screenshot and in a 3D view, with a rating, a short description and example patterns and floats. Combo Skin is run by one person in Poland. \<Or, once set: Combo Skin is run by \<name\>, \<address\>, Poland.\>
>
> These terms are the rules for using the site. By using it you agree to them. If you don't agree, please don't use the site.
>
> ## What you can do here
>
> - Browse knife and glove finishes and the combos we've put together.
> - Look at a combo in 3D in your browser.
> - Email us: to report a bug (bugs@combo.skin), to suggest a combo (combos@combo.skin), about working together (partners@combo.skin), or about privacy, these terms or a complaint (\<email\>).
>
> All of it is free. There are no accounts, nothing to sign up for and nothing to cancel: you start using the site when you open a page and stop when you leave.
>
> ## What you need
>
> A recent version of a common browser (such as Chrome, Firefox, Safari or Edge) with JavaScript turned on, and an internet connection. The 3D view also needs WebGL 2 and downloads about 34 MB the first time you open it. To email us, you need an email account.
>
> ## Not advice
>
> Skins can be worth real money. Nothing on Combo Skin is investment, financial or trading advice.
>
> - Ratings and descriptions are our opinion of how a pairing looks.
> - Patterns and floats are examples. "Blue Gem · 387" means one example pattern for that knife, not that every item with that number looks the same or is worth the same.
> - Screenshots and the 3D view are our renders. A real item can look different in the game, in other light or at another wear.
> - We don't show prices, and we don't say what any item is worth, will be worth, or where it's available.
>
> Before you buy, sell or trade, check the item yourself, for example by inspecting it in the game, and use a marketplace you trust. Decisions you make with what you find here are yours.
>
> ## Valve
>
> Combo Skin is a fan site. It is not affiliated with, endorsed by or sponsored by Valve Corporation. Counter-Strike, Counter-Strike 2, Steam, and the names and images of in-game items belong to Valve Corporation. We use them only to show which items a combo is made of.
>
> ## Stay safe
>
> Combo Skin will never ask for your Steam login, your password, a Steam Guard code or an API key, and never sends trade offers. Anyone who does, using our name, isn't us. Be careful with look-alike websites and links in messages.
>
> ## Who owns what
>
> The game's item names, images and models belong to Valve. Everything else on the site that we made is ours: the text, ratings, descriptions, the choice and arrangement of combos, and our screenshots and renders, as far as our own work goes. Some of what the site uses comes from others, and we credit it on our [Credits](/credits) page.
>
> You're welcome to share links to Combo Skin and to share a screenshot of a page, for personal, non-commercial use, with a link back. Please don't copy the site's content or combo collection wholesale, or republish it as your own.
>
> ## Fair use of the site
>
> Please don't:
>
> - attack the site or the services it runs on, try to break in, or overload them;
> - scrape or download the site in a way that slows it down for others, or to copy its collection; light automated access that follows our robots.txt is fine;
> - use the site to break the law or anyone's rights;
> - send us anything unlawful, such as malware, content that infringes someone's rights, or other people's personal data.
>
> If you find a security problem, tell us at bugs@combo.skin. We're grateful for reports and won't pursue anyone who reports in good faith and doesn't harm the site or its visitors.
>
> ## Other websites
>
> The site links to other websites, such as the pattern guides on our Credits page, and some pictures can load from Steam's image servers. We don't run those websites and aren't responsible for them. Their own terms and privacy policies apply.
>
> ## Combo ideas you send us
>
> You can suggest a combo at combos@combo.skin. A pairing of two skins is an idea, and ideas belong to no one: someone else may suggest the same pair, and we may already have it.
>
> If we feature your idea, we make our own screenshot and write our own text. We won't publish your pictures, your words or your email address without asking you first. By sending a combo, you agree that we may use the idea on the site and in posts about the site, free of charge.
>
> If you'd like credit, tell us the name to use, such as your Steam name, and we'll credit you on our Credits page when we feature your idea. You can ask us to change or remove that credit at any time. We don't promise to feature every idea or to reply to every email.
>
> ## No guarantees
>
> We offer Combo Skin for free, as it is. We work to keep it accurate and online, but we make mistakes, and we may change, remove or stop any part of the site at any time.
>
> ## Liability
>
> We aren't liable for losses that come from decisions you make with what you find here, such as a trade, from the site being unavailable, or from other websites.
>
> None of this limits liability for harm we cause on purpose or through gross negligence, for death or personal injury, or any other liability the law doesn't let us limit. If you're a consumer, none of these terms takes away rights you have under the law of the country you live in.
>
> ## Complaints
>
> If something on the site doesn't work as these terms describe, or you have a complaint, email \<email\> with what happened and how we can reach you. We'll reply within 14 days.
>
> ## Changes to these terms
>
> We may change these terms, for example when we add a feature. The date at the top shows the latest version, and it applies from that date. When a change matters to you, we'll say so on the site for at least 30 days. If you don't agree with a new version, please stop using the site. We keep earlier versions: ask us for one.
>
> ## Law and courts
>
> Polish law governs these terms. If you're a consumer living in another country, you keep the protection of the rules of that country that can't be set aside by agreement, and you can take a claim to the courts where you live. Otherwise, the courts of Poland decide disputes.
>
> ## Contact
>
> \<email\>

**Where each part comes from:**

| Section | Why it is there |
| --- | --- |
| What you can do here | UŚUDE Art. 8(3)(1): the kinds and scope of services. Art. 8(3)(3): how the agreement starts and ends |
| What you need | Art. 8(3)(2)(a): technical requirements |
| Fair use | Art. 8(3)(2)(b): the ban on supplying unlawful content |
| Complaints | Art. 8(3)(4): a complaints procedure. 14 days is the period in which a trader must answer a consumer's complaint (Consumer Rights Act, Art. 7a); no statute fixes it for a free, non-commercial service |
| Stay safe | Art. 6(1): the particular risks of using electronic services. Skin scams through fake sites and fake staff are the real risk here |
| Not advice | Skins have real-money value; the site's ratings and examples must not read as valuations |
| Valve | Trademark notice, in the terms themselves as the owner asked; the footer's short line stays |
| Combo ideas | Polish copyright law protects the expression, never the idea (Copyright Act, Art. 1(2¹)), so a pairing can be used without a licence. Publishing a sender's own pictures or words would need a licence that names its fields of use (Art. 41(2)), which is why the text promises to ask first. Credit is opt-in and revocable |
| Liability | A free service can disclaim a lot, but not: intentional harm (Civil Code Art. 473 §2); harm to a consumer's person, or a material limit on liability for non-performance (Art. 385³ points 1 and 2, the "grey list" of terms presumed unfair, after Directive 93/13/EEC Annex points (a) and (b)). Gross negligence is carved out too: the safer reading of point 2, since Polish doctrine treats gross negligence close to intent. An unfair term doesn't bind the consumer (Art. 385¹), so a blanket "no liability" would simply fall away |
| Changes | A change can't be imposed without a valid reason (Art. 385³ point 10); a dated version, a notice for changes that matter, and no change to past use is the fair version for a service without accounts |
| Law and courts | Rome I (Reg. 593/2008) Art. 6(2): a choice of law can't take away the consumer's mandatory protection at home. Brussels I bis (Reg. 1215/2012) Art. 18: a consumer may sue at home. A clause naming one Polish city's court for consumers would be on the grey list (Art. 385³ point 23) |

**What UŚUDE asks, and what is uncertain here.** The current text is Dz.U. 2024 poz. 1513, as amended by the Act of 4 September 2026 (Dz.U. 2026 poz. 1296, in force 6 November 2026), which implements the Digital Services Act: it repeals the Act's old liability chapter (Arts. 12 to 15, now DSA Arts. 4 to 6) and makes the President of UKE the Digital Services Coordinator. Arts. 5, 6, 7, 8 and 9 stand. Art. 7 (a user can stop using the service at any time, free) is met by a site without accounts. Art. 8(1) asks for the terms to be available free before the agreement, in a form that can be saved and printed, which a public page is. What is uncertain:

- whether the owner is a "service provider" at all before any income (Operator identity);
- whether a free site with no registration forms an "agreement to provide services by electronic means" (the usual reading of Art. 8 says yes, from the first page view; no official source settles it);
- whether the consumer rules apply at all: the Civil Code's consumer is a person dealing with a business (Art. 22¹), and Rome I Art. 6 and Brussels I bis Art. 17 also need a trader or one directing commercial activities. While the owner earns nothing, the unfair-terms rules arguably don't reach these terms. They're written as if they did, because income will change that;
- whether Directive 2019/770 on digital content (in Polish law, the Consumer Rights Act's chapter 5b) applies. It covers services "paid for" with personal data, but not data processed only to provide the service or to meet legal duties (Art. 3(1); recital 25 leaves out mere device and browsing metadata), which is all the site processes.

The texts are written to hold whichever way these fall: they already include everything Art. 8 lists.

### The Privacy Policy

> # Privacy Policy
>
> Last updated: \<date\>
>
> ## In short
>
> Combo Skin has no accounts, no forms, no ads and no cookies, and doesn't sell or share data for advertising. Like every website, the services that deliver it see your IP address when you visit. If you email us, we have what you send. This policy explains each of these: what, why, on what legal basis and for how long.
>
> ## Who is responsible
>
> The controller of your personal data is Combo Skin, run by one person in Poland. \<Or, once set: \<name\>, \<address\>, Poland, who runs Combo Skin.\> Contact: \<email\>.
>
> We don't have a data protection officer, as the law doesn't require one for a site like this.
>
> ## When you visit the site
>
> Combo Skin is a set of static files served by Cloudflare from these addresses: combo.skin (the site), img.combo.skin (screenshots and pictures), view.combo.skin (the 3D viewer) and assets.combo.skin (the 3D viewer's files). Like any web server, Cloudflare receives with each request your IP address, the date and time, the address asked for, what your browser reports about itself (its name, version and operating system), the address of the referring page (on our site, only its domain), and the approximate location that follows from your IP address.
>
> - **Why:** to deliver the pages you ask for, and to protect the site from attacks and abuse.
> - **Legal basis:** our legitimate interest in running a working, secure website (Article 6(1)(f) GDPR).
> - **How long:** we keep no request logs ourselves. We see only totals in Cloudflare's dashboard, such as the number of requests per day and per country. Cloudflare says it keeps visitors' IP addresses only for a limited time, if at all (see Who receives data).
>
> ## Visitor statistics
>
> We use Cloudflare Web Analytics to see which pages are visited. It doesn't use cookies, doesn't store anything on your device, doesn't fingerprint your browser and doesn't follow you to other sites. When a page loads, its script sends Cloudflare the page's address, the referring page, page-load timings, and your browser, operating system and device type. Cloudflare uses your IP address only to tell the country and drops it at the data centre nearest you. Query strings in page addresses aren't recorded. We see only totals. \<If going live confirms it: Cloudflare leaves out visitors from the EEA, the UK and Switzerland by default, so if you're there, your visits aren't counted.\>
>
> - **Why:** to learn which pages are useful and how fast the site is.
> - **Legal basis:** our legitimate interest in understanding how the site is used (Article 6(1)(f) GDPR).
> - **How long:** Cloudflare keeps the detailed records for 7 days; after that, only a sample remains for the longer-term charts.
>
> ## Pictures from Steam
>
> We show our own copies of the game's item pictures. If one of ours fails to load, your browser loads that picture once from Steam's image server instead (community.akamai.steamstatic.com, run for Valve over Akamai's network). That server then receives your IP address, your browser's name and version and which picture was asked for, but not which of our pages you were on.
>
> - **Why:** so the page still shows the item when our copy fails.
> - **Legal basis:** our legitimate interest in showing complete pages (Article 6(1)(f) GDPR).
> - **Who decides:** Valve, as an independent controller, under its own privacy policy. We receive nothing from it.
>
> ## When you email us
>
> If you write to bugs@, combos@, partners@ or \<email\>, we receive your email address, your name if you include it, your message and anything you attach.
>
> - **Why:** to answer you, fix what you report, consider your combo, credit you if you ask, discuss working together, and handle requests about your data.
> - **Legal basis:** our legitimate interest in answering messages sent to us (Article 6(1)(f) GDPR); for partnership talks, steps you ask for before an agreement (Article 6(1)(b)); for requests about your data, our legal duty to answer them (Article 6(1)(c)).
> - **How long:** up to 12 months after our last message to each other. A name you asked us to credit stays for as long as the credited combo is on the site. If an email leads to an agreement, we keep what the law requires us to keep, such as for tax.
> - Emailing us is up to you; nothing on the site needs it. Please don't send us sensitive information, or anyone else's personal data.
>
> For each legitimate interest named here, you can ask us for the balancing of our interest against your rights.
>
> ## What the site stores in your browser
>
> No cookies. The site stores one thing, and only sometimes: if we've published a new version while your page was open and the page can't load a part of itself, it reloads once and notes that in your browser's session storage (a key starting with "combo-skin:"), so it can't reload in a loop. The note is deleted when you close the tab, and it never leaves your browser. The law allows this without asking, as it's strictly necessary for the page you asked for.
>
> The 3D view inside combo.skin stores nothing in your browser. If you open the 3D viewer directly at view.combo.skin, it remembers the settings you choose there, such as lighting and the items you picked, in your browser's local storage, so they're there next time. That stays on your device; you can clear it in your browser's settings.
>
> Your browser also keeps its usual cache of the files it downloaded, such as pictures and the 3D view's files, so they load faster next time.
>
> ## Who receives data
>
> - **Cloudflare, Inc.** delivers the site, the images and the 3D viewer, and runs Web Analytics, as our processor under its Data Processing Addendum, which is part of our agreement with Cloudflare. Cloudflare has servers around the world, and a request is usually handled at the one nearest you. Cloudflare publishes the list of its own sub-processors.
> - **Cloudflare** also receives the email you send to our combo.skin addresses and forwards it to our mailbox (Cloudflare Email Routing), as our processor.
> - **Google** provides that mailbox (Gmail). For now it's a personal Gmail account, so Google handles the email in it under its own terms and privacy policy, not under a processing agreement with us. For accounts in the EEA, that's Google Ireland Limited. We'll move to a mailbox with a processing agreement before Combo Skin earns anything.
> - **Valve Corporation** receives your request when a picture loads from Steam's image server, as an independent controller (see Pictures from Steam).
>
> We don't sell personal data, don't share it for advertising and don't give it to anyone else, unless the law requires it.
>
> ## Data outside the European Economic Area
>
> Cloudflare is based in the United States and may handle a request, or store our images, outside the EEA. It is certified under the EU-US Data Privacy Framework, which the European Commission has found to give adequate protection, and its Data Processing Addendum includes the European Commission's Standard Contractual Clauses as well, should the Framework lapse. You can ask us for a copy of these safeguards. Google may handle email in the mailbox outside the EEA, under its own terms and safeguards. Valve, also in the United States, handles the picture requests under its own policy.
>
> ## Your rights
>
> You have the right to ask us for access to your personal data and a copy of it, to correct it, to delete it, to restrict how we use it, and, where it applies, to receive it in a portable form. You can object at any time to processing based on our legitimate interests, and we'll stop unless we have compelling reasons. To use any of these rights, email \<email\>. We'll answer within one month.
>
> We keep no request logs and can't tell who a visitor is from the statistics, so we usually can't find data about a visit. If you tell us the email address you wrote from, we can find your emails.
>
> You also have the right to complain to the Polish data protection authority: the President of the Personal Data Protection Office (Prezes Urzędu Ochrony Danych Osobowych, uodo.gov.pl), or to the authority in the EU country where you live or work.
>
> ## No automated decisions
>
> We don't make decisions about anyone by automated means, and we don't profile visitors.
>
> ## Children
>
> Combo Skin is meant for people aged 16 and over. If you're younger, please don't email us. If we learn we've received an email from someone under 16, we'll delete it.
>
> ## Changes to this policy
>
> We'll update this policy before the site starts doing anything new with personal data, and change the date at the top. Earlier versions are available on request.
>
> ## Contact
>
> \<email\>

**The hosts section.** "When you visit the site" and "Pictures from Steam" name every host the site's pages load from or send data to. In `privacy.ts` they are also a list, `hosts`, which the test of R14 compares with the CSP. Today that list is `combo.skin`, `img.combo.skin`, `view.combo.skin`, `assets.combo.skin` (the viewer's), `static.cloudflareinsights.com`, `cloudflareinsights.com` and `community.akamai.steamstatic.com`.

**Article 13, item by item:**

| Art. 13 item | Where |
| --- | --- |
| (1)(a) identity and contact of the controller | Who is responsible (with the risk of Operator identity) |
| (1)(b) data protection officer | Who is responsible: none, not required |
| (1)(c) purposes and legal basis | Each "Why" and "Legal basis" |
| (1)(d) the legitimate interests | Named in each "Legal basis" |
| (1)(e) recipients | Who receives data |
| (1)(f) transfers outside the EEA and safeguards | Data outside the EEA |
| (2)(a) retention | Each "How long" |
| (2)(b) rights | Your rights |
| (2)(c) withdrawing consent | Not applicable: nothing is based on consent |
| (2)(d) complaint to an authority | Your rights (UODO) |
| (2)(e) whether giving data is required | When you email us: emailing is optional |
| (2)(f) automated decisions | No automated decisions |

**Art. 13, not 14.** Request data is collected from the visitor by observation, through Cloudflare acting for us, so Art. 13 governs it (WP260, para 26). No data comes from another source today; Steam login would change that.

**Why the authority's address isn't in the text.** UODO has moved offices before; its website is the stable pointer and lists the current address.

**Children.** Art. 8 GDPR (consent of a child, 16 in Poland, which kept the default) matters only where consent is the legal basis, and nothing here is. Valve rates CS2 for older teens and adults, and Steam accounts require a minimum age. 16 matches Poland's GDPR age, the age the site's audience realistically starts at, and the line asks only what the site can act on: not to email.

### The Credits page

> # Credits
>
> Combo Skin is built on the work of many people. Thank you.
>
> ## Pattern guides
>
> Our special patterns, such as Blue Gem or Fire & Ice, take their example seeds from these community guides:
>
> - *\<title\>* by \<author\> — Used for: \<group names\>. (The title links to the guide.)
>
> ## Combo ideas from the community
>
> \<Names people asked to be credited with; the section is hidden while the list is empty.\>
>
> ## The game
>
> Counter-Strike 2, its item names, images and models belong to Valve Corporation. Combo Skin is a fan site, not affiliated with or endorsed by Valve.
>
> ## Item data
>
> The list of knives, gloves and finishes comes from CSGO-API by ByMykel, under the MIT licence.
>
> ## 3D viewer
>
> Our 3D viewer started from the ChainSkins 3D Viewer, under the MIT licence. Its asset pipeline uses ValveResourceFormat, under the MIT licence.
>
> ## Font
>
> Montserrat, by the Montserrat Project Authors, under the SIL Open Font License 1.1.
>
> ## Open-source software
>
> The site is built with open-source software, including React, React Router, TanStack Query, Swiper, Lucide and React Icons. [Every package and its licence](/licences.txt).
>
> ## Licence texts
>
> \<details\>: CSGO-API's MIT licence; Montserrat's SIL Open Font License 1.1.

Each name links to its project's public page (GitHub, Fontsource, the OFL's home). The "Combo ideas" list is a short array in `website/src/legal/credits.ts`, empty today; the owner adds a name when featuring a credited idea.

## API / data model

**`website/src/legal/operator.ts`**

```ts
export const OPERATOR = {
  name: 'Combo Skin',
  // { name: string; address: string } once the owner decides to name themselves (Operator identity).
  legalIdentity: null as { name: string; address: string } | null,
  email: 'privacy@combo.skin',
  country: 'Poland',
}
```

**A document** (`website/src/legal/document.ts`): `{ title, updated: 'YYYY-MM-DD', sections: { id, heading, blocks }[] }`, where a block is a paragraph or a bullet list of inline runs: text, bold text, or a link `{ href, text }`. `href` is a site path, `#id`, `mailto:` or `https:`.

**`website/src/legal/updated.json`**: for each document, its `updated` date and the SHA-256 of its rendered text. The test of R15 recomputes the hash; a changed hash with an unchanged date fails with "Terms of Usage changed: update its date and updated.json".

**`website/src/data/pattern-guides.json`** (generated, R10):

```json
{
  "guides": [
    {
      "title": "The Complete Blue Gem Guide",
      "author": "korenevskiy, Krieke 啤酒哥",
      "url": "https://steamcommunity.com/sharedfiles/filedetails/?id=3090086681",
      "groups": ["Blue Gem"]
    }
  ]
}
```

The `checked` dates stay in `groups.json`; the page doesn't show them.

**`/licences.txt`** (built, R12): plain text, one block per package, sorted by name: `name@version`, its SPDX licence, then its licence file's text; packages without a licence file show their `license` field and repository. Served with Pages' default `text/plain`.

No API route changes, no database changes.

## Security

- S1. The CSP doesn't change, and the three pages load nothing from another host (R16).
- S2. Links on the pages are only site paths, `#` anchors, `mailto:` and `https:` URLs; the renderer refuses any other scheme, so a guide URL in the data can never be `javascript:`. External links carry `rel="noreferrer"`.
- S3. Text from data (guide titles, authors, group names, credited names) is rendered as text, never as HTML, and escaped in the prerender (spec 022, S1).
- S4. No personal name, address or private mailbox is in the repository while `legalIdentity` is `null`. The committed texts contain only `combo.skin` addresses; the Privacy Policy names Gmail as the provider, never the mailbox's address.
- S5. `/licences.txt` is built from files inside `node_modules` only; the plugin reads no path outside it.

## Acceptance criteria

1. `/terms`, `/privacy` and `/credits` render their headings in the app bar and footer, and the footer's two links navigate to their pages (Vitest).
2. Terms and Privacy show "Last updated" with a `<time>` whose `dateTime` is the document's `updated` date (Vitest).
3. The Terms page contains the Valve notice sentence of Design word for word, and a link to `/credits` in "Who owns what" (Vitest).
4. Both documents' rendered text equals the text of Design for its document, with the operator settings filled in (Vitest against a fixture copied from this spec; any wording change made in review is recorded in Implementation notes).
5. With `legalIdentity` set to a test name and address, both documents show "run by <name>, <address>"; with `null`, neither shows any name but "Combo Skin" (Vitest).
6. Every link on the three pages is a site path, `#` anchor, `mailto:` or `https:`; a document with a `javascript:` link fails to render that link (Vitest).
7. Changing one word of a document without changing its date and `updated.json` fails the date test with the document's name (Vitest, run against a modified copy).
8. Adding a host to the CSP in a copy of `deploy/tests/golden/_headers` fails the hosts test with that host's name; today's file passes (Vitest).
9. `uv run python -m combo_api.patterns export-website --check` exits 0 on the committed file; after adding a group with a new source to a copy of `groups.json`, the export lists the new guide with its group, a shared guide lists all its groups once, and a group without sources adds nothing (pytest); the api workflow runs `--check`.
10. The Credits page lists every guide of `pattern-guides.json` with its title, author, `https` link with `rel="noreferrer"` and group names, and the item data, game, 3D viewer, font and open-source sections (Vitest).
11. The Credits page's CSGO-API and Montserrat licence texts equal their blocks in `THIRD_PARTY_NOTICES.md` (Vitest).
12. `npm run build` writes `dist/licences.txt`, which names every package with a module in the bundle (checked against Rollup's module list in a test of the plugin) and contains React's MIT licence text.
13. No cookies, no outside hosts: on the `pages.dev` preview, `curl -sI` of `/`, `/terms`, a combos page, a picture on `img.combo.skin`, `view.combo.skin/combo` and a file on `assets.combo.skin` shows no `Set-Cookie`; in Chrome, opening the three pages and a combo in 3D shows no CSP violation, and DevTools' Application panel shows no cookies, local storage, IndexedDB or Cache Storage for `combo.skin` or the framed viewer (manual, recorded in Implementation notes with the date). At going live, the Web Analytics settings of the new project show whether EEA, UK and Swiss visitors are left out; the Privacy Policy's bracketed sentence is kept or removed to match, with its date changed if the text changes.
14. All four addresses receive mail: `dig MX combo.skin` shows Cloudflare Email Routing's records, and a test email from an outside address to each of `bugs@`, `combos@`, `partners@` and `privacy@combo.skin` arrives in the mailbox (manual, recorded with the date). `deploy/README.md`'s Going live runbook holds the step of R18 before the domain moves (read in review).
15. With spec 022 in place: `terms.html`, `privacy.html` and `credits.html` are in the deploy with the titles and descriptions of Design, Titles, each holds its full text in `#root`, and `sitemap.xml` lists all three (Vitest in the prerender's tests).
16. At 375 px wide, the three pages have no horizontal scroll (Vitest can't check layout: manual in Chrome's device mode, recorded).
17. The footer shows "© 2026 Combo Skin" and "Not affiliated with Valve Corp.", no "Powered by Steam." and no "CHOOSE", and its two links (Vitest).
18. Lint, tests and build pass in `website/` and `api/` with the commands below; `gitleaks` finds nothing.

## Test plan

| Criterion | How it is checked |
| --- | --- |
| 1, 2, 3, 5, 6, 10, 17 | Vitest: `src/pages/legal/*.test.tsx`, rendering the routes with the site's test render helper |
| 4 | Vitest: `src/legal/text.test.ts`, the rendered text against `src/legal/fixtures/*.txt` |
| 7 | Vitest: `src/legal/updated.test.ts` |
| 8 | Vitest: `src/legal/hosts.test.ts`, reading `../deploy/tests/golden/_headers` |
| 9 | pytest: `api/tests/patterns/test_export_website.py`; the api workflow step |
| 11 | Vitest: `src/legal/licences.test.ts`, reading `../THIRD_PARTY_NOTICES.md` |
| 12 | Vitest: `scripts/licences.test.ts`; the build step in the website workflow checks `dist/licences.txt` exists and names `react` |
| 13, 14, 16 | Manual, on the preview and before go-live, recorded in Implementation notes |
| 15 | Vitest, in spec 022's prerender tests (whichever spec lands second) |
| 18 | The commands below |

Commands:

```bash
cd website && npm ci && npm run api:types:check && npm run lint && npm test && npm run build
cd api && uv sync --locked && uv run ruff format --check . && uv run ruff check . && uv run mypy && uv run python -m combo_api.patterns export-website --check && uv run pytest
gitleaks git --no-banner --redact
```

## Honest limits

What in these texts is a judgement call, not settled law:

- **The operator's identity.** "Combo Skin" without a name is the weakest point under GDPR Art. 13(1)(a) today and plainly short of UŚUDE Art. 5 once the site earns anything (Operator identity).
- **Web Analytics without consent.** Cookieless and aggregated, but a script that sends device information; the strict reading of EDPB 2/2023 and WP194 would ask for consent (Consent banner). Smaller if Cloudflare leaves out EEA visitors on the Free plan.
- **The viewer's saved settings.** Persistent `localStorage` for choices the visitor makes on the viewer's own pages: defensible as customisation the visitor asked for, but WP194 is cautious about anything longer than a session.
- **Whether UŚUDE applies yet**, and whether a page view forms a contract. The Terms include every Art. 8 item either way.
- **The liability carve-outs.** Written to the Polish grey list and Art. 473 §2; whether a court would read "we aren't liable for losses from your trades" as a material limit for a free informational site is untested.
- **The complaints period (14 days), the email retention (12 months) and the minimum age (16).** Reasonable choices, not fixed by any statute for a site like this.
- **The combo ideas clause.** Rests on ideas being unprotected; a sender who attaches their own screenshots keeps their rights in them, which is why the text promises to ask.
- **English only.** The Polish Language Act asks for Polish in dealings with consumers in Poland, for traders; whether that reaches a free fan site's terms is unclear. Worth adding a Polish version when the site becomes a business.
- **Cloudflare's own retention.** Cloudflare publishes no fixed retention period for request logs on self-serve plans, only that IPs are kept for a limited time, if at all; the policy can say no more than that.
- **A personal mailbox.** Google holds the emails under its consumer terms, not as our processor, until the move to a paid mailbox. And Email Routing only receives: a reply written in Gmail goes out from the personal address, with its display name, which shows the sender who the operator is. Until there is a way to send as a `combo.skin` address, replying is the owner's call, case by case.
- **Where the images are stored.** An R2 bucket is kept in a region near where it was created unless it was made with the EU jurisdiction, which can't be added later. The policy says data may be outside the EEA, which holds either way.

**When a one-time review by a Polish lawyer pays for itself:** before the first income from ads, partners or affiliate links, or when registering a business, whichever comes first. A fixed-fee review of these two texts, with the Polish version, the ad-consent setup and the legal identity, is the point where the risk moves from low to real. Bring this spec's Honest limits list.

## Sources

- GDPR, Regulation (EU) 2016/679, Articles 2, 4, 6, 8, 12 to 14, 21, 27, 37 and 77, recitals 18, 47 and 49: [EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
- Lindqvist, C-101/01, and Ryneš, C-212/13, on the household exemption, as quoted in EDPB Guidelines 3/2019, para 12: [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62001CJ0101), [EDPB](https://www.edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines_201903_video_devices_en_0.pdf)
- Article 29 Working Party, Guidelines on transparency (WP260 rev.01), endorsed by the EDPB: [European Commission](https://ec.europa.eu/newsroom/article29/redirection/document/51025)
- Article 29 Working Party, Opinion 04/2012 on the cookie consent exemption (WP194): [European Commission](https://ec.europa.eu/justice/article-29/documentation/opinion-recommendation/files/2012/wp194_en.pdf)
- ePrivacy Directive 2002/58/EC, Article 5(3), as amended by Directive 2009/136/EC: [EUR-Lex](https://eur-lex.europa.eu/eli/dir/2002/58/oj)
- EDPB Guidelines 2/2023 on the technical scope of Art. 5(3) of the ePrivacy Directive, version 2.0: [EDPB](https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf)
- Digital Services Act, Regulation (EU) 2022/2065, Articles 3 to 6, 11, 12, 16 and 17: [EUR-Lex](https://eur-lex.europa.eu/eli/reg/2022/2065/oj)
- Unfair Terms Directive 93/13/EEC: [EUR-Lex](https://eur-lex.europa.eu/eli/dir/1993/13/oj)
- Rome I, Regulation (EC) 593/2008, Article 6: [EUR-Lex](https://eur-lex.europa.eu/eli/reg/2008/593/oj)
- Brussels I bis, Regulation (EU) 1215/2012, Articles 17 and 18: [EUR-Lex](https://eur-lex.europa.eu/eli/reg/2012/1215/oj)
- Digital Content Directive (EU) 2019/770, Article 3: [EUR-Lex](https://eur-lex.europa.eu/eli/dir/2019/770/oj)
- Ustawa z dnia 18 lipca 2002 r. o świadczeniu usług drogą elektroniczną (UŚUDE), Articles 2, 5 to 9 and 23, consolidated text Dz.U. 2024 poz. 1513: [Sejm](https://api.sejm.gov.pl/eli/acts/DU/2024/1513/text.pdf); amended by Dz.U. 2026 poz. 1296 (the DSA implementation): [Sejm](https://api.sejm.gov.pl/eli/acts/DU/2026/1296/text.pdf)
- Kodeks cywilny, Articles 22¹, 384, 385, 385¹ to 385³ and 473, consolidated text Dz.U. 2026 poz. 795: [Sejm](https://api.sejm.gov.pl/eli/acts/DU/2026/795/text.pdf)
- Prawo komunikacji elektronicznej, Articles 398 to 400, Dz.U. 2024 poz. 1221: [Sejm](https://api.sejm.gov.pl/eli/acts/DU/2024/1221/text/T/D20241221L.pdf)
- Ustawa o prawach konsumenta, Articles 3 and 7a and chapter 5b, consolidated text Dz.U. 2026 poz. 1244: [Sejm](https://api.sejm.gov.pl/eli/acts/DU/2026/1244/text.pdf)
- Ustawa o prawie autorskim i prawach pokrewnych, Articles 1 and 41: [ISAP](https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU19940240083)
- Unregistered activity limit in 2026: [biznes.gov.pl](https://www.biznes.gov.pl/pl/portal/00115)
- UODO, the Polish data protection authority, and its contact page: [uodo.gov.pl](https://uodo.gov.pl/en/p/contact)
- Cloudflare Web Analytics: [about](https://developers.cloudflare.com/web-analytics/about/), [FAQ](https://developers.cloudflare.com/web-analytics/faq/) (query strings, the 7-day detail), [data collection](https://developers.cloudflare.com/web-analytics/data-metrics/data-origin-and-collection/), [the RUM beacon](https://developers.cloudflare.com/speed/observatory/rum-beacon/) (no browser storage, IP dropped, EEA exclusion on Free plans)
- Cloudflare Customer Data Processing Addendum, version 6.4: [cloudflare.com](https://www.cloudflare.com/cloudflare-customer-dpa/); the Self-Serve Subscription Agreement, §6.1, which brings it into free accounts: [cloudflare.com](https://www.cloudflare.com/terms/); sub-processors: [cloudflare.com](https://www.cloudflare.com/gdpr/subprocessors/)
- Cloudflare's privacy policy, §§2, 6 to 8 and 11: [cloudflare.com](https://www.cloudflare.com/privacypolicy/); on IP log retention: [Trust Hub](https://www.cloudflare.com/trust-hub/law-enforcement/)
- R2 data location and jurisdictions: [developers.cloudflare.com](https://developers.cloudflare.com/r2/reference/data-location/)
- Valve's privacy policy (§§3.6 and 5.3, IPs and CDN providers): [store.steampowered.com](https://store.steampowered.com/privacy_agreement/); Steam Web API Terms (no implied endorsement): [steamcommunity.com](https://steamcommunity.com/dev/apiterms)

## Open questions

None. Answered by the owner on 2026-11-24, and recorded in Design:

- Footer: "© 2026 Combo Skin", "Powered by Steam." dropped, "Not affiliated with Valve Corp." kept (R1, Design, Footer).
- ChainSkins and ValveResourceFormat: credited under "3D viewer". Serving the viewer's licences on `view.combo.skin` is a follow-up for the viewer's repository.
- Contact: `privacy@combo.skin` (R9).
- No "pattern from <guide>" link on cards.
- Web Analytics on at go-live, no banner, kept as a judgement call (Consent banner, Honest limits).
- Email: Cloudflare Email Routing forwarding the four addresses to a personal Gmail mailbox, both named in the Privacy Policy; a paid mailbox with a data processing agreement before any income (Triggers for an update); all four addresses receiving mail in the go-live runbook and the criteria (R18, criterion 14).

## Implementation notes

Filled in during implementation: deviations from the design and why, follow-ups discovered, and which test covers each acceptance criterion.

## Audit

Filled in by the audit: one line per acceptance criterion (pass or fail, with evidence), the results of lint, tests, build and the secret scan, and a verdict of Pass, Pass with follow-ups, or Fail.
