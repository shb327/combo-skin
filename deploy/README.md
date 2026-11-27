# Combo Skin publishing

[![deploy](https://github.com/shb327/combo-skin/actions/workflows/deploy.yml/badge.svg)](https://github.com/shb327/combo-skin/actions/workflows/deploy.yml)

The live site has no server. This folder holds the command that publishes it from the back office Mac, the merge deploys that put each merge to `main` live from GitHub Actions on the data already live, and the nightly database backup. The designs are spec 021 ([`docs/specs/021-serverless-publish.md`](../docs/specs/021-serverless-publish.md)) and spec 026 ([`docs/specs/026-deploy-on-merge.md`](../docs/specs/026-deploy-on-merge.md)); why static publishing beat a server is in [`docs/static-publishing.md`](../docs/static-publishing.md).

```text
Mac (never on the internet)                          Cloudflare
  API, public routes ──────> publish ──> data files ─┐
  storage, public bucket ──────────────> new images ─┼─> R2 bucket at img.combo.skin
  origin/main ─> git archive ─> npm run build ───────┴─> Pages project at combo.skin
  PostgreSQL ──> backup ─────────────────────────────> private R2 backup bucket

GitHub Actions, on a merge to main
  live data files (from the site) + the merged commit ─> deploy-code ─> Pages project
```

## Commands

Run from the repository root:

```bash
uv run --project deploy python -m combo_publish <command>
```

| Command | What it does |
| --- | --- |
| `check` | Checks the settings, that the three Keychain items exist (never their values), that the local API and image bucket answer, that the running API's public schemas match `origin/main`'s, that `node`, `npm` and the pinned wrangler work, and that wrangler sees the account. Changes nothing. |
| `publish` | Publishes the site to production (What a publish does). |
| `publish --preview` | The same, but stops after the preview deployment and its smoke test. With `--ref <commit>` it builds that commit instead of `origin/main`. |
| `publish --dry-run` | Prints the plan (combos, data files, images to upload and their size, Pages files) and uploads and deploys nothing. Without the image token it says the bucket was not checked. |
| `publish --verify-images` | Also re-checks every image already in the bucket against its local copy (size and ETag) and uploads a differing one again. |
| `status` | The live production deployment (id, commit, date, and whether it is a publish or a merge deploy), its data (version, export time and commit, and whether it is your last publish's), any rollback, how many commits it is behind `origin/main`, whether the next merge deploy can go out, and whether the local published combos differ from its data. Changes nothing. |
| `deploy-code build --dry-run` | What a merge deploy of `origin/main` (or `--ref <commit>`) would do: downloads the live data, checks its schema against the commit's, builds and checks the site, and checks its images on the image host. Needs no credential, and writes nothing (Merge deploys). |
| `prune-images` | Deletes public images no production publish has used for 30 days. `--dry-run` lists them. `--now <combo id>` deletes one combo's images at once (Removing content now). |
| `backup` | Dumps the database, keeps it on the Mac and copies it to the backup bucket (Backups). |

Only one `publish` or `prune-images` runs at a time; a second one stops and names the one that is running. Images are deleted only by a successful production publish or by `prune-images`. `deploy-code release` runs only in CI (Merge deploys).

## What a publish does

1. Takes the lock, runs `git fetch`, and resolves the tip of `origin/main`. A production publish never takes `--ref`, and the checkout it runs from is not changed: files, branch, index and stash stay as they are.
2. Writes that commit's files to a temporary folder outside the repository with `git archive`.
3. Compares the running API's public schemas (`PublicCombo`, `ComboCounts` and everything they reference, in its `/openapi.json`) with the built commit's `api/openapi.json`, ignoring titles and descriptions. If they differ, it stops and names them: the stack was not rebuilt since a merge changed them. Rebuild it first with `docker compose up -d --wait --build`.
4. Exports the published combos from the local API's public routes: `GET /combo-counts`, then the combos route of each finish with combos. It writes `/data/combo-counts.json` and one `/data/<kind>/<type>/<finish>.json` per finish in the built catalog (`[]` without combos), in exactly the API's shape, with image URLs moved from the local bucket to `https://img.combo.skin`, and `/data/manifest.json`: the data version, when and with which commit the data was exported, the site, image and viewer origins, and the SHA-256 of every other data file. Merge deploys rely on it. A URL anywhere else, or a field the public schema does not list, stops the publish. If a list's length differs from its count (combos edited mid-publish), it exports once more, then stops with "Combos changed while publishing; run it again."
5. Runs `npm ci` and `npm run build` in the archived `website/`, with the production settings as environment variables (no `.env` file), then adds the data files and `_headers`.
6. Checks the folder against Pages' limits (20,000 files, 25 MiB per file, 100 `_headers` rules, 2,000 characters per header line), every data file against the public schema, and that no file holds a local address (`localhost` with a port, `127.0.0.1`, `[::1]`, or the local API or image base).
7. Lists the public bucket once and uploads only the images it does not have, from the local public bucket, 8 at a time, each with its type and `Cache-Control: public, max-age=31536000, immutable`, comparing each returned ETag with the bytes' MD5. Keys never change for changed content, so a key that is there is up to date. A catalog copy missing locally is skipped (the site shows the game's picture); a missing screenshot stops the publish.
8. Deploys the folder to the `preview` branch, then smoke-tests that deployment's own URL: `/` and its headers, `/data/combo-counts.json` (it must equal the export), one finish's data file, the manifest, and one screenshot from the image host.
9. Checks the live deployment is still the one it saw at the start. If a merge deploy went live meanwhile, it stops with "A merge deploy went live during this publish; run it again." The uploaded images stay. Then it deploys the same folder to production (`main`). Pages already has every file, so nothing is uploaded again.
10. Records the deployment, the data files and each image's last use in the state folder, and deletes images no production publish has used for 30 days (never one the live deployment uses).
11. Between recording the deployment and pruning, checks that a merge deploy didn't go live over it. If one did (it carries older data), it rolls production back to this publish, deletes that deployment, and says to run the deploy workflow by hand on `main` to put the newer code live.

A failure at any step exits 1 and leaves the live site on its previous deployment.

The output, in order: the commit and where it goes; published combos and finishes with combos; data files written and changed since the last production publish (the manifest is not counted); images referenced, uploaded (count and MB), already there and waiting to be pruned; Pages files and the preview URL checked; the production URL and deployment id; how to roll back.

### Headers

The command writes the site's `_headers` from the settings: on every response the Content Security Policy (scripts only from the site and Web Analytics, styles and fonts only from the site, images from the site, the image host and the game's host, frames only from the viewer, requests only to the site and Web Analytics' beacon), HSTS (`max-age=31536000`), `nosniff`, `Referrer-Policy`, `Permissions-Policy` and `Cross-Origin-Opener-Policy`; `Cache-Control: immutable` on `/assets/*` and `/fonts/*`; and `X-Robots-Tag: noindex` on every `pages.dev` address. `combo.skin` itself has no `noindex`. HTML and data files keep Pages' default caching, which revalidates on every load. The expected file is [`tests/golden/_headers`](tests/golden/_headers).

### State

The state folder (`state_dir`, outside the repository) holds `state.json` (the last production deployment and the image keys it uses, each data file's hash, and the date each image key was last used by a production publish) and the lock. No credential is ever in it. If it is lost, the next production publish marks every image in the bucket as used that day, so nothing is pruned because of it, and `prune-images` (without `--now`) refuses to run until a production publish has recorded the live deployment again.

## Settings

Copy [`publish.example.toml`](publish.example.toml) to `deploy/publish.toml` (gitignored) and fill it in. It names the account, the Pages project, the two buckets, the site, image and viewer origins, the local API and bucket, the state and backup folders, the Compose project and the Keychain service names. None of them is a secret. `local_image_base_url` must be the API's `IMAGE_BASE_URL`.

## Credentials

The command reads three credentials from the macOS login Keychain at run time and from nowhere else: never a `.env` file, a command line or wrangler's own login. Wrangler gets the Pages token only through its own process environment (`CLOUDFLARE_API_TOKEN`, with `CLOUDFLARE_ACCOUNT_ID` from the settings), with an empty home folder, so its login and config are never read. Nothing the command prints, logs or writes holds a credential, and anything it prints is scrubbed of the values it read.

| Keychain service (default) | Holds | Scope |
| --- | --- | --- |
| `combo-skin-pages` | A Cloudflare API token | Account › Cloudflare Pages › Edit, on the one account only |
| `combo-skin-r2-images` | `<access key id>:<secret access key>` of an R2 token | Object Read & Write, on the public image bucket only |
| `combo-skin-r2-backup` | `<access key id>:<secret access key>` of an R2 token | Object Read & Write, on the backup bucket only |

Add each one by typing it at the prompt, so it is never on a command line or in the shell history:

```bash
security add-generic-password -U -s combo-skin-pages -a combo-skin -w
```

A missing item stops the command with its service name and this command.

## Merge deploys

Every merge to `main` goes live by itself, a few minutes later, on the data the live deployment already serves (spec 026). Combos still change only with a `publish` from the Mac: a merge deploy never adds, edits or removes one, never touches the image bucket, and never reaches the Mac.

### What a run does

The `deploy` workflow ([`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)), on a push to `main` or a run by hand:

1. `check` (this package's checks) and `website` (the website workflow, called) must pass. `gate` reads the switch.
2. `build-site`, with no Cloudflare credential, runs `deploy-code build`:
   - downloads `/data/manifest.json` from the production address and every file it lists, checking each one's SHA-256 (a publish landing mid-download starts it over once);
   - compares the public schemas (`PublicCombo`, `ComboCounts` and what they reference) of the data's export commit with the merged commit's `api/openapi.json`, and stops if they differ;
   - fits the data to the merged catalog: a new finish gets `[]`, an empty finish that left the catalog is dropped, and one with combos stops the run; every other file stays byte for byte;
   - checks the data against the merged commit's schema, builds the website with the manifest's origins, adds the same `_headers` a publish would, and runs the publish's site checks;
   - checks anonymously on the image host that every link-preview image the pages name is there (one missing stops the run) and every catalog copy (one missing is a warning: the site shows the game's picture until the next publish).
3. `deploy-site`, on a fresh machine in the `production` environment, runs `deploy-code release` with the Pages token. It checks on Pages that the live deployment holds the built data and is the newest production deployment (or that the run was started by hand), deploys to `preview`, smoke-tests that deployment, checks nothing went live meanwhile, and deploys to production. If a publish landed during the production deploy, it rolls production back to that publish and deletes its own deployment.
4. `report` adds one summary line when an earlier job stopped without saying why.

A merge deploy's Pages commit message is `Combo Skin <commit> merge deploy, data <data version>`; a publish's is `Combo Skin <commit>`. That is how `status` tells them apart.

### Outcomes

The run summary's first line says what happened. Whatever stops a run leaves production as it was.

| First line | Run | What to do |
| --- | --- | --- |
| `Live: commit …, deployment …, on the data of the publish of …` | green | Nothing. |
| `Not deployed: merge deploys are off (repository variable MERGE_DEPLOY).` | green | Turn it on (below), if you want it on. |
| `Not deployed: a run by hand on another branch builds and checks only; only main deploys.` | green | Nothing: a check of that branch. |
| `Not deployed: already live in …` | green | Nothing: a newer commit, usually from a publish, is live. |
| `Needs a publish from the Mac: …` | red | `publish`. The reason names it: a public schema change, a finish with combos leaving the catalog, missing preview images, no manifest yet, or rolled-back data. |
| `Paused: production is rolled back to deployment …` | red | Run the workflow by hand on `main` to deploy anyway, or `publish`. |
| `Failed: …` | red | Read the reason. "A publish went live during this run; run it again." and "A deployment went live during this run; run it again." mean a re-run is enough. |
| `Not deployed: the website checks failed.` (or another job) | red | Fix `main`. |

GitHub sends its usual email for a failed run.

### Turning it off

The repository variable `MERGE_DEPLOY` is the switch: GitHub › the repository › Settings › Secrets and variables › Actions › Variables. Only `on` lets a push or a run by hand on `main` deploy. Unset, or any other value, nothing is deployed and the run says so. Turning it off needs no code change.

### Rollbacks and merge deploys

A rollback in the dashboard works as before (Rollback). Then:

- Rolled back to an older publish's data: merge deploys stop with "Needs a publish from the Mac" until the next `publish`, or a roll forward.
- Rolled back to a deployment with the same data (bad code from a merge): pushes stop with `Paused:`. Merge the fix, then run the workflow by hand on `main` (Actions › deploy › Run workflow › main), or `publish`.

A `publish` always ends the pause: its deployment becomes the live and the newest one.

### Setup

Once, after spec 026 is merged. Nothing in the repository changes GitHub or Cloudflare settings.

1. `publish` once from the Mac, so the live deployment has a manifest. `status` then shows `Merge deploys: can deploy on this data`.
2. **Cloudflare token for CI.** My Profile › API Tokens › Create Token › Custom token. Permissions: Account › Cloudflare Pages › Edit. Account Resources: Include › the Combo Skin account only. TTL: 12 months. No IP filter (GitHub's runners have no fixed addresses). It is a separate token from the Mac's. Copy it once.
3. **GitHub environment.** The repository › Settings › Environments › New environment `production`. Deployment branches and tags: Selected branches and tags › `main`. No required reviewers. Environment secrets: `CLOUDFLARE_API_TOKEN` (the token) and `CLOUDFLARE_ACCOUNT_ID` (the account id).
4. **Project name.** Settings › Secrets and variables › Actions › Variables › New repository variable `PAGES_PROJECT`: the Pages project's name. It is not a secret (its `pages.dev` address is public), so the run logs show it as it is.
5. **A check.** Actions › deploy › Run workflow, on any branch but `main`: `build-site` passes and `deploy-site` is skipped.
6. **Turn it on.** Settings › Secrets and variables › Actions › Variables › New repository variable `MERGE_DEPLOY` = `on`.
7. **The test run** (spec 026, criteria 22 to 26): a trivial merge goes live by itself; a run by hand on a throwaway branch with a field added to `PublicCombo` stops with "Needs a publish from the Mac"; a dashboard rollback still works, and pauses the next merge; a `publish` after merge deploys succeeds.
8. A calendar reminder before the token expires. When it does, runs stop with `Failed:` and the Pages API's refusal; make a new one and replace the secret.

## Runbooks

Every Cloudflare step is done by the owner, or with the owner's go-ahead at the time.

### One-time setup (before the test run)

1. **Pages project.** Workers & Pages › Create › Pages › Upload assets (Direct Upload). Name it, and keep the production branch `main`. Don't connect a Git repository: the command uploads the site.
2. **Public image bucket.** R2 › Create bucket.
   - Settings › Custom Domains › Connect `img.combo.skin`, minimum TLS 1.2. Nothing links to it before going live, so connecting it now is safe.
   - Settings › Public Development URL (`r2.dev`): disabled.
   - The `combo.skin` zone › Caching › Cache Rules: a rule for hostname `img.combo.skin`, eligible for cache, edge TTL from the origin's `Cache-Control`, like the rule for `assets.combo.skin`.
3. **Private backup bucket.** R2 › Create bucket. No custom domain and `r2.dev` disabled: it is reachable only with its own token.
4. **Pages token.** My Profile › API Tokens › Create Token › Custom token. Permissions: Account › Cloudflare Pages › Edit. Account Resources: Include › the Combo Skin account only. No zone permissions. Optionally a client IP filter and an expiry date.
5. **Two R2 tokens.** R2 › Manage API tokens › Create API token, twice. Permissions: Object Read & Write. Specify buckets: "Apply to specific buckets only", the public image bucket for one and the backup bucket for the other. Each shows an access key id and a secret access key once.
6. **Keychain.** Add the three items (Credentials), the R2 ones as `<access key id>:<secret access key>`.
7. **Settings.** Fill in `deploy/publish.toml`, and install the pinned wrangler with `npm ci` in `deploy/`.
8. **Check.** `uv run --project deploy python -m combo_publish check` prints every item as ready.

Before the test run, the viewer's own repository adds the `pages.dev` addresses to its allowed parents (spec 021, Design, 3D on the test address), so "View in 3D" can be tested there.

### Test run

1. `publish --dry-run`, then `publish --preview`.
2. On `https://preview.<project>.pages.dev`: home, a type page, a combos page with screenshots from `img.combo.skin`, a catalog picture, and its fallback to the game's host (block `img.combo.skin` in the browser's dev tools) all load, with no CSP violation in the Chrome and Firefox consoles.
3. `curl -sI https://preview.<project>.pages.dev/` shows the headers of Headers above and `X-Robots-Tag: noindex`.
4. A second `publish --preview` with no changes uploads 0 images, and wrangler reports no new files.
5. "View in 3D" opens, draws the combo, and plays Inspect.
6. A production publish (`publish`) to `https://<project>.pages.dev`. `combo.skin` still shows the coming-soon page.
7. The rollback rehearsal: change a combo in the dashboard and publish again, so there are two production deployments with different data. Roll back to the first (Rollback), check its data shows on `https://<project>.pages.dev` and its screenshots still load, then publish again to return to the newest.

### Going live

When the owner says so, after the credits page is merged:

1. Send a test email from an outside address to each of `bugs@`, `combos@`, `partners@` and `privacy@combo.skin`, and check each arrives in the mailbox (`dig MX combo.skin` shows Email Routing's records). Going live stops if one doesn't: the site and its Terms and Privacy Policy name all four.
2. `publish`, then `status`.
3. Remove `combo.skin` from the coming-soon project's custom domains, and add it to the new project (Custom domains › Set up a domain).
4. Check `https://combo.skin`: `curl -sI` for the headers and HSTS, the pages (with `/terms`, `/privacy`, `/credits` and `/licences.txt`), the images and "View in 3D".
5. Turn on Web Analytics for the new project, and check `combo.skin`'s history stays in its Web Analytics site. Check whether it leaves out visitors from the EEA, the UK and Switzerland. If it does, add to the Privacy Policy's "Visitor statistics" (`website/src/legal/privacy.ts`, after "We see only totals."): "Cloudflare leaves out visitors from the EEA, the UK and Switzerland by default, so if you're there, your visits aren't counted." Add its new date and hash to `website/src/legal/updated.json` (the website's tests say what's missing) and publish again (spec 023, criterion 13).
6. Keep the `www` redirect rule as it is.
7. Keep the coming-soon project for a week as the fallback (going back is moving the domain back), then delete it if the owner wants.

### Rollback

Pages dashboard › the project › Deployments › an earlier production deployment › ⋯ › Rollback to this deployment (or the Pages API with the Pages token). The data rolls back with the code, since they are one deployment. Images unused by production for more than 30 days may be gone, so those combos show their catalog pictures. `status` then shows the rolled-back deployment; the next `publish` deploys the tip of `origin/main` again. Until then, merge deploys pause (Rollbacks and merge deploys).

### Removing content now

For a combo that must go at once:

1. Unpublish it in the dashboard.
2. `publish`: the site no longer lists it.
3. `prune-images --now <combo id>`: its screenshots are deleted from the bucket.
4. Purge the image URLs it printed from Cloudflare's cache: the `combo.skin` zone › Caching › Configuration › Purge Cache › Custom Purge, one URL per line.

### Backups

`backup` runs `pg_dump -Fc` inside the Compose project's `db` container (with the container's own credentials), checks the dump with `pg_restore --list` there, and stores it as `<YYYY-MM-DD_HHMMSS>.dump` in `backup_dir` with mode 600. Then it uploads it to the backup bucket as `db/<name>`, checks the ETag, and keeps the newest 30 dumps there plus the first dump of each of the last 12 months. On the Mac it keeps the newest 30, and never deletes a dump that has no copy in the bucket. A failed dump keeps nothing; a failed upload is logged and exits 1. Dumps hold admin password hashes and sessions: they only ever go to the backup bucket. Only the database is backed up: the worker re-renders screenshots and `copy-images` makes the catalog copies again.

**Setup**, after the backup bucket and its token exist:

```bash
deploy/backup/install.sh
```

It writes the LaunchAgent `skin.combo.db-backup` (from [`backup/skin.combo.db-backup.plist.template`](backup/skin.combo.db-backup.plist.template), with this checkout's paths) to `~/Library/LaunchAgents`, replacing an older job with the same label, and loads it. It runs every day at 03:00 and logs to `~/Library/Logs/combo-skin/db-backup.log`. The Mac must be logged in, so the Keychain is unlocked. If an older backup job used another plist file name, remove that file too.

- Check it: `launchctl print gui/$(id -u)/skin.combo.db-backup` shows the job and its 03:00 calendar.
- Run it now: `launchctl kickstart gui/$(id -u)/skin.combo.db-backup`; the log ends with `OK` and the dump is in the bucket.

**Restore**, tested on a throwaway database, never the live one:

1. Download a dump: R2 › the backup bucket › `db/<name>.dump` › Download (or take a local copy from `backup_dir`), as `restore.dump`.
2. Restore it into a new database in the running `db` container:

   ```bash
   docker compose exec db sh -c 'createdb -U "$POSTGRES_USER" restore_check'
   docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d restore_check --no-owner' < restore.dump
   ```

3. Compare the exact row count of every table ([`backup/counts.sql`](backup/counts.sql)) with the live database; it prints `same` when they match:

   ```bash
   for db in live restore_check; do
     docker compose exec -T -e DB=$db db sh -c '[ "$DB" = live ] && DB=$POSTGRES_DB; psql -U "$POSTGRES_USER" -d "$DB" -At' < deploy/backup/counts.sql > /tmp/$db.counts
   done
   diff /tmp/live.counts /tmp/restore_check.counts && echo same
   ```

4. Drop it: `docker compose exec db sh -c 'dropdb -U "$POSTGRES_USER" restore_check'`.

To restore for real, stop the API, restore into the database named in `api/.env` with `pg_restore --clean`, and start the API again.

## Development

```bash
cd deploy
uv sync --locked
uv run ruff format --check && uv run ruff check && uv run mypy && uv run pytest
npm ci   # the pinned wrangler, needed only to publish
```

The tests run every command against fakes: a fake API and local bucket, fake R2 buckets, a fake Keychain, and fake `wrangler`, `npm` and `docker` programs that record their arguments and environment; `git` runs on a temporary repository with its own origin. No test can reach the real Keychain, R2 or the network. CI (`.github/workflows/deploy.yml`) runs the same checks with read-only permissions and no secrets. The merge deploy jobs in the same workflow deploy code only, on the live data (Merge deploys); only `deploy-site` holds a Cloudflare credential.
