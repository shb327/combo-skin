# 018: View in 3D in a full window

**Status:** Implemented
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** website, api
**Branch:** 018-view-in-3d-window

## Summary

"View in 3D" stops opening inside the combo card and opens a large window over the page instead, with the page dimmed behind it. The window has no free camera: the visitor plays the game's own actions (inspect, the knife's light swing and heavy swing), each with a visible control and its key, and can choose the map and the agent from what the viewer has built. Spec 016's rules stay: nothing 3D loads before the click, the download warning on phones, no button without WebGL2, errors fall back to the screenshot, and the view uses the same float and seed as the screenshot. The viewer's side is built in its own repository first, from the list in this spec.

## Goals and non-goals

**Goals**

- A modal window for the 3D view: combo name and rating, the view, the action controls, a map choice, an agent choice, full screen and close. A full-screen layout on phones.
- Inspect (F), light swing (left click) and heavy swing (right click), as buttons and as the game's keys and mouse buttons.
- A map choice from the maps the viewer reports, Vertigo first and the default. An agent choice from the agents the viewer has built, Lt. Commander Ricksaw | NSWC SEAL the default for everyone.
- The follow-ups of spec 016: a short fade from the screenshot to the first frame, and Escape closing the window when the 3D view has focus.
- A list of what the viewer must add, with a feature check, so an older viewer still works with the new site.

**Non-goals**

- Building the viewer's side (its own work, from [What the viewer must add](#what-the-viewer-must-add)), new maps, attack animations themselves, a lighter mode for phones.
- A glove or knife choice: the window shows the combo the visitor opened.
- The screenshot worker and the screenshots, the dashboard, analytics (the `onLoaded` hook of spec 016 stays as it is), deployment and the Content Security Policy (the cleanup spec; what it needs is unchanged from spec 016).

## Context

Specs 001 to 017 are Audited and merged.

**Website** (spec 016)

- `website/src/components/ComboPictures.tsx`: the card's 16:9 box. It holds the screenshot (or the two finish pictures), "View in 3D" in the top-right corner in white at about 60% opacity, and, once clicked, the whole 3D view in the same box: the iframe under the screenshot until `cs3d:loaded`, the progress bar, the 34 MB warning, "Full screen" (on the box), "Close 3D view" and the error strip with "Try again". Escape closes the view only while focus is on the box's own controls; keys inside the viewer stay in its document.
- `website/src/viewer/ComboViewer.tsx`: one iframe per attempt, `sandbox="allow-scripts allow-same-origin"`, events accepted only from `VITE_VIEWER_ORIGIN`, from this iframe, with `id` null or the handshake's id; `cs3d:getState` on the iframe's `load`; 15 s for `cs3d:ready`, 60 s between events while loading; `about:blank` before removal. It sends no other command.
- `website/src/viewer/params.ts`: `viewerCombo` and `viewerUrl` (indexes, the screenshot's float and seed, a left-out seed when the combo has none, `ui=0`, no `agent`, `view` or `map`). `messages.ts`: event parsing, the page's fixed error texts, `READY_MS`, `STALL_MS`. `webgl.ts`: `hasWebGL2`, `needsDataWarning`. `state.ts`: the visit's reducer (open combo, phase, `warned`, `noWebGL2`, `cannotDraw`), provided for the app's life by `website/src/Providers.tsx`.
- `website/src/pages/Combos.tsx`: `ComboCard` renders `ComboPictures`, the other item's name, the score circle (`getScoreColor`) and the conditions. `website/src/components/ScrollToTop.tsx` scrolls to the top only when the path changes, not the query.
- The website has no dialog. `@chakra-ui/modal` and `yet-another-react-lightbox` are dependencies but nothing in `src/` imports them. Nothing is stored in the browser (spec 016, S7).
- Spec 016's follow-ups: in two captures the box was empty for a moment between `cs3d:loaded` and the viewer's first visible frame; Escape inside the 3D view does nothing.

**API and data** (specs 005, 011, 012)

- `api/src/combo_api/catalog/snapshot.json` lists the dataset's 63 agents (29 Counter-Terrorist, 34 Terrorist) with `def_index`, `codename`, `name`, `team`, `rarity`, `image_url` and `retired`; Ricksaw is 5404. `api/src/combo_api/catalog/export.py` writes `website/src/data/catalog.json` (gloves and knives only, no agents), checked by `export-website --check` in the `api` workflow.
- Spec 012 kept agents admin-only: `GET /admin/agents`, the combo's screenshot agent and the default screenshot agent setting appear only in admin responses (R6, S2), and its non-goals ruled out agents on the public website.
- Spec 011: the public routes are the catalog and combo lists with public CORS; there is no public route for one combo by id. A combo's `id` is its public id (12 characters, `0-9a-z`), already in every public combo response.

**The viewer** (another public repository; contract in its [`docs/embed.md`](https://github.com/shb327/cs2-combo-viewer/blob/main/docs/embed.md), plans in [`docs/roadmap.md`](https://github.com/shb327/cs2-combo-viewer/blob/main/docs/roadmap.md))

- Protocol version 1. `/combo` takes the items, floats and seeds, `agent` (a definition index; left out: Ricksaw, 5404), `view` (`fp` or `orbit`) and `ui`. 63 agents are built. Commands: `cs3d:load` (another combo in the same iframe, the last frame kept while it loads; `combo` may carry `agent`), `cs3d:inspect` (plays the knife's inspect in first person), `cs3d:setView`, `cs3d:getState`. A newer request supersedes an older one, which gets no further events. `unknown-agent` is an error code (not retryable).
- Maps: Vertigo is the only map built, plus the plain studio, which the viewer draws on phones instead of a map (roadmap, look pass). The embed has no map parameter, no list of maps or agents, no attack commands (no attack clips are built) and no key forwarding.
- The roadmap's phase 6, "Polish" (map and agent choice for visitors, attack animations), is where the viewer's side of this spec is built.

## Requirements

**The button and the window**

- R1. Each combo card shows "View in 3D" as in spec 016 (WebGL2, a combo the viewer can draw, the same place and look). Before the click nothing of the viewer loads: no iframe and no request or message to the viewer's origin. The card itself never shows a 3D view again: it keeps its screenshot.
- R2. Clicking it opens a modal window over the page. The page behind is dimmed, cannot be clicked or reached with Tab, and does not scroll while the window is open; its scroll position is unchanged after closing. At most one window is open.
- R3. The window shows the combo's name (`<gloves> with <knife>`, full names), its rating in the score colour, the 3D view, the action controls, the map and agent choices, "Full screen" where the browser allows it, and "Close". On a phone it fills the screen (Design, Layout).
- R4. Until the viewer reports the combo drawn, the window shows the combo's screenshot (or the finish pictures) where the view will be, with "Loading 3D view…" and a progress bar. Then the screenshot fades out over 200 ms to the 3D view, without an empty frame in between; with reduced motion asked for, it goes at once.
- R5. Close, Escape (with focus anywhere in the window, including inside the 3D view), the browser's Back (R15) and leaving the page each close the window: the viewer is removed and its memory released as in spec 016, the page scrolls again, and focus returns to the card's "View in 3D". In full screen, the browser's Escape leaves full screen first. With a menu open, Escape closes the menu only.
- R6. Focus moves to "Close" when the window opens. Loading, ready and error states are announced to screen readers, as in spec 016.

**The game's actions**

- R7. Three controls, each with an icon, its name and its key: "Inspect" (F), "Light swing" (left click), "Heavy swing" (right click). Activating one plays that action in the viewer from its start. They are disabled until the combo is drawn, and a control shows only when the viewer can play that action for the knife drawn.
- R8. With the pointer on the 3D view, a left click plays the light swing and a right click the heavy swing (no context menu); F plays the inspect with focus in the view or on the window's own controls (not while typing in the agent search). The mouse never turns the camera: the view stays first person. On a touch-first device the key hints are hidden and taps on the view do nothing; the buttons play the actions.

**Map and agent**

- R9. "Map" lists exactly the maps the viewer reports, in its order, the current one marked. The plain studio is never offered, on desktop or on phones. Vertigo is the default on every device, phones included; today it is the only entry. Choosing another map reloads the scene on it with the same combo.
- R10. "Agent" lists the agents the viewer reports as built that the website's agent list also has: each with its picture, name and team, Counter-Terrorists first, then Terrorists, each by name, searchable by any word of the name, with Lt. Commander Ricksaw | NSWC SEAL first and marked "Default". Every window opens on the default agent unless the visitor chose another (R12); the combo's screenshot agent is never used or shown.
- R11. A change of map or agent keeps the combo, its floats and seeds, shows progress over the last frame, and ends with the new scene or a message with "Try again"; the choices always show what is drawn. A map or agent the viewer refuses (`unknown-map`, `unknown-agent`) falls back to the default with "That map isn't available." or "That agent isn't available.".
- R12. The visitor's map and agent are remembered for the visit: the next window, on any combo or finish page, opens with them. A reload starts from the defaults. Nothing is stored in the browser.

**Kept from spec 016**

- R13. The 34 MB warning (narrow screen, touch-first device or data saver) shows in the window, before anything loads, the first time in a visit, with "Load 3D view" and "Cancel"; "Cancel" closes the window.
- R14. Every viewer error and time limit shows the screenshot again in the window with the page's own text and, where it can help, "Try again", as in spec 016. `no-webgl2` hides every card's button for the visit; an error that says the combo cannot be drawn hides that card's button. The time limits apply to every load, including a change of map or agent.
- R15. Opening the window adds `3d=<combo id>` to the page's address as a new history entry, and the browser's Back closes it. A page opened with that address shows the window for that combo with its screenshot and "Load 3D view", and loads nothing 3D until that click. An id that is not among the page's combos is removed from the address without a window. The window has "Copy link".
- R16. The view is drawn with the float and seed of the card's screenshot, as in spec 016. With the default map and agent, the viewer's address is spec 016's plus the input mode (API / data model); a chosen agent or map is added only when it is not the default.

**An older viewer**

- R17. With a viewer that reports protocol version 1, or no feature list, the window still works: the view, "Inspect", "Full screen" and "Close". The swing controls and the map and agent choices are hidden, the default agent and map are drawn, and nothing in the page fails. Each new control appears only when the viewer reports its feature.

**Agent list**

- R18. `export-website` also writes `website/src/data/agents.json` from the snapshot: the active agents with definition index, name, team and picture, in the order of R10. `export-website --check` covers it. The website loads it only with the window's code, after a click.
- R19. No public API response changes: no new route, no agent in any public response, and the combo's screenshot agent and the default screenshot agent stay admin-only (spec 012, R6 and S2).

## Design

### The window

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Element | The native `<dialog>` opened with `showModal()`: the browser makes the rest of the page inert, puts the window in the top layer, dims it with `::backdrop` (black at 70%) and sends `cancel` on Escape. `aria-labelledby` the combo's name | `@chakra-ui/modal`, already a dependency: brings the Emotion runtime into the window's code for what the browser does itself. A hand-built `div` with `aria-modal`, a focus trap and `inert` on the page: more code doing what `showModal` does |
| Size (desktop and tablet, 768 px wide and up) (owner's choice) | The view is 16:9, as wide as fits: at most 1600 px, 94% of the viewport's width, and short enough that the window (name row, view, controls row) fits in 92% of its height. At 1440 by 900 that is a view of about 1260 by 710 px. The window is centred with rounded corners on the page's dark background | A fixed size: wastes large screens or overflows small ones. Filling the viewport on desktop: CSFloat-like, but the dimmed page behind is what tells the visitor they can go back |
| Phones (under 768 px wide, or under 500 px tall) (owner's choice) | The window fills the screen (`100dvw` by `100dvh`, no backdrop showing): the name row and "Close" at the top, the view filling the space between, the controls at the bottom in two rows (actions; map and agent), with buttons at least 44 px tall. The view may be taller than 16:9: the viewer keeps 16:9's horizontal angle on narrower screens, so the hands and knife are the same size and only more of the background shows. Under 500 px tall (a phone held sideways) the name row is hidden (the name stays the window's accessible name) and the controls sit in one row | A 16:9 view on phones: the same hands, with empty space instead of the map. A bottom sheet over the view for the controls: hides the knife the visitor is looking at |
| What else is in it (owner's choice) | The combo's name and its rating (the score colour of `getScoreColor`, as a small "9.5" badge). No conditions, description or links: the card behind has them, and a link would close the window. "Copy link", as the window has its own address | A "drawn with float 0.01, seed 387" line: useful, as the view draws one exact float and seed, but one more thing to explain; easy to add later. Links to the other item's combos: they navigate away from the window |
| Scroll | While open, `overflow: hidden` on the page's root element with `scrollbar-gutter: stable`, so the page neither scrolls nor shifts sideways; both restored on close | Leaving the page scrollable: the wheel over the backdrop scrolls the page behind a modal window |
| Full screen | Requested on the dialog itself, so the name row and the controls stay in full screen. Shown only where `document.fullscreenEnabled` (not on iPhones, where the window already fills the screen). The browser's Escape leaves full screen first; spec 016's toggle rules stay (decided by `document.fullscreenElement`, refusals ignored) | Full screen on the view only: the controls would be gone, and the actions are the point of the window |
| Escape and focus | Focus moves to "Close" on open and back to the card's "View in 3D" on close. Escape on the window's own controls arrives as the dialog's `cancel`, which is turned into the same close as the button (so the viewer is cleaned up). Escape inside the 3D view is forwarded by the viewer (V6) and closes the window too, unless the page is in full screen. A menu open takes Escape first | A key trap inside the view: worse than one more Tab |
| The fade | On `cs3d:loaded` the screenshot stays on top and fades to transparent over 200 ms, then is removed; with `prefers-reduced-motion: reduce` it is removed at once. Together with V7 (the viewer reports `loaded` only once the frame is on screen), the box is never empty | Only waiting a fixed time after `loaded`: a guess that varies with the GPU. Only the viewer's fix: an instant swap can still flash on a slow compositor |
| Code layout | `website/src/viewer/ViewerWindow.tsx` (the dialog, its rows and states), `ViewerControls.tsx` (actions, map and agent menus), `agents.ts` (the website's agent list joined with the viewer's), `features.ts` (reading `cs3d:ready`); `ComboViewer.tsx` gains commands and load ids; `ComboPictures.tsx` keeps the picture and the button and loses the in-card view. The window and `agents.json` are loaded with `React.lazy` on the first click, from the site's own origin, so the main chunk grows by little | Everything in the main chunk: the agent list and the window code for every visitor, most of whom never open it |
| Tests | As in spec 016: a fake viewer dispatching `MessageEvent`s with the iframe's `contentWindow` as `source`, spied `postMessage`, stubbed `hasWebGL2` and `matchMedia`, fake timers. jsdom's `HTMLDialogElement` lacks `showModal` and `close`, so the test setup gives it small stand-ins that set `open` and dispatch `cancel` and `close` | A real browser in CI: GPU and network; kept as the manual check |

Sketch, desktop (the page dimmed behind):

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Specialist Gloves | Crimson Kimono with Karambit | Doppler (Ruby) (9.5)  │
│                                              [Copy link] [⛶] [✕]        │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │                                                                     │ │
│ │                                                                     │ │
│ │                      live 3D view, 16:9                             │ │
│ │       (the screenshot, "Loading 3D view…" and the bar until drawn)  │ │
│ │                                                                     │ │
│ │                                                                     │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ [◎ Inspect  F] [◐ Light swing  L-click] [◑ Heavy swing  R-click]        │
│                               Map [Vertigo ▾]   Agent [▣ Ricksaw ▾]     │
└─────────────────────────────────────────────────────────────────────────┘
```

Sketch, phone held upright (the window fills the screen):

```
┌───────────────────────────────┐
│ Crimson Kimono with       [✕] │
│ Karambit | Doppler (Ruby) 9.5 │
├───────────────────────────────┤
│                               │
│                               │
│         live 3D view          │
│      (fills the space; the    │
│       hands keep their size)  │
│                               │
│                               │
├───────────────────────────────┤
│ [Inspect] [Light]  [Heavy]    │
│ [Map: Vertigo ▾] [Agent ▾]    │
└───────────────────────────────┘
```

`⛶` is "Full screen", `✕` "Close". The 34 MB warning and the error messages take the view's place, over the dimmed screenshot, as in spec 016's card.

### Actions and input

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Who plays them | The viewer, on commands: `cs3d:inspect` (exists) and `cs3d:attack` with `light` or `heavy` (V2). A new action starts from the beginning and cuts the running one, as in the game. The page shows no state for a playing action | The page timing the animations: the viewer knows their lengths |
| Mouse and keys on the view | The viewer's input mode `input=game` (V5): in first person, a left click plays the light swing, a right click the heavy swing (the context menu suppressed), F the inspect; touch and pen do nothing; no camera turning and no pointer lock. The page cannot see input inside the cross-origin iframe, so this must be the viewer's | The page laying a transparent layer over the iframe to catch clicks: the viewer would then never get focus, and keys inside it would need the same layer. Pointer lock: not needed without a free camera |
| Keys on the window's controls | The page listens for F on the dialog (not in the agent search input) and sends `cs3d:inspect`. The swings have no key of their own in the game besides the mouse buttons, so only their buttons play them from the page | Number keys for the swings: not the game's |
| Touch | Taps on the view do nothing; the buttons play the actions and the key hints are hidden where `(hover: none) and (pointer: coarse)` matches | A tap as the light swing: a scroll or a misplaced tap would swing; there is no right click to match |
| Which controls show | "Inspect" always (protocol version 1 has it). The swings only with the viewer's `attack` feature, and each only when `cs3d:loaded` lists it in `actions` for the knife drawn (V2); disabled until `loaded` and while a load is in progress | Showing disabled swing buttons on an older viewer: a control that can never work |
| Labels | Buttons named "Inspect", "Light swing", "Heavy swing", each with `aria-keyshortcuts` (`F` for Inspect) and a visible hint ("F", "Left click", "Right click") | |

### Map and agent

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Where the map list comes from (owner's choice) | The viewer: `cs3d:ready` reports `maps` (id and English name, in its order) and `defaultMap` (V3). The page shows exactly that list, so it can never offer a map that is not built, and a new map needs no website change. The names are the viewer's text, shown as text only and checked (Security, S3). Today: Vertigo, on every device | A list in the website: a release of the site for every new map, and a map listed before the viewer has it. The API: the API knows nothing about maps |
| The studio (owner's choice) | Never offered, on desktop or on phones: the map list holds real maps only. On phones the viewer draws Vertigo too, instead of the studio it draws there today (V3), so a phone shows the same scene as the screenshot and the desktop. As a guard, the page also drops a reported map whose id is `studio` | Offering it as "Studio (no map)": the owner ruled it out. Keeping the studio on phones without a map menu: a phone would show another scene than the card's screenshot, and the visitor would have no way to know why |
| A single map | The "Map" menu shows even with one entry, so the visitor sees which map it is and the choice appears where it will grow | Hiding it until there are two: the visitor would not know the map's name or that a choice is coming |
| Where the agent list comes from (owner's choice) | The website's own generated list, `website/src/data/agents.json` (definition index, name, team, picture), written by `export-website` from the snapshot, joined with the definition indexes the viewer reports as built (`agents`, V4). The picker shows only agents in both: the viewer decides what can be drawn, the website names and pictures them | A public `GET /agents` route: an API change and a runtime request for static data the snapshot already has, and agents in a public API response, which spec 012 ruled out. The viewer's own list with names: no pictures or teams for 63 entries, and 63 strings from another origin on the page. The website's list alone: it would offer an agent the game added before the viewer built it |
| What changes from spec 012 | The agents' public game data (names, teams, pictures, from the same open dataset as the finishes) is now on the public website, in the window's code. Unchanged: no public API response mentions agents; the combo's screenshot agent and the default screenshot agent setting stay admin-only and never reach the website or the viewer's address | Making the combo's screenshot agent the 3D default: the owner ruled it out; it would also make it public |
| Default agent | Lt. Commander Ricksaw \| NSWC SEAL (5404), the viewer's default, for everyone. It is sent as "no agent" (left out), so the default address stays spec 016's. If the dashboard's default screenshot agent changes, the 3D default does not | Following the dashboard's default screenshot agent: an admin setting would reach the public site |
| Agent picker | A button with the agent's picture and name opening a list with a search box: "Default (Lt. Commander Ricksaw \| NSWC SEAL)" first, then "Counter-Terrorists" and "Terrorists" groups, each by name, the combobox pattern of the dashboard's `SearchCombobox`. Pictures from the game's image host only, through the website's `pictureUrl`, without a referrer, loaded only when the list opens. On phones the list opens full width above the controls | A plain select: 63 names without pictures |
| A change of map or agent | `cs3d:load` with a new id, the same combo, `agent` (left out for the default) and `map` (left out for the default) (V3, V4). The iframe stays; the last frame shows with the progress bar over it; events of earlier ids are ignored; a newer choice supersedes a load in progress. The choices show what was last drawn until the new `loaded` | A new iframe per change: a reload and a second WebGL context for what the viewer does in place |
| A failed change | With the viewer's `kept: true` (V4), the last scene stays and a strip says "That agent couldn't be loaded." (or map) with "Try again" (the same `cs3d:load` again); `unknown-agent` or `unknown-map` load the default instead with R11's text. Without `kept`, as any error (R14) | Closing the window: the visitor loses a working view for a failed extra |
| Remembering (owner's choice) | For the visit only: the last chosen map and agent live in the visit's state (`state.ts`), so the next window on any combo opens with them; a reload starts from the defaults. Nothing is stored, so spec 016's S7 holds | `localStorage` across visits: convenient for a visitor with a favourite agent, but the first thing the site stores, which then needs a line in a privacy notice the site does not have yet, and a stored value to check against the viewer's list. Not remembering at all: a visitor comparing combos on one agent would choose it again for every combo |

### The window's address

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Own address or dialog only (owner's choice) | `?3d=<combo id>` on the finish page's address. Opening pushes it as a history entry, so Back (and a phone's back gesture) closes the window instead of leaving the page; closing by the button or Escape goes back one entry when the window pushed it, else replaces the address without it. A page opened with it waits for its combos, then shows the window with the screenshot and "Load 3D view": nothing 3D loads before that click (R1), on desktop too. An id the page does not list is dropped. "Copy link" copies the address. Map and agent are not in it | Dialog only: simpler, but on a phone Back leaves the finish page, and a view cannot be shared. A route of its own (`/combos/<id>`): needs a public route for one combo, an API change. Map and agent in the address: a shared link would then carry the sender's choices into someone else's visit; can be added later |
| Ids | Only an id of the form of spec 009's public id (12 characters of `0-9a-z`) is read; anything else is dropped from the address | |

### Viewer version and features

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| How the page knows what the viewer can do | `cs3d:ready` carries `version` and, from version 2, `features` (V1). The page uses a feature only when it is listed: `attack` (swing controls), `map` (map menu and `map`), `agents` (agent menu), `input` (the address's `input=game`), `keys` (Escape forwarding), `first-frame` (V7). Version 1, a missing or malformed list, or an unknown version below 1: no new feature. A higher version with the features listed: used as listed | The version number alone: every feature would wait for the slowest one. Asking the viewer with a command: `cs3d:ready` already comes first, once |
| Rolling out | The viewer's changes are opt-in (new parameters and commands; without them the embed behaves as protocol version 1) and land first, so the live site of spec 016 and the screenshot worker keep working. The website follows, and degrades by feature, so it can never break on an older viewer | Changing the embed's defaults: the screenshot worker and spec 016's site would change behaviour unasked |
| `input=game` before the version is known | The address is built before `cs3d:ready`, so `input=game` is always sent. Version 1 must ignore an unknown parameter (V8 asks the viewer to confirm it does, and to keep doing so) | Sending the input mode by command after `ready`: a moment where clicks do nothing or the old input runs |

### What the viewer must add

The list for the viewer's phase 6, opt-in and documented in its `docs/embed.md`:

- V1. **Version and features.** `cs3d:ready` gains `version: 2` and `features`, an array of strings: `attack`, `map`, `agents`, `input`, `keys`, `first-frame`, each listed only once it works. Without the new parameters and commands, the embed behaves exactly as protocol version 1.
- V2. **Attacks.** A command `cs3d:attack` `{ id, attack: "light" | "heavy" }` plays the knife's light swing (the game's primary attack) or heavy swing (secondary attack) in first person from its start; a new action, inspect included, cuts the one playing, as in the game. `cs3d:loaded` gains `actions`: those of `inspect`, `light`, `heavy` built for the knife drawn. An attack not built for the knife is ignored; any other value is `cs3d:error` `bad-params` with the combo kept on screen.
- V3. **Maps.** `cs3d:ready` gains `maps`, an array of `{ id, name }` (id `[a-z0-9_]`, at most 32 characters; name plain English, at most 40), the maps a visitor may choose, in the order to show, and `defaultMap`, one of their ids (Vertigo). The list never holds the studio. In `/combo`, phones are drawn on the chosen map (Vertigo by default) like every other device, not in the studio they get today; measure a phone on Vertigo as part of phase 6's low-end work, and if a phone cannot, say so in `cs3d:error` rather than falling back to the studio. The studio stays for the viewer's own tools only. A `map` parameter in the address and a `map` field on `cs3d:load` (next to `view`) choose one; left out, the default. A map not in the list is `cs3d:error` `unknown-map` (not retryable). `cs3d:loaded` and `cs3d:state` echo `map`.
- V4. **Agents.** `cs3d:ready` gains `agents` (the definition indexes of every built agent) and `defaultAgent` (5404). `cs3d:load` with the same combo and another `agent` (already accepted) or `map` changes only the arms or the scene, keeping the last frame until the new one is drawn, as today. If such a load fails, the last drawn scene stays on screen and the `cs3d:error` carries `kept: true`.
- V5. **Input mode.** A parameter `input=game`: in first person, a left mouse click on the view plays the light swing, a right click the heavy swing (no context menu), F the inspect; touch and pen input do nothing; the mouse never turns the camera and the pointer is never locked. Without it, input as today. The embed's document takes focus when clicked, so F works after a click.
- V6. **Escape.** With `input=game`, Escape pressed in the embed's document is not acted on there and posts `cs3d:key` `{ id: null, key: "Escape" }` to the parent (its origin only, as every event). No other key is forwarded.
- V7. **First frame.** `cs3d:loaded` is posted only after a frame showing the combo has been presented (for example two animation frames after the first draw), in every mode, so a page that swaps its screenshot on `loaded` never shows an empty view. Listed as `first-frame`.
- V8. **Unknown parameters** in the address stay ignored, as in version 1 (to confirm), so `input=game` reaches an older embed harmlessly.
- V9. **Unchanged:** origins, `frame-ancestors`, `ui=0`, the error codes and their `retryable`, the screenshot mode (`capture=1`), and the seed and float rules. The test host gains the new commands and events.

### Size and order

One website review, larger than spec 016's website part: the window and its two layouts, three action controls, two menus, the address, the feature check and the agent export, with tests. The API part is the `export-website` file and its check only. Splitting the website part in two (window first, map and agent second) would mean reviewing the window's controls row twice; not worth it.

Order: (1) the viewer's phase 6, from V1 to V9, released and live, with the site of spec 016 unchanged; (2) this spec's website and export work on its branch, checked against that viewer. If the attack animations are not built when the website work starts, the website can still land (the swing controls stay hidden by V1 and V2), and criterion 21's swing steps wait; the owner decides, and the choice is recorded in Implementation notes.

## API / data model

No API route, schema, setting or migration changes; `api/openapi.json` is unchanged.

`website/src/data/agents.json` (generated by `export-website`, checked by `--check`), the snapshot's active agents in R10's order:

```json
{
  "source": {"commit": "<the snapshot's commit>"},
  "agents": [
    {"def_index": 5404, "name": "Lt. Commander Ricksaw | NSWC SEAL", "team": "ct", "image": "<game image host URL>"}
  ]
}
```

Viewer address for the combo of spec 016's example, with the default map and agent:

```
<VITE_VIEWER_ORIGIN>/combo?knife=507&knife_paint=415&knife_float=0&knife_seed=387&gloves=5034&gloves_paint=10033&gloves_float=0.06&ui=0&input=game
```

With a chosen agent and map: `…&ui=0&input=game&agent=4613&map=<id>`. No `view`, `debug` or `capture`.

Messages the page sends (to `VITE_VIEWER_ORIGIN` only): `cs3d:getState` (as today), `cs3d:inspect` `{ id }`, `cs3d:attack` `{ id, attack }`, `cs3d:load` `{ id, combo, map? }` (`combo` the address's item fields, plus `agent` when not the default). Events it reads besides spec 016's: `cs3d:ready`'s `version`, `features`, `maps`, `defaultMap`, `agents`, `defaultAgent`; `cs3d:loaded`'s `actions` and `map`; `cs3d:error`'s `kept`; `cs3d:key`.

Page address: `/gloves/<type>/<finish>/combos?3d=<combo id>` (and the same for knife pages).

## Security

- S1. Viewer events, `cs3d:key` included, are accepted only from `VITE_VIEWER_ORIGIN` and only from the open window's iframe, with `id` null or one of the window's own ids; only `Escape` in `cs3d:key` is acted on. Commands are posted only to that iframe with `VITE_VIEWER_ORIGIN` as the target origin, never `'*'`.
- S2. The iframe is made only after a visitor's click, with `sandbox="allow-scripts allow-same-origin"` and no `allow` or `referrerpolicy` attribute, as in spec 016.
- S3. Nothing from the viewer is rendered as HTML. Map names are the only viewer text shown: as text, only when the id matches `^[a-z0-9_]{1,32}$` and the name is 1 to 40 characters with no control characters, at most 32 maps; otherwise the map menu is hidden. Agent names and pictures come from the website's own list. `dangerouslySetInnerHTML` is still not used.
- S4. The viewer's address carries only the items' indexes, floats and seeds, `ui=0`, `input=game`, and the chosen agent's definition index and map id when not the defaults: no combo id, rating or anything about the visitor. The page's own address carries only the combo's public id.
- S5. No public API response mentions agents; the combo's screenshot agent and the default screenshot agent setting never reach the website.
- S6. Agent pictures are shown only from the game's image host, without a referrer.
- S7. Nothing about 3D views or the visitor's choices is stored in the browser or sent anywhere by the page.
- S8. The `website`, `api` and `admin` workflows keep read-only permissions, no secrets and SHA-pinned actions.

## Acceptance criteria

Website checks run in `website/` with Vitest, the fake API and the fake viewer (Design, Tests); "a version 2 viewer" sends `cs3d:ready` with `version: 2`, every feature, `maps` `[{id: "de_vertigo", name: "Vertigo"}]`, `defaultMap` `de_vertigo`, `agents` including 5404 and 4613, `defaultAgent` 5404. API checks run in `api/` with pytest.

**Agent list (API)**

1. `tests/catalog/test_export.py`: `export-website` writes `website/src/data/agents.json` with the snapshot's commit and 63 agents (29 `ct` first, then 34 `t`, each by name), each with exactly `def_index`, `name`, `team`, `image`; Ricksaw is 5404, `ct`; a retired agent is left out. `uv run python -m combo_api.catalog export-website --check` exits 0, and exits 1 naming the file after a change to it.
2. `git diff main... -- api/openapi.json` prints nothing, and spec 012's test that public bodies contain no `agent` passes unchanged.

**The button and the window**

3. With WebGL2 (stubbed) every card shows "View in 3D"; without it none does. Before a click the document has no `iframe` and no open `dialog`, and nothing is requested from or posted to the viewer's origin.
4. Clicking it opens one modal `dialog` (`showModal` called) labelled by `<gloves> with <knife>` (full names), showing that name and the rating; the card behind still shows its screenshot and no iframe; the dialog has one `iframe` with the address of criterion 5, the sandbox and the title of spec 016; focus is on "Close"; the root element has `overflow: hidden`.
5. `src/viewer/params.test.ts`: the default choice gives exactly the address in API / data model; agent 4613 and map `de_vertigo` add `agent=4613&map=de_vertigo` after `input=game`; the default agent and map add nothing; spec 016's float, seed and vanilla cases still hold; no address contains `view`, `debug`, `capture` or a combo id.
6. Until `cs3d:loaded` the screenshot and "Loading 3D view…" show, the bar following `cs3d:progress`. On `loaded` the screenshot gets a 200 ms opacity transition and is removed after it, and "3D view ready" is announced; with `prefers-reduced-motion: reduce` (stubbed) it is removed at once.
7. Close, Escape on the window's controls (`cancel`), a `cs3d:key` `Escape` from the iframe, and Back (with `?3d=`) each: set the iframe's `src` to `about:blank` while it is still in the page, close the dialog, restore the root element's `overflow`, and return focus to the card's "View in 3D"; later events from that iframe change nothing. A `cs3d:key` from another origin or `source`, or with another key, changes nothing; with `document.fullscreenElement` set, a forwarded Escape does not close the window; with the agent list open, Escape closes the list only.
8. "Full screen" calls `requestFullscreen` on the dialog (stubbed); with `document.fullscreenEnabled` false it is not shown.

**Actions**

9. With a version 2 viewer and `cs3d:loaded` with `actions` `["inspect", "light", "heavy"]`: "Inspect", "Light swing" and "Heavy swing" show with the hints "F", "Left click", "Right click", disabled before `loaded`; clicking each posts `cs3d:inspect` or `cs3d:attack` with `light` or `heavy` and an id, to the viewer's origin only. F with focus on a window control posts `cs3d:inspect`; F typed in the agent search does not. With `actions` `["inspect"]` the swing controls are not shown. With `(hover: none) and (pointer: coarse)` matching, the hints are hidden and the buttons still work.
10. With a version 1 viewer (`cs3d:ready` `{version: 1, webgl2: true}`), and separately with `features` not an array: only "Inspect", "Full screen" and "Close" show, no swing control, map or agent menu; "Inspect" posts `cs3d:inspect`; the view loads and closes as in criterion 7 with no error.

**Map and agent**

11. With a version 2 viewer, "Map" lists "Vertigo", marked current. With `maps` of two entries, choosing the second posts `cs3d:load` with a new id, the same item fields and `map`; progress shows over the view; events with the earlier id are ignored; after `loaded` with that `map`, the menu marks it. `unknown-map` loads the default map and shows "That map isn't available.". A reported map with id `studio` is not listed. `maps` with an id `Bad Id`, a name of 41 characters or with a control character, 33 entries, or a string instead of an array: no map menu; a name `<b>x</b>` is shown as those characters.
12. "Agent" lists only agents in both `agents.json` and the viewer's `agents` (a test viewer list with an index missing from `agents.json` and without one that is in it), Ricksaw first as "Default (Lt. Commander Ricksaw | NSWC SEAL)", then "Counter-Terrorists" and "Terrorists" groups, each by name; pictures on the game's image host with `referrerPolicy="no-referrer"`, none before the list opens. Type, Down, Enter chooses an agent by keyboard and posts `cs3d:load` with its `agent`; choosing "Default" posts `cs3d:load` without `agent`. `unknown-agent` loads the default and shows "That agent isn't available.". A failed change with `kept: true` keeps the view and shows "That agent couldn't be loaded." with "Try again", which posts the same load again.
13. After choosing agent 4613 and closing, the next window, on another card and on another finish page, opens with `agent=4613` in its address and the agent shown; after rendering the app again from scratch, the default. Nothing is written to `localStorage`, `sessionStorage` or `document.cookie`.

**Address**

14. Opening pushes `?3d=<combo id>` with the finish path unchanged and the page not scrolled; Back closes the window; Close after opening returns to the address without `3d`. Rendering the finish page with `?3d=<id of a listed combo>` shows the window with the screenshot and "Load 3D view" and no iframe until that click, also with no small screen; an id not on the page, and `?3d=NOT-AN-ID`, are removed from the address with no window. "Copy link" writes the page's address with `?3d=` to the clipboard (stubbed).

**Kept from spec 016**

15. With the small screen query matching, the first click shows "The 3D view downloads about 34 MB." in the window with "Load 3D view" and "Cancel" and no iframe; "Cancel" closes the window; "Load 3D view" loads; a later window opens with no warning.
16. Spec 016's error cases, in the window: `assets-unavailable` and `context-lost` show the screenshot, their text and "Try again" (a new iframe); `bad-params`, `unknown-knife`, `unknown-gloves`, `unknown-knife-finish` and `unknown-gloves-finish` show "This combo can't be shown in 3D.", no "Try again", and the card's button is gone after closing, while `unknown-agent` and `unknown-map` never hide it (criteria 11 and 12); `no-webgl2`, and `cs3d:ready` with `webgl2: false`, remove every card's button. With fake timers, 15 s without `ready`, 60 s without an event while loading, and 60 s without an event during a change of agent, each show "The 3D view could not be loaded." with "Try again". The viewer's own `message` never appears.
17. `grep -rn "dangerouslySetInnerHTML" src` prints nothing; `grep -rn "postMessage" src` outside tests matches only `src/viewer/`, and no call passes `'*'`; `grep -rn "localStorage\|sessionStorage" src` outside tests prints nothing.

**Layout, docs, checks and end to end**

18. Manual, in Chrome at 1440 by 900: the view is 16:9 and about 1260 px wide, the page dimmed behind, the wheel does not scroll the page. In Chrome's device mode at 375 by 812: the window fills the screen with the name row on top and the controls at the bottom, buttons at least 44 px tall; at 812 by 375 the name row is hidden and the controls fit in one row.
19. `website/README.md` documents the window (layouts, actions and keys, map and agent, the address, behaviour with an older viewer, nothing stored); `api/README.md` mentions `agents.json` beside `catalog.json`. Spec 012 and 016 are not edited.
20. On a fresh clone with no `.env`: in `website/`, `npm ci`, `npm run api:types:check`, `npm run lint`, `npm test`, `npm run build` (no chunk-size warning) exit 0, the main chunk grows by under 3 kB gzipped and the window's chunk is under 30 kB gzipped (sizes recorded in Implementation notes); in `admin/`, `npm run api:types:check` and `npm test` exit 0; in `api/`, format, lint, mypy, `pytest` (none skipped), the OpenAPI and `export-website` checks exit 0.
21. Manual, against a viewer with V1 to V9 (local build or hosted) and `npm run dev`, in desktop Chrome, Firefox and Safari: the window opens; the screenshot fades into the view with no empty frame; Inspect, Light swing and Heavy swing play by button, F, left click and right click on the view, and right click shows no menu; the mouse does not turn the camera; Map shows Vertigo; switching to Bloody Darryl The Strapped (4613) changes the arms with the knife and gloves unchanged, and the next combo opens on him; after clicking into the view, Escape closes the window; Back closes it; a copied link opened in a new tab shows "Load 3D view". In the iOS simulator: the full-screen layout, the 34 MB warning, Vertigo drawn and the only map (no studio), the buttons playing the actions. Against the viewer of spec 016 (protocol version 1): the window with Inspect only, and no console error.
22. After the branch is pushed, the `website`, `api` and `admin` workflow runs for its latest commit succeed on GitHub; `gitleaks dir . --no-banner --redact` on a clean clone and `gitleaks git` over the branch report no findings; `git diff main... | grep -oE 'https?://[^ )>"]+' | sort -u` lists only `localhost`, `127.0.0.1`, `example.com` placeholders, the game's image host and public documentation.

## Test plan

| Criterion | How it is checked |
| --- | --- |
| 1 | pytest: `api/tests/catalog/test_export.py`; the `--check` command, with and without a change to `agents.json` |
| 2 | The diff command; pytest `tests/combos/test_agents.py::test_public_responses_have_no_agent` |
| 3, 4, 6 to 8 | Vitest with Testing Library and the fake viewer: `src/viewer/ViewerWindow.test.tsx`, `src/pages/Combos.test.tsx` |
| 5 | Vitest: `src/viewer/params.test.ts` |
| 9, 10 | Vitest: `src/viewer/ViewerControls.test.tsx`, `src/viewer/features.test.ts` |
| 11 to 13 | Vitest: `src/viewer/ViewerControls.test.tsx`, `src/viewer/agents.test.ts`, `src/viewer/ViewerWindow.test.tsx` |
| 14 | Vitest with a memory router: `src/viewer/ViewerWindow.test.tsx` |
| 15, 16 | Vitest with stubbed `matchMedia` and fake timers: `src/viewer/ViewerWindow.test.tsx`, `src/viewer/messages.test.ts` |
| 17, 19 | The greps; read the READMEs |
| 18, 21 | Manual, as written |
| 20 | Fresh clone into a temporary directory, then the commands; the build's size lines on `main` and on the branch |
| 22 | Workflow run pages (after the owner pushes); the gitleaks and URL commands |

Section commands. In `website/`:

```bash
npm ci
npm run api:types:check
npm run lint
npm test
npm run build
```

In `admin/`:

```bash
npm ci
npm run api:types:check
npm test
```

In `api/`, with the Compose database up:

```bash
uv sync --locked
uv run ruff format --check .
uv run ruff check .
uv run mypy
uv run pytest
uv run python -m combo_api.openapi --check
uv run python -m combo_api.catalog export-website --check
```

## Open questions

None. On 2026-11-09 the owner accepted every recommendation of the draft: the window's size and phone layout; the name, rating, "Copy link", "Full screen" and "Close" in it and nothing else; the agent list from the website's generated `agents.json` joined with the viewer's built list; the map list from the viewer; remembering the choice for the visit only, with nothing stored; the window's own address `?3d=<combo id>`; the viewer list V1 to V9; one website review after the viewer's phase 6. One change: the plain studio is never a map option, on desktop or on phones, so phones are drawn on Vertigo too (V3). The answers are recorded in Design as the owner's choice.

## Implementation notes

Built in the order of the acceptance criteria, against the hosted viewer (protocol version 2, with the attack animations built, so criterion 21's swing steps ran). Website test paths are relative to `website/src/`.

**Criterion to check**

| Criterion | Covered by |
| --- | --- |
| 1 | `api/tests/catalog/test_export.py:84` `test_agents_export` (commit, 63 agents, `ct` then `t` by name, the four fields, Ricksaw 5404 `ct`), `:100` `test_agents_export_leaves_out_retired_agents`, `:110` `test_agents_export_is_up_to_date_and_checked` (`--check` exits 0, and 1 naming the file after a change), `:123` (the file missing) |
| 2 | `git diff main... -- api/openapi.json` prints nothing; `api/tests/combos/test_agents.py:267` `test_public_responses_have_no_agent`, unchanged |
| 3 | `viewer/ViewerWindow.test.tsx:58` (every card, no iframe, no dialog, nothing posted or requested), `:73` (no WebGL2); `viewer/webgl.test.ts` |
| 4 | `viewer/ViewerWindow.test.tsx:80` (one modal dialog, `showModal`, the label, name and rating, the card's screenshot, the iframe's address, sandbox and title, focus on Close, `overflow: hidden`), `:107` |
| 5 | `viewer/params.test.ts:42`, `:53` (agent and map after `input=game`, nothing for the defaults), `:62`, `:72`, `:80`, `:88` (no `view`, `debug`, `capture` or combo id), `:119` |
| 6 | `viewer/ViewerWindow.test.tsx:123` (progress, the 200 ms fade, removal, "3D view ready"), `:143` (reduced motion), `:203` |
| 7 | `viewer/ViewerWindow.test.tsx:216` (Close), `:250` (`cancel`), `:286` (forwarded Escape, later events ignored), `:315` (full screen), `:325` (Back), `:261`, `:275`, `:179` (another origin, source or key); `viewer/ViewerControls.test.tsx:369` (agent list), `:246` (map list) |
| 8 | `viewer/ViewerWindow.test.tsx:372`, `:394`, `:406` (not shown when `fullscreenEnabled` is false); full screen is on the window's inner wrapper, see the deviations |
| 9 | `viewer/ViewerControls.test.tsx:65` (labels, hints, disabled before `loaded`), `:83` (posts to the viewer's origin only), `:98` (F, not in the agent search), `:109` (`["inspect"]`), `:116` (touch-first) |
| 10 | `viewer/ViewerControls.test.tsx:133` (protocol version 1, and `features` not a list); `viewer/features.test.ts:48` |
| 11 | `viewer/ViewerControls.test.tsx:160`, `:167` (a new id, the same fields and `map`, earlier events ignored, marked after `loaded`), `:188` (`unknown-map`), `:202` (no studio), `:207` (`<b>x</b>` as text), `:213` (bad id, long name, control character, 33 entries, a string); `:226`, `:238`, `:246` (the map list's keys); `viewer/features.test.ts:54`, `:60`, `:65`, `:78` |
| 12 | `viewer/ViewerControls.test.tsx:259` (order, groups, pictures with `no-referrer`, none before the list opens), `:281` (both lists), `:288` (type, Down, Enter; Default without `agent`), `:304` (`unknown-agent`), `:320` (`kept: true`, Try again), `:336`, `:354`; `viewer/agents.test.ts:10`, `:27`, `:33`, `:39` |
| 13 | `viewer/ViewerControls.test.tsx:382` (another card and another finish page, a fresh render, no storage or cookie) |
| 14 | `viewer/ViewerWindow.test.tsx:415`, `:427` (linked window, also without a small screen), `:442`, `:462`; `:468` replaces the Copy link step, see the deviations |
| 15 | `viewer/ViewerWindow.test.tsx:477`, `:499`, `:511`; `viewer/webgl.test.ts:36` |
| 16 | `viewer/ViewerWindow.test.tsx:521` (`assets-unavailable`, `context-lost`), `:543` (the five "can't be shown" codes, the button gone), `:561`, `:570` (the viewer's message never shown), `:594`, `:623` (15 s), `:662` (60 s loading), `:677`, `:692`, `:705`; `viewer/ViewerControls.test.tsx:336` (60 s during an agent change); `viewer/messages.test.ts:87`, `:118` (agent and map codes never hide the button) |
| 17 | The three greps, below |
| 18 | Manual, below |
| 19 | `website/README.md` and `api/README.md` read; `git diff main... -- docs/specs/012-* docs/specs/016-*` prints nothing |
| 20 | Fresh clone, below |
| 21 | Manual, below |
| 22 | gitleaks and the URL command, below; the workflow runs after the push |

**Agreed deviations**

- Full screen (2026-11-09, owner's choice). Criterion 8 says "Full screen" calls `requestFullscreen` on the dialog. Chrome refuses full screen on a modal `<dialog>` (the request is rejected), so it targets the window's inner wrapper, which holds the name row, the view and the controls. The controls stay visible in full screen as Design intends.
- Copy link removed (2026-11-10, owner's decision). R15 and criterion 14 ask for a "Copy link" button. Opening the window already puts `?3d=<combo id>` in the address bar, so the button repeated what the address bar gives. The window's header has Full screen and Close only. Criterion 14's clipboard step is replaced by `ViewerWindow.test.tsx:468`, and criterion 21's "a copied link" step was run with the address bar's link.
- Window size (2026-11-10, owner's request after trying it on a laptop). Design gives the desktop view at most 1600 px and 94% of the screen's width, with the window in 92% of its height. The window is now as wide as the page's content column, so its edges line up with the cards behind it (the page's own 64 px and 176 px side gutters), and narrower where the name row, the 16:9 view and the controls must fit in 86% of the screen's height. At 1440 by 900 the window is 1088 px wide from x 176, as the cards are, and the view 1062 by 597 (criterion 18 expected about 1260 px wide).
- Map menu (2026-11-10, owner's choice). Design names a "Map" menu without saying how it is built; the first build used the browser's native `<select>`, which the owner asked to replace. It is now a button and a list styled like the agent list: arrows, Home, End, Enter or Space, and Escape closes the list only. The website has no component library to take a menu from, so it is built in `ViewerControls.tsx` with no new dependency. Choosing the map already drawn loads nothing.
- Header focus (2026-11-10, owner's request). Focus on Full screen and Close shows as the hover's background instead of an outline, since Close takes focus when the window opens.
- Agent list (2026-11-10, owner's request). On desktop the list stands 12 px in from the view's right edge and above its bottom edge.

**Details settled while building**

- The desktop window is sized to its content, not the full screen: the first build filled the screen.
- On a phone the controls wrap so the agent button stays on screen; at 812 by 375 the name row is hidden and its buttons sit over the view.
- On touch-first devices the agent list opens with focus on the list, not the search box, so the on-screen keyboard does not cover it; Escape still closes it.
- Chrome sometimes closes the dialog on Escape without a `cancel` event. The window then cleans up the same way (iframe, address, scroll lock, focus): `ViewerWindow.test.tsx:261`.
- `onLoaded` is passed from `ViewerHost`, which owns the window; the address helpers are in `viewer/open.ts`.
- The agent button shows the chosen agent's picture. A linked window (`?3d=`) is stripped from the address when the combo is not on the page, the id is malformed, or there is no WebGL2.

**Chunk sizes** (production build, 2026-11-10)

- Main chunk: 409.44 kB (129.95 kB gzipped), against 413.39 kB (130.71 kB gzipped) on `main`: 0.76 kB smaller gzipped, since the window's code moved out of it.
- Window chunk (`ViewerWindow`): 43.50 kB (13.61 kB gzipped), with the agent list.
- Catalog chunk unchanged at 214.64 kB (47.48 kB gzipped). No chunk-size warning.

**Manual checks** (2026-11-09 and 2026-11-10, a production build on `localhost:4173` with `VITE_VIEWER_ORIGIN` set to the hosted viewer; the API read from a local stack, read-only)

- Criterion 18, headless Chrome 156 at 1440 by 900: the view is 16:9, 1062 by 597 after the size change (1252 by 704 before it), with the window lined up with the cards, the page dimmed behind, the wheel does not scroll the page. In device mode at 375 by 812 the window fills the screen with the name row on top and the controls at the bottom, nothing overflows and every button is at least 44 px tall; at 812 by 375 the name row is hidden and the controls fit in one row.
- Criterion 21, Chrome: the window opens; the screenshot fades into the view in about 200 ms with no empty frame; Inspect, Light swing and Heavy swing play by button, F, left click and right click, with no context menu; the mouse does not turn the camera; Map lists Vertigo only; Bloody Darryl The Strapped (4613) changes the arms with the knife and gloves unchanged, and the next combo opens on him; Escape after clicking into the view closes the window; Back closes it; the address bar's link opened in a new tab shows "Load 3D view". No console errors.
- Criterion 21, Firefox and Safari on desktop: checked by the owner on 2026-11-10, pass.
- Criterion 21, iOS Simulator (iPhone 17 Pro, iOS 26.3, Safari): the full-screen layout, the 34 MB warning first, Vertigo drawn and the only map (no studio), and the buttons play the actions.
- Criterion 21, protocol version 1: the viewer of spec 016 (commit `4c96d8c`) built and served locally from a temporary clone, deleted afterwards. It reports version 1; only Inspect, Full screen and Close show, Inspect plays, Close and Escape work, and there are no console errors.

**Results**

On a fresh clone of the branch at `936e2f4`, with no `.env` (2026-11-10):

- `website/`: `npm ci`, `api:types:check` and lint pass; 286 tests in 14 files pass; the build passes with no chunk-size warning.
- `admin/`: `npm ci` and `api:types:check` pass; 366 tests in 27 files pass.
- `api/` (with the Compose database of a separate project): ruff format (119 files formatted), ruff check, mypy (111 files) pass; pytest 459 passed, none skipped; the OpenAPI and `export-website` checks pass.
- Criterion 17: `grep -rn "dangerouslySetInnerHTML" src` prints nothing; `postMessage` outside tests is only `src/viewer/ComboViewer.tsx:84`, to `VIEWER_ORIGIN`; `localStorage` and `sessionStorage` appear only in tests.
- Criterion 22: `gitleaks git` over the branch's 21 commits finds no leaks. The URL command lists `localhost`, `example.com` placeholders, the game's image host (the agents' pictures) and the viewer's public documentation.

**Follow-ups**

- On iOS 26 a strip of the page shows under Safari's floating toolbar, below the window. It needs `viewport-fit=cover` site-wide, outside this spec.
- The view's hands sway with the mouse (the viewer's viewmodel sway). The viewer should turn it off with `input=game`; that is a change in the viewer repository.
- Known limit, not a bug: on a phone held upright Vertigo's background is cropped at the sides, since the view fills a tall screen.

## Audit

Filled in by the audit: one line per acceptance criterion (pass or fail, with evidence), the results of lint, tests, build and the secret scan, and a verdict of Pass, Pass with follow-ups, or Fail.
