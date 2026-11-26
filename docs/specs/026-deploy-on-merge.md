# 026: Deploy code on merge

**Status:** Draft
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** deploy (with the CI workflows)
**Branch:** 026-deploy-on-merge

## Summary

Every merge to `main` goes live by itself, minutes later, without the Mac. A GitHub Actions run builds the website at the merged commit, pairs it with the data files the live production deployment already serves, checks the result with the publish command's own checks, deploys it to the preview branch, smoke-tests it, and only then deploys it to production. Combos still change only when the owner publishes from the Mac: a merge never adds, removes or edits a combo, and a merge that needs data in a new shape is refused with "needs a publish from the Mac".

Every production deployment is still code and data together, on the site's own origin, with the same CSP, so a rollback in the Cloudflare dashboard works as it does today.

## Goals and non-goals

**Goals**

- Code fixes go live after a merge, with no step on the Mac.
- The data of a merge deploy is exactly the data of the newest production deployment, which always comes from the last publish on the Mac. Nothing in CI can publish a combo.
- A merge whose code expects a different public schema than the live data, or that would undo a rollback, is not deployed, and the run says why.
- A merge deploy and a Mac publish that overlap never leave old data live.
- `status` on the Mac tells a merge deploy from a rollback.
- One switch turns merge deploys off without a code change.
- The `combo_publish` package does the work, so the Mac and CI share one pipeline.

**Non-goals**

- Changing how combos are published. `publish`, `prune-images`, `backup`, the screenshot worker and the database backup job keep working as they do (with the two additions to `publish` in R16 and R17).
- Touching R2. CI has no R2 credential, never uploads, lists or deletes an image.
- Moving data to R2 or another origin, CORS, or any change to the CSP or `_headers`.
- Previews of pull requests on Pages, and deploys from any branch but `main`.
- Warning on pull requests that a merge will need a publish. A later spec could run `deploy-code build` on same-repository pull requests, with no environment and no token (owner's choice).
- Anything on Cloudflare or GitHub settings while this spec is written or built. The owner does the setup (Design, Setup).

## Context

- Spec 021 (Audited) publishes from the Mac: `uv run --project deploy python -m combo_publish publish` builds the tip of `origin/main` with a fresh export of the published combos and deploys both to the Pages project, preview first, then production (`deploy/src/combo_publish/publish.py`). Its Design row "How code reaches the live site" rejected building on Pages from GitHub with the data in R2: code and data would get separate lifecycles, a rollback would restore code and not data, the website would read cross-origin data (CORS, a wider `connect-src`), and spec 022's pages need the data at build time. Its non-goals exclude "publishing on a schedule or on every merge". This spec keeps the reasons and takes another route: CI reuses the data already live, inside the deploy, so none of those problems arise.
- So today a merged fix (pull request 30, the focus rings) waits on `main` until the next publish.
- The data files (`export.py`): `data/combo-counts.json` (`ComboCounts`) and one `data/<kind>/<type>/<finish>.json` (`PublicCombo[]`, `[]` without combos) per finish of the built commit's catalog. Image URLs are under the public image host. Nothing in the deploy says which commit or schema the data was exported with.
- `site.py`: `build_website` (`npm ci`, `npm run build` with `VITE_IMAGE_BASE_URL` and `VITE_VIEWER_ORIGIN`), `assemble` (dist, data files, `_headers`) and `check` (Pages' limits, no local address, no inlined `data:` asset, every data file in the public schema).
- `schema.py`: `public_schemas` and `schema_drift` compare `PublicCombo`, `ComboCounts` and what they reference between two OpenAPI documents, ignoring titles and descriptions. `PublicSchema` validates data files and refuses fields the schema doesn't list.
- `api/openapi.json` is committed, and the api workflow fails when it differs from the code (`python -m combo_api.openapi --check`). So any commit's public schema can be read from git, without a database.
- `smoke.py` checks a deployment's own URL: `/` and the headers of `headers.every_response`, the counts, one finish file, one screenshot.
- `wrangler.py` deploys with `--branch`, `--commit-hash` and `--commit-message "Combo Skin <commit>"`. `pages_api.py` reads the project's canonical (live) deployment. `status.py` prints it, how far behind `origin/main` it is, and whether the local combos differ from its data.
- `state.py`: `state.json` on the Mac (the last production publish, its image keys, each data file's hash, each image's last use) and `Lock`, a file lock that only works on the Mac. `prune.py` never deletes an image the recorded live deployment uses or one used by a production publish in the last 30 days.
- `.github/workflows/deploy.yml` runs lint, types and tests of `deploy/` on every push and pull request, and says "Read-only, and no secrets: nothing in CI can publish." Its concurrency group cancels a running workflow on a newer push to the same ref. `website.yml` lints, tests and builds the website. Actions are pinned by commit hash, with `permissions: contents: read` and `persist-credentials: false`.
- Pages answers a path that isn't in the deploy with the app's `index.html` and status 200 (spec 021, Design, Routing), so a missing data file looks like a successful download of HTML.
- Pages keeps every deployment for 30 days, and after that only the 100 most recent (preview and production both count) and the live one. Its API lists a project's deployments with `env=production` or `env=preview`, rolls production back to a deployment, and deletes a deployment; each deployment carries its `environment`, `created_on`, `url` and `deployment_trigger.metadata` (`commit_hash`, `commit_message`).
- **Measured on the live site (26 November, public files only):** 640 combos; 30 glove finishes and 433 knife finishes with combos; a finish file is up to about 45 KB. There is no `data/manifest.json` yet.
- Spec 022 (Approved, not built) prerenders a page per route from the built `index.html` and the data folder, and makes one preview JPEG per finish with combos at `og/<combo id>/<version id>.jpg`, uploaded by the publish.

## Requirements

**The data manifest**

- R1. Every deploy holds `data/manifest.json` (API / data model): the data version (the export's SHA-256, as `state.json`'s `data_sha256`), when and with which commit the data was exported, the site, image and viewer origins it was built for, and the SHA-256 of every other file under `data/`. `publish` writes it. The manifest itself is left out of the changed-files count of spec 021's R11.

**The merge deploy**

- R2. `combo_publish deploy-code build` makes and checks the site folder of one commit with no credential at all. It refuses to start if `CLOUDFLARE_API_TOKEN` is in its environment. In order:
  1. It downloads the live manifest from the production address (`https://<project>.pages.dev`), then every file it lists, and checks each one's SHA-256 and `application/json` type. On a mismatch (a publish landed mid-download) it starts over once, then stops with "The live data changed during the download; run it again."
  2. It reads the public schemas of the manifest's export commit and of the built commit (`api/openapi.json` of each, from git). If they differ, it stops with "Needs a publish from the Mac: the merged code expects public schemas the live data doesn't have (`<names>`)." This happens before `npm` runs.
  3. It fits the data to the built commit's catalog: a finish new to the catalog gets `[]`; a finish that left the catalog is dropped if it is `[]`. A finish that left the catalog with combos, or a count for a finish not in the catalog, stops with "Needs a publish from the Mac: `<kind>/<type>/<finish>` has combos but is not in this commit's catalog." Every other data file is kept byte for byte, and the manifest keeps its data version, export time, export commit and origins, with its file list updated.
  4. It checks the data again: every combo in the built commit's public schema, each list's length equal to its count, equal glove and knife totals, and every URL under the manifest's image origin or (for `fallback_image_url`) the game's host.
  5. It builds the website at that commit with the manifest's image and viewer origins (`site.build_website`), assembles the folder with the data and the `_headers` the publish would generate for the same origins (`site.assemble`), and runs `site.check`.
  6. It checks, anonymously on the image host, that every image the built pages reference is there: a missing link-preview image (spec 022) stops with "Needs a publish from the Mac: `<n>` preview images of this code are not uploaded"; a missing catalog copy is listed as a warning and the build goes on (the site shows the game's picture, as after a publish with copies missing locally).
  7. It writes the folder and a `plan.json` (the commit, the manifest it downloaded, the warnings).
- R3. `combo_publish deploy-code release <folder>` deploys a folder made by `build`. It needs only the Pages token and account id, from its environment. In order:
  1. It runs `site.check` on the folder again.
  2. It reads from the Pages API the live (canonical) deployment L and the newest production deployment N, and fetches each one's manifest from its own deployment URL.
  3. It stops, deploying nothing, at the first of these that holds, in this order:
     - L has no manifest: "Needs a publish from the Mac: the live deployment has no data manifest."
     - L's commit is not in the repository: "The live commit is not on main."
     - The built commit is L's commit or an ancestor of it, for example because a publish took a newer `main`: "Already live in `<commit>`" (exit 0).
     - L and N hold different data versions (the data was rolled back): "Needs a publish from the Mac: production is rolled back to the data of `<date>`."
     - L is not N and the run was started by a push (the code was rolled back): "Paused: production is rolled back to deployment `<id>`. Run this workflow by hand on main to deploy anyway, or publish from the Mac." A run started by hand on `main` goes on (Design, Rollbacks).
     - The folder's data version is not L's: "A publish went live during this run; run it again."
  4. It deploys the folder to the `preview` branch, with the commit message of R5, and runs the publish's smoke test against that deployment's own URL, with the folder's data in place of an export, plus `data/manifest.json`.
  5. Just before production, it reads L and N again. If either changed, it stops: "A deployment went live during this run; run it again."
  6. It deploys the same folder to production.
  7. It lists the production deployments again. If one was created after N and before its own (a publish landed in between), it rolls production back to the newest of those, deletes its own deployment, and exits 1 with "A publish went live during the production deploy; production was rolled back to it." If one was created after its own, it says so and exits 0: the newer deployment carries newer data.
- R4. `deploy-code build --dry-run [--ref <commit>]` runs on the Mac too, with the project name from `deploy/publish.toml`, and prints what CI would do up to step 7 of R2. It needs no credential.
- R5. A merge deploy's Pages commit message is `Combo Skin <commit 12> merge deploy, data <data version 12>`. A publish keeps `Combo Skin <commit 12>`. The words `merge deploy` are how `status` and the release tell the two apart.
- R6. The data of a merge deploy equals the live data byte for byte, apart from `[]` files added or dropped by R2 step 3 and the manifest's file list. `deploy-code` has no code path to the image buckets, the local API or the database.

**The workflow**

- R7. `.github/workflows/deploy.yml` keeps its `check` job as it is, and adds:
  - `website`: the website workflow, called as a reusable workflow, so the merged commit's website lint, tests and build must pass.
  - `gate`: decides whether to go on and writes the reason to the run summary when not.
  - `build-site`: after `check`, `website` and `gate`; checks out the full history (for the export commit's schema), runs `deploy-code build` with no environment and no Cloudflare credential, and uploads the folder as an artifact kept for one day.
  - `deploy-site`: after `build-site`; in the `production` environment, downloads the artifact and runs `deploy-code release`. It installs only `deploy/`'s Python packages and its pinned wrangler; the website's npm packages never run on this machine.
  - `report`: always runs last and writes one summary line when an earlier job failed or was skipped ("Not deployed: the website checks failed").
- R8. The new jobs run only for a push to `main` or a run started by hand (`workflow_dispatch`), and only when the repository is `shb327/combo-skin`. Never for `pull_request` or `pull_request_target`. A run started by hand on another branch runs `build-site` as a check and never `deploy-site`.
- R9. `deploy-site` runs one at a time (its own concurrency group, never cancelled). The workflow's concurrency no longer cancels a run on `main`, so a deploy is never cut off; a newer push waits, and Actions replaces an older waiting run with the newer one, whose commit holds both.
- R10. The switch is the repository variable `MERGE_DEPLOY`. Only the value `on` lets a push or a run by hand on `main` deploy; unset or any other value, `gate` writes "Not deployed: merge deploys are off (repository variable MERGE_DEPLOY)" and nothing else runs. It starts unset, so nothing deploys before the setup is done. A run by hand on another branch builds and checks whatever the switch says, since it never deploys.
- R11. Every run that does not deploy says why in its summary, with the first line one of: `Live:`, `Not deployed:`, `Needs a publish from the Mac:`, `Paused:` or `Failed:`. Refusals and failures exit 1, so the run is red and GitHub sends its usual failed-run email; `Already live`, a switched-off run and a hand-started check on a branch exit 0. A successful run's summary names the commit, the production deployment id, the data version and the publish it came from, and how to roll back.
- R12. Whatever stops a run before R3 step 6 leaves production as it was. After step 6, only step 7's rollback changes production again.
- R13. The comment at the top of `deploy.yml` says what is now true: the `check` job is read-only with no secrets; the merge deploy jobs deploy code with the live data, and only `deploy-site` holds a Cloudflare credential.

**The Mac**

- R14. `status` prints, without changing anything:
  - `Live:` the deployment id, commit, date, and `merge deploy` or `publish`;
  - `Data:` the data version, when it was exported and with which commit, and whether it is the data of the last publish recorded in `state.json`;
  - `Rollback:` `none`, or the deployment production is rolled back to and the newest production deployment;
  - `Behind origin/main:` as today;
  - `Merge deploys:` `can deploy on this data`, or the reason the next one will stop (no manifest, rolled-back data, or the public schemas of `origin/main` differ from the data's, with the names);
  - and, as today, whether the local published combos differ from the live data.
  A merge deploy is never shown as a rollback, and a live merge deploy on the last publish's data counts as up to date with that publish.
- R15. `publish` keeps everything spec 021 says, and its `state.json` still describes its own last production deployment. A merge deploy changes nothing on the Mac.
- R16. `publish` reads the live deployment from the Pages API before it starts, and again just before its production deploy. If it changed (a merge deploy went live meanwhile), it stops before production with "A merge deploy went live during this publish; run it again." The images it uploaded stay; the next run finds them there.
- R17. `publish` writes the manifest of R1, and its smoke test checks it.

**Docs**

- R18. `deploy/README.md` gets "Merge deploys": what a run does, the outcomes of R11 and what to do for each, the switch, the setup checklist (Design, Setup), and how rollbacks pause merge deploys. Its Rollback runbook and `docs/static-publishing.md` say that merges now go live by themselves, on the last publish's data. The root README says the same in a line.

## Design

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| How code reaches the live site (changes spec 021's choice) | Code: every merge, from CI, with the live deployment's data inside the deploy. Data: only `publish` on the Mac, as before. Spec 021's Design row and its non-goal "on every merge" are replaced for code by this row; its data decisions stand | Pages building from GitHub with the data in R2: rejected by spec 021, for reasons that still hold. A nightly publish on the Mac: still needs the Mac awake, and would publish half-entered combos as soon as they are marked published. Keeping the Mac-only publish: the reason for this spec |
| Where the live data comes from | The files of the live deployment, listed and hashed by its manifest, downloaded from the production address and checked against the live deployment's own manifest in `release` | Exporting from the API in CI: the API and database are never on the internet (spec 021, S1). The live commit's catalog as the file list: no integrity check, no data version and no export commit, and it breaks on the first merge deploy, whose commit isn't the export's |
| The data manifest | A new public file under `data/`: hashes, data version, export commit and the three origins. Needs one publish after this spec is built before merge deploys can run | No manifest: see the row above. The origins as GitHub variables: a second copy of the Mac's settings that could drift and change the CSP; the manifest carries what the live data was built for |
| Data shape changes | Refuse when the public schemas of the export commit and the merged commit differ in anything but titles and descriptions (`schema_drift`), and validate every data file against the merged commit's schema | Validating the data alone: a new optional field passes, though the merged code may expect it. Allowing additive changes: needs rules for what is compatible; a publish is one command |
| Catalog changes | New finishes get `[]`, finishes leaving the catalog are dropped only when empty | Refusing every catalog change: catalog updates after a game update are routine merges. Keeping files for removed finishes: the Mac publish wouldn't write them either |
| Rollbacks (owner's choice) | A run deploys only when the live deployment and the newest production deployment hold the same data. A push run also pauses while the code is rolled back; a run started by hand on `main` deploys anyway. A publish ends any pause, since it becomes the newest and the live deployment | Ignoring rollbacks: the next merge would undo a rollback of bad code while `main` still has it, or redeploy rolled-back data whose images the Mac may prune 30 days on. Pausing on data rollbacks only: a fix merged after rolling back bad code would go out by itself, but so would any other merge while `main` still has the bad code |
| Racing with a publish | Optimistic checks on Pages' own state: the data version in `release`, L and N re-read just before production, and a check after production that rolls back to a publish that landed in between and deletes the stale deployment. `publish` re-reads the live deployment before production. GitHub concurrency keeps one merge deploy at a time | A shared lock: CI and the Mac share nothing writable but Cloudflare; a lock object in R2 needs an R2 credential in CI and stale-lock handling. Leaving the race: a stale deploy could put old data back over new combos |
| Recognising merge deploys | The words `merge deploy` in the Pages commit message (R5), read from `deployment_trigger.metadata.commit_message` | A separate Pages branch for CI: production must be branch `main`. Tracking deployments in `state.json`: the Mac doesn't see CI's |
| Where the jobs live | New jobs in `deploy.yml`, next to the unchanged `check` job, with the website workflow called as a reusable workflow (`workflow_call` added to `website.yml`) | A separate workflow waiting on others with `workflow_run`: one trigger per finished workflow, so it must look up the other checks of the same commit itself. Repeating the website's steps: two copies of its checks |
| Called website workflow | `website.yml` gets `workflow_call` and its concurrency group gains `${{ github.workflow }}`, so the called copy and its own push run don't cancel each other. Its job is unchanged. The website checks run twice on a push to `main`, which costs nothing on a public repository | Dropping `website.yml`'s own push run on `main`: changes what its status check means |
| Build and deploy on separate machines | `build-site` runs `npm ci` and the website build with no credential; `deploy-site`, a fresh runner, holds the token and never installs the website's packages. The folder moves between them as an artifact | One job: the token would share a machine with every npm package's install scripts. Hiding the token from child processes isn't enough on one runner, since the same user can read other processes and write files a later step runs |
| Preview branch | The same `preview` branch as `publish --preview`; the smoke test uses the deployment's own URL | A separate branch for CI: one more alias for nothing; the alias always shows the newest preview |
| The token | A new token for CI only: Account › Cloudflare Pages › Edit, on the one account. That covers every call: reading the project and its deployments, `wrangler pages deploy`, rollback and delete (both need Pages Write). No zone, R2, Workers or user permission. An expiry of 12 months; no IP filter, since GitHub's runners have no fixed addresses | Reusing the Mac's Pages token: revoking one would break both. A read-only token for the checks plus an edit token: every check runs in the same job as the deploy anyway |
| Secrets and variables (owner's choice) | Environment `production` (deployments from `main` only, no reviewers): secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Repository secret `PAGES_PROJECT`, since `build-site` has no environment and needs it to find the live data; as a secret it is masked in the public logs. Repository variable `MERGE_DEPLOY` | The project name as a variable: simpler to read and edit, but the `pages.dev` address would show in every public run log. All in the environment: `build-site` would have to join it, with the token in reach of the npm packages |
| Forks | Nothing new runs on pull requests. Forks' pull requests get no secrets and a read-only token from GitHub anyway, environment secrets reach only jobs on `main`, and the repository check (R8) skips the jobs in a fork's own Actions | |
| Images | Never touched. A merge deploy references the same screenshots as the live data, which the Mac's pruning protects (spec 021, R17), and checks link-preview and catalog images anonymously (R2 step 6) | Uploading in CI: needs the local bucket, which is on the Mac |
| Missing catalog copies (owner's choice) | A warning, and the deploy goes on, as `publish` does; the site shows the game's picture until the next publish uploads the copy | Refusing: every catalog update would need the Mac |
| Turning it off | The repository variable `MERGE_DEPLOY` (R10), changed in Settings › Secrets and variables › Actions › Variables | Disabling the workflow: also stops the `check` job. A file in the repository: a merge to turn off merges |
| Outcomes | Run summary first lines of R11, written by `deploy-code` through `GITHUB_STEP_SUMMARY`, with an `::error::` annotation on refusals and failures. The summary names deployments by id and never prints a URL with the project name | |
| Workflow checks | A pytest reads `deploy.yml` with PyYAML (a new dev-only dependency of `deploy/`) | Text matching: breaks on harmless formatting. `actionlint`: another tool to install and pin |

**Rollbacks, in practice.** A rollback in the dashboard works as today: production shows that deployment's code and data. Then:

- Rolled back to an older publish's data: merge deploys stop until the next publish (or a roll forward).
- Rolled back to a deployment with the same data (bad code from a merge): pushes pause. Merge the fix, then run the workflow by hand on `main`; or publish from the Mac.
- A publish always ends the pause, and its data is the newest.

**Setup** (the owner, once; the implementation changes nothing on Cloudflare or GitHub):

1. After this spec is merged, `publish` once from the Mac, so the live deployment has a manifest. `status` then shows `Merge deploys: can deploy on this data`.
2. Cloudflare: My Profile › API Tokens › Create Token › Custom token. Account › Cloudflare Pages › Edit; Account Resources: the Combo Skin account only; TTL 12 months. Copy it once.
3. GitHub, the repository's Settings › Environments › New environment `production`. Deployment branches: selected branches, `main`. No required reviewers. Environment secrets: `CLOUDFLARE_API_TOKEN` (the token) and `CLOUDFLARE_ACCOUNT_ID`.
4. Settings › Secrets and variables › Actions: repository secret `PAGES_PROJECT` (the project name).
5. Run the workflow by hand on a branch (R8) to see `build-site` pass.
6. Repository variable `MERGE_DEPLOY` = `on`.
7. The test run (criteria 22 to 26). A calendar reminder before the token expires.

**Spec 022 (link previews).** The downloaded data folder is everything 022's prerender needs: the counts for the sitemap and type pages, each finish's combos for page text, titles and the best combo's screenshot for `og:image`, and the catalog from the built commit. Its implementation must keep these true:

- The prerender is a step of the shared assembly that `publish` and `deploy-code build` both call, and it reads only the built commit, the data folder and the three origins (from the manifest in CI). Never the local API, the local bucket or the database.
- A preview JPEG's key depends on the data alone (combo id and screenshot version, as 022's R2 has it), and only `publish` makes and uploads JPEGs. A merge deploy references the JPEGs of the publish that exported its data, so they exist. The first merge that brings 022's pages references JPEGs nobody uploaded yet; R2 step 6 refuses it with "needs a publish from the Mac", and 022 goes live with a publish. The same holds for any later change to the JPEG's size or key.
- `404.html` makes a missing data file a 404 instead of the app's HTML; the download checks the type and hash either way.
- 022's file counts stay within Pages' limits (spec 021) for merge deploys too, since the file set is the same.

**Risks accepted**

- Each merge deploy makes two deployments (preview and production). With many merges in a day, the 100 most recent deployments reach back fewer days, so a rollback past 30 days may find fewer choices.
- More frequent deploys mean more visitors holding an old deployment's page when its lazy chunks are gone; spec 021's R26 reloads once.
- The window between `publish`'s last check and its production deploy is seconds. A merge deploy landing in it is overwritten by the publish, which carries the newest data and code no older than one merge; the next merge, or `status`, shows it.
- Cloudflare may challenge requests from GitHub's runners; the smoke test fails safely before production if so.

## API / data model

No API or website changes.

**`/data/manifest.json`** (in every deploy, `application/json`):

```json
{
  "format": 1,
  "data_version": "<sha256 of the export>",
  "exported_at": "2026-12-01T21:14:05+01:00",
  "exported_with": "<full commit id>",
  "origins": {
    "site": "https://combo.skin",
    "images": "https://img.combo.skin",
    "viewer": "https://view.combo.skin"
  },
  "files": {
    "data/combo-counts.json": "<sha256>",
    "data/gloves/<type>/<finish>.json": "<sha256>"
  }
}
```

The origins are checked with the publish settings' own rules (https origins and base URL). `files` lists every file under `data/` but the manifest.

**`plan.json`** (in the artifact, not deployed): `{"commit", "manifest" (as downloaded), "warnings": [...]}`.

**Workflow inputs** (none are committed): environment `production` secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; repository secret `PAGES_PROJECT`; repository variable `MERGE_DEPLOY`.

## Security

- S1. Only `deploy-site`, in the `production` environment limited to `main`, can read the Cloudflare token and account id. The token is in the environment of the `deploy-code release` step only, and reaches wrangler only through its own process environment, as on the Mac (spec 021, R28).
- S2. The token is limited to Cloudflare Pages Edit on the owner's one account. CI holds no R2 credential and no credential for the back office.
- S3. No job that runs the website's npm packages has a Cloudflare credential; `deploy-code build` refuses to run with one in its environment.
- S4. The new jobs never run on `pull_request` or `pull_request_target`, and only in `shb327/combo-skin`. The workflow has `permissions: contents: read`, checks out with `persist-credentials: false`, and pins every action by full commit hash.
- S5. Nothing CI deploys can add, change or remove a combo: the data is the live data byte for byte (R6), checked against the public schema before deploying.
- S6. Run logs, summaries and artifacts of this public repository hold no token, account id or project name: secrets are masked, `deploy-code` scrubs the values it read, and summaries name deployments by id.
- S7. The account id, project name and token are never committed; they live only in GitHub's secrets and the Mac's gitignored settings and Keychain.
- S8. The switch (R10) defaults to off.

## Acceptance criteria

**`deploy-code` and `publish`** (`deploy/tests`, pytest, with a fake site host, fake Pages API, fake image host and the fake wrangler of spec 021)

1. `build` downloads exactly the manifest's files; a hash mismatch starts over once and then exits 1 with the message of R2; a file served as `text/html` with 200 fails; a deployment without a manifest makes `release` exit 1 with "Needs a publish from the Mac".
2. A built commit whose `PublicCombo` or `ComboCounts` (or a schema they reference) differs from the export commit's exits 1 naming the schemas, before `npm` runs; a difference in titles or descriptions only does not stop it.
3. A finish added to the catalog gets `[]` and a manifest entry; a removed empty finish is dropped; a removed finish with combos exits 1 with R2's message; every other data file is byte-equal to the downloaded one; the manifest keeps its data version, export time, export commit and origins.
4. The website build gets the manifest's image and viewer origins; `_headers` equals what `publish` generates for the same origins (golden file); an origin in the manifest that is not an https origin exits 1; `site.check`'s failures stop `build` as they stop `publish`.
5. A missing link-preview image exits 1 with R2's message; a missing catalog copy is a warning in the summary and `plan.json`, and the build succeeds; `build` makes no request with credentials, and the package has no bucket client in `deploy-code`'s code path (an injected bucket factory that fails if called, and a grep).
6. `build` with `CLOUDFLARE_API_TOKEN` set exits 1 before anything runs.
7. `release` stops, with nothing deployed, for each case of R3 step 3: no manifest, different data versions of L and N, a code rollback on a push run (a run by hand deploys), a folder whose data version isn't L's, a built commit already live or behind L (exit 0), and an unknown live commit.
8. Order: preview deploy, smoke test (counts, a finish file, the manifest, headers), re-read of L and N, production deploy, check after; a failure at each step before production never calls the production deploy.
9. L or N changing between the smoke test and production stops before production.
10. A production deployment created between N and the run's own: production is rolled back to it, the run's own deployment is deleted, exit 1 with R3's message. One created after the run's own: exit 0 with the note.
11. The commit messages are those of R5, and `status` and `release` read `merge deploy` from them.
12. With fake secrets, none of the token, the account id or the project name appears in stdout, stderr, the summary, `plan.json` or the folder; wrangler's environment holds only what spec 021's criterion 12 allows.
13. The summary's first line for each outcome of R11 (golden tests), with exit codes as R11 says.
14. `publish` writes the manifest of R1 (golden shape) and its smoke test checks it; the changed-files count ignores the manifest; a live deployment that changes before production stops `publish` with R16's message, its state unchanged.
15. `status` prints R14's lines for: a live publish; a live merge deploy on the last publish's data (no rollback reported); a rollback to an older publish; a code rollback; a pending schema difference on `origin/main` (golden tests).

**Workflow** (pytest reading `.github/workflows/deploy.yml` and `website.yml`)

16. The `check` job is unchanged; the new jobs are those of R7, each with the conditions of R8 and the repository check; only `deploy-site` names the `production` environment and the token, and only in its release step's `env`; `build-site` has no environment and no Cloudflare secret.
17. No `pull_request_target` anywhere; top-level `permissions: contents: read` and no job widens it; every `uses:` of another repository is pinned to a 40-character commit hash; every checkout has `persist-credentials: false`.
18. `deploy-site` has its own concurrency group with `cancel-in-progress: false`, the workflow does not cancel runs on `main`, and `website.yml` has `workflow_call` with a concurrency group that includes `github.workflow`.
19. `gate` lets a deploy through only when `vars.MERGE_DEPLOY` is `on`, and writes the off message otherwise.

**Docs and checks**

20. `deploy/README.md` (Merge deploys, the setup checklist, the updated Rollback runbook), `docs/static-publishing.md` and the root README match R18; the comment in `deploy.yml` matches R13.
21. `gitleaks git --no-banner --redact` on the branch finds nothing; no account id, project name or token is committed.

**Test run** (manual, after the setup)

22. After one `publish`, `status` shows `Live: … publish` and `Merge deploys: can deploy on this data`. With `MERGE_DEPLOY` unset, a merge's run summary says merge deploys are off and the Pages deployment list is unchanged.
23. With `MERGE_DEPLOY` = `on`, a trivial merge (a wording change on a page) goes live on `https://<project>.pages.dev` by itself: the run summary starts with `Live:`, the page shows the change, `status` shows `merge deploy` with the data version of the publish, and `sha256sum` of the counts and three finish files fetched before and after match.
24. A run started by hand on a throwaway branch that adds a field to `PublicCombo` (and regenerates `api/openapi.json`) fails in `build-site` with "Needs a publish from the Mac" naming `PublicCombo`; `deploy-site` doesn't run; the deployment list is unchanged. The branch is deleted afterwards.
25. A dashboard rollback from the merge deploy to the publish before it works: the old code shows, with the same data. `status` reports the rollback. The next merge's run says `Paused:`; a run by hand on `main` then deploys it.
26. A `publish` after merge deploys succeeds, and `status` shows it live, with no rollback.

## Test plan

| Criterion | How it is checked |
| --- | --- |
| 1 to 15 | pytest in `deploy/tests` with fakes (site host, Pages API, image host, wrangler, `git` in a temporary repository) |
| 16 to 19 | pytest parsing the workflow files |
| 20 | Reading the docs against R13 and R18 |
| 21 | `gitleaks` and a review of the diff |
| 22 to 26 | Manual test run after the setup; the run pages and `status` output as evidence |

Commands:

```bash
cd deploy && uv sync --locked && uv run ruff check && uv run ruff format --check && uv run mypy && uv run pytest
cd website && npm ci && npm run api:types:check && npm run lint && npm test && npm run build
gitleaks git --no-banner --redact
```

## Open questions

None. On 26 November the owner approved every recommendation of the draft: a code rollback pauses merge deploys started by a push, and a run by hand on `main` deploys anyway; the project name is a repository secret; a missing catalog copy is a warning and the deploy goes on; and warnings on pull requests are left to a later spec. The answers are recorded in Design and the non-goals as the owner's choice.

## Implementation notes

Filled in during implementation: deviations from the design and why, follow-ups discovered, and which test covers each acceptance criterion.

## Audit

Filled in by the audit: one line per acceptance criterion (pass or fail, with evidence), the results of lint, tests, build and the secret scan, and a verdict of Pass, Pass with follow-ups, or Fail.
