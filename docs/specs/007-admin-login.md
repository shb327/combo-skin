# 007: Admin login

**Status:** Approved
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** api
**Branch:** 007-admin-login

## Summary

Add admin accounts and login to the API: an admins table, a command line tool to create and manage accounts, log in, log out and "who am I" endpoints, and one reusable dependency that refuses any request without a logged-in admin. The combos API and the admin dashboard come next, and every write they add must require an admin. The repository is public, so the login is designed to hold up against someone who has read all of its code.

## Goals and non-goals

**Goals**

- Admin accounts in PostgreSQL, created and managed only from a command line tool run by the owner.
- Username and password login with Argon2 password hashing, server-side sessions in a secure cookie, CSRF protection, CORS for the admin dashboard, and rate limiting on login.
- `POST /admin/login`, `POST /admin/logout` and `GET /admin/me`.
- A `require_admin` dependency that later specs put on every admin route, and a test that fails if a write route is added without it.
- Settings, `api/.env.example`, the OpenAPI snapshot and `api/README.md` updated, including how to create the first admin.

**Non-goals**

- The admin dashboard (`admin/`), combos, and any other write endpoint.
- Steam login and site users.
- Sign-up, password reset by email, or changing a password over HTTP.
- Two-factor login (see Design).
- Several admin roles (see Design).
- Deployment, the reverse proxy, and TLS. The `deploy/` spec sets the production values of the new settings.
- An audit table. Logins and account changes are recorded in logs only.

## Context

- `api/src/combo_api/settings.py`: pydantic-settings `Settings` with the `POSTGRES_*` settings, `LOG_LEVEL` and `DOCS_ENABLED`. The database password is a `SecretStr`. `load_settings` reports invalid settings by variable name only.
- `api/src/combo_api/main.py`: `create_app` builds the app with the health and catalog routers and the docs routes. There is no middleware, no CORS, and no custom exception handler, so validation errors use FastAPI's default 422 body, which echoes each invalid input value.
- Every route today is a `GET`. There is no authentication of any kind and no `admin/` directory.
- `api/src/combo_api/db.py`: `Base` (with the naming convention) and `get_session`, one `AsyncSession` per request.
- `api/migrations/versions/`: `0001_baseline` and `0002_catalog`. `api/migrations/env.py` imports `combo_api.catalog.models` to register its tables.
- `api/src/combo_api/catalog/__main__.py`: the pattern for commands, `python -m combo_api.catalog <subcommand>` with argparse; a `CatalogError` prints its message and exits 1.
- `api/tests/conftest.py`: a `<POSTGRES_DB>_test` database migrated to head, `db_session` (rolled back after each test) and `client` (the app using that session). `api/tests/test_migrations.py` asserts the exact revision chain and the exact set of tables at head. `api/tests/test_settings.py::test_env_example_lists_every_setting` asserts `api/.env.example` lists exactly the settings the app reads. `api/tests/test_openapi.py` checks operation IDs and the snapshot.
- `api/Dockerfile` starts `uvicorn combo_api.main:app` with no proxy options. Uvicorn by default rewrites the client address from forwarded headers sent by a loopback peer.
- `compose.yaml`: `db`, `migrate`, `catalog` and `api`, all reading `api/.env`; the API is published on the host's loopback interface, port 8000.
- `.github/workflows/api.yml`: lint, type check, OpenAPI and export checks, pytest against PostgreSQL 18, image build and a Compose smoke test.
- `api/pyproject.toml` has no password hashing dependency.
- Deployment plan, not part of this spec: the website, API and admin dashboard will probably be served from subdomains of one domain (such as `api.` and `admin.`). Locally, they run on `localhost` ports. Both setups make the admin dashboard and the API the same site but different origins.

## Requirements

**Accounts and the command line tool**

- R1. Admin accounts are stored in PostgreSQL, in tables created by migration `0003`, which upgrades and downgrades cleanly. Accounts are never deleted; they are disabled.
- R2. A username is 3 to 32 characters of lowercase ASCII letters, digits, `.`, `-` and `_`, and is unique. Login matches usernames case-insensitively.
- R3. `uv run python -m combo_api.admins` has the subcommands `create <username>`, `set-password <username>`, `disable <username>`, `enable <username>` and `list`.
- R4. `create` and `set-password` read the password from a hidden prompt, twice, and refuse if the two entries differ. The tool never accepts a password as an argument, an option or an environment variable, refuses to run those subcommands without an interactive terminal, and never prints a password or a hash.
- R5. A password must follow the password rules (Design): length, a common-password check, and not containing the username. The tool explains which rule a refused password breaks and asks again.
- R6. `disable` ends every session of that admin at once, and a disabled admin cannot log in. `enable` lets the admin log in again; it does not bring back old sessions.
- R7. `set-password` ends every session of that admin at once.
- R8. `list` prints each admin's username, whether it is enabled, when it was created, its last login and its number of live sessions, and nothing else.
- R9. No HTTP route creates, changes, enables, disables or lists admins.

**Login and sessions**

- R10. `POST /admin/login` with a valid username and password of an enabled admin starts a new session, sets the session cookie, and returns the admin, a CSRF token and the session's absolute expiry.
- R11. An unknown username, a wrong password and a disabled admin all get the same 401 response.
- R12. `GET /admin/me` returns the same body as login for the current session, or 401.
- R13. `POST /admin/logout` ends the current session and clears the cookie. It returns 204 also when there is no live session.
- R14. A session ends after `SESSION_IDLE_MINUTES` without a request, and after `SESSION_MAX_HOURS` from login whatever the activity. Each login creates a new session with a new token; a session cookie presented at login is never reused.
- R15. The API stores sessions in PostgreSQL. A session stops working at once when it is logged out, expires, or its admin is disabled or gets a new password.

**Protecting routes**

- R16. `require_admin` is a FastAPI dependency that returns the current admin (id and username) or refuses the request: 401 without a live session; for `POST`, `PUT`, `PATCH` and `DELETE` also 403 when the `Origin` header is missing or not allowed, or when the CSRF token is missing or wrong.
- R17. A test fails if any route with a `POST`, `PUT`, `PATCH` or `DELETE` method, other than login and logout, does not depend on `require_admin`.
- R18. Only the origins in `ADMIN_ORIGINS` may make credentialed cross-origin requests to the API. No origin is allowed by default.

**Rate limiting**

- R19. Failed logins are counted per client IP and per submitted username, whether or not that username exists. Over a limit (Design), login returns 429 with a `Retry-After` header and does not check the password.
- R20. The client IP is the address of the connecting peer. Forwarded headers are used only when that peer is listed in `TRUSTED_PROXIES`.

**Settings, logs and docs**

- R21. New settings in `api/src/combo_api/settings.py`, with defaults, are listed in `api/.env.example` with placeholder values, and are validated at startup.
- R22. Successful logins, failed logins, rate-limited logins, logouts and every command line change are logged as described in API / data model.
- R23. The committed OpenAPI snapshot includes the three endpoints and their responses.
- R24. `api/README.md` explains creating the first admin (on the host and in Compose), the other commands, the endpoints, how a client logs in and sends the CSRF token, and the new settings.

## Design

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Sessions | An opaque random token in an HttpOnly cookie; sessions stored in PostgreSQL, looked up on every request | Signed tokens such as JWT: cannot be revoked before they expire without a server-side list, so logout, disabling an admin and a password change would not take effect at once; the server-side list makes them sessions anyway. Signed cookie sessions holding state: same problem. |
| Session lifetimes | Idle 60 minutes, absolute 12 hours, from `SESSION_IDLE_MINUTES` and `SESSION_MAX_HOURS`. `last_seen_at` is written at most once a minute per session | Longer idle time (8 hours): a forgotten logged-in browser stays usable for a working day. No absolute limit: a stolen session lives as long as it is used. NIST SP 800-63B's middle assurance level asks for reauthentication at least once a day and after an hour of inactivity. |
| New session at login | Always a new token; any cookie sent with the login request is ignored | Reusing an existing session: allows session fixation. |
| Cookie | One session cookie: HttpOnly, Secure, `SameSite=Strict`, `Path=/`, no `Domain` (host-only), `__Host-` name prefix when Secure. No `Max-Age`, so it ends with the browser session; the server enforces both lifetimes | `Domain` set to the parent domain: every subdomain would receive the session. `SameSite=Lax`: allows cross-site top-level navigations to carry it, which nothing here needs. A persistent cookie: no use, since sessions end within 12 hours. |
| Plain http for local use | `SESSION_COOKIE_SECURE`, default `true`. `api/.env.example` sets `false` for `http://localhost`; the API logs a warning at startup while it is `false` | Detecting local use from the request: a proxy misconfiguration could switch Secure off in production. Defaulting to `false`: a forgotten production setting would weaken the cookie silently. |
| CSRF | Three layers: `SameSite=Strict`; an `Origin` check on every `POST`, `PUT`, `PATCH` and `DELETE` (exact match against `ADMIN_ORIGINS`, a missing or `null` Origin refused); and a synchronizer token: a random per-session CSRF token, returned in the login and `/admin/me` bodies, sent back by the client in the `X-CSRF-Token` header and compared in constant time | SameSite alone: subdomains of one domain, and `localhost` ports, are the same site, so another subdomain (the public website, or anything later hosted there) could still send requests that carry the cookie. Double-submit cookie: the admin dashboard on another subdomain could only read it if the cookie were scoped to the parent domain, which exposes it to every subdomain. Origin check alone: strong in current browsers, but one layer for the only thing guarding writes. |
| Login CSRF | Login has no session yet, so it is protected by the Origin check, `SameSite`, and refusing any content type other than `application/json` (415) | A pre-login CSRF token: an extra round trip that the Origin check already covers. |
| CORS | `ADMIN_ORIGINS`: a comma-separated list of exact origins (`scheme://host[:port]`), default empty. Credentials allowed only for them; methods `GET`, `POST`, `PUT`, `PATCH`, `DELETE`; request headers `Content-Type` and `X-CSRF-Token`; `Retry-After` exposed. Startup refuses `*`, a path, a trailing slash, or a value without a scheme. `api/.env.example` lists the admin dashboard's planned local origin, `http://localhost:5174` | A wildcard or a pattern such as any subdomain: one compromised subdomain would get full admin access. Origins hard-coded: differ between local, CI and production. The website's origin: it makes no admin requests. |
| Rate limit storage | PostgreSQL: a `login_failures` table, one row per failed attempt; rows older than 24 hours are deleted during later logins. A row is written before the password is checked and removed if the login succeeds, so parallel attempts count each other | In memory: lost on restart and wrong as soon as there is more than one API process. Reverse proxy only: not built yet, cannot see which username was tried, and is outside this repository's tests. It can be added later in front of this. Redis: a new service for a handful of admins. |
| Rate limit keys and limits | Failures in the last 15 minutes: at most 10 per client IP, and at most 20 per submitted username (stored only as a one-way digest). Over either limit: 429 `too_many_attempts` with `Retry-After` until the oldest counted failure leaves the window; the password is not checked. Successful logins are not counted. Limits are constants in code, not settings | IP only: a guesser with many addresses is not slowed. Username only: one address could lock out every admin. Growing delays: tie up a connection and a password hash per attempt. A lock until the owner unlocks it: easy denial of service. Accepted trade-off: someone who knows a username and has several addresses can keep that admin out of login for as long as they keep trying; the logs show it. |
| Client IP | The connecting peer's address. `TRUSTED_PROXIES` (comma-separated IPs or CIDR ranges, default empty) lists reverse proxies whose `X-Forwarded-For` header is used: the client IP is the right-most address in it that is not a trusted proxy. Uvicorn's own forwarded-header handling is turned off (`--no-proxy-headers` in the Dockerfile and the README commands) so only this setting decides | Always trusting `X-Forwarded-For`: anyone can send it and pick their own rate-limit key. The left-most address: chosen by the client. Uvicorn's `FORWARDED_ALLOW_IPS`: read by Uvicorn outside the app's settings, so it is not validated, documented or tested with the rest. |
| Password hashing | Argon2id through `argon2-cffi`, using its RFC 9106 low-memory profile. A hash made with weaker parameters is replaced at the next successful login. Hashing runs in a worker thread, at most 2 at a time, so logins cannot exhaust memory or block the event loop | `pwdlib`: a thin wrapper over the same library. `passlib`: unmaintained. bcrypt: truncates long passwords and is weaker against GPU attacks. The RFC 9106 first (2 GiB) profile: too much memory for a small server. |
| Same response and timing | An unknown username is checked against a fixed dummy hash with the same parameters, and a disabled admin's password is still checked, so each of the three cases runs exactly one Argon2 verification and returns the same 401 | Returning early for unknown usernames: the time difference tells which usernames exist. A distinct error for disabled admins: confirms that the password was right. |
| Password rules | Following NIST SP 800-63B: 15 to 256 characters, counted after Unicode NFKC normalisation (the normalised form is what is hashed); any characters, spaces included; not on a bundled list of common passwords (compared case-insensitively); not containing the username. No composition rules and no expiry | 8 characters: NIST's minimum only when the password is one of two factors; here it is the only one. Composition rules and forced expiry: NIST advises against both. An online breached-password service: needs network access from the tool and sends part of a hash to a third party; possible later as an extra check. |
| Common-password list | A published list of common passwords whose licence allows redistribution, committed in the package, reduced to entries that meet the length rule, and credited in `THIRD_PARTY_NOTICES.md`. The source is chosen in implementation and recorded in Implementation notes | No list: NIST requires one. A large list kept outside the repo: tests and the image would depend on a download. |
| Roles | One admin role. `require_admin` returns the admin, so a later spec can add a role column and a narrower dependency | Owner and helper roles now: nothing in this spec or the next ones differs between them, since accounts are managed from the command line, which only the owner runs. |
| Two-factor login | A later spec, to be done before the admin login is reachable from the internet | In this spec: TOTP needs enrolment, recovery codes and a second login step in the dashboard that does not exist yet. |
| Routes | `POST /admin/login`, `POST /admin/logout`, `GET /admin/me`, tag `admin`, operation IDs `admin_login`, `admin_logout`, `admin_me` | `/auth/...`: Steam login for site users will come later and must not share paths or cookies with admins. `DELETE /admin/session`: less obvious for a client to call. |
| Error shape | `{"detail": "<code>"}` with a stable snake_case code, the same `detail` key as FastAPI's 404 bodies | A new `{"error": {...}}` envelope: two error shapes in one API. Human-readable messages: the dashboard maps codes to its own text. |
| Validation errors | App-wide, 422 bodies keep FastAPI's `detail` list with `loc`, `msg` and `type` only; the `input` and `ctx` fields are removed | FastAPI's default: echoes the submitted value, which on login can be a password. Only on the login route: later write routes would have to remember it. |
| Caching | Responses of the three routes and of every route using `require_admin` carry `Cache-Control: no-store` | Default headers: a shared cache could keep a response holding a CSRF token. |
| Command line tool | `python -m combo_api.admins`, built like the catalog command; `getpass` for the prompts; stops with an error when standard input is not a terminal. In Compose: `docker compose exec api python -m combo_api.admins ...` | A setup token or a first-run HTTP form: an HTTP route that creates admins, on a public codebase. A password argument or environment variable: ends up in shell history, process lists or logs. Reading from a pipe: invites scripts that store the password. |
| Disable vs delete | Only disable; there is no delete command | Deleting: later tables (combos) will refer to the admin who made a change. |
| Password change over the CLI | Ends all of the admin's sessions, since the tool has no current session | Keeping sessions: R7. A later self-service password change over HTTP must keep the session that made the change and end the others. |
| Logging | Logger `combo_api.admins`, plain text with key=value fields. The submitted username is logged only when it belongs to an existing admin, because people sometimes type their password into the username field | Logging every submitted username: can put passwords in logs. No reason on failures: the owner could not tell guessing from a disabled helper. |
| Layout | `api/src/combo_api/admins/`: `__main__.py` (tool), `models.py`, `passwords.py` (hashing, rules, list), `sessions.py`, `limits.py` (rate limit, client IP), `deps.py` (`require_admin`), `routes.py`, and the common-password file. Tests in `api/tests/admins/` | Putting this in `main.py` or `db.py`: they stay small, as for the catalog. |
| Compose and CI | No new Compose service. The Compose smoke test in `.github/workflows/api.yml` also checks that `GET /admin/me` returns 401 | A service that creates an admin: would need a password in a file. |

## API / data model

**Settings** (environment variables, all listed in `api/.env.example`):

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `ADMIN_ORIGINS` | no | empty | Comma-separated exact origins allowed to send credentialed requests and writes. The example lists the admin dashboard's local origin. |
| `SESSION_COOKIE_SECURE` | no | `true` | When `false`, the session cookie is sent over plain http. Local use only; the example sets `false`. |
| `SESSION_IDLE_MINUTES` | no | `60` | Idle lifetime of a session, 5 to 1440, and not more than the absolute lifetime. |
| `SESSION_MAX_HOURS` | no | `12` | Absolute lifetime of a session, 1 to 24. |
| `TRUSTED_PROXIES` | no | empty | Comma-separated IPs or CIDR ranges of reverse proxies whose forwarded headers are used. |

**Endpoints** (tag `admin`):

`POST /admin/login`, operation `admin_login`. Request, `Content-Type: application/json`, from an allowed origin:

```json
{"username": "<username>", "password": "<password>"}
```

`username` is 1 to 64 characters and `password` 1 to 1024 characters; longer values get 422 without a password check.

→ `200`, with the session cookie set:

```json
{"admin": {"username": "<username>"}, "csrf_token": "<token>", "expires_at": "2026-11-02T22:00:00Z"}
```

`GET /admin/me`, operation `admin_me` → `200` with the same body for the current session (same CSRF token, same `expires_at`), or `401`.

`POST /admin/logout`, operation `admin_logout`, from an allowed origin, with `X-CSRF-Token` when a session is live → `204`, the session ended and the cookie cleared. With no live session → `204`, cookie cleared.

**Errors** (body `{"detail": "<code>"}`):

| Status | Code | When |
| --- | --- | --- |
| 401 | `invalid_credentials` | Login: unknown username, wrong password, or disabled admin |
| 401 | `not_authenticated` | `/admin/me` or a `require_admin` route without a live session |
| 403 | `origin_not_allowed` | A write, login or logout whose `Origin` is missing, `null` or not in `ADMIN_ORIGINS` |
| 403 | `csrf_failed` | A write through `require_admin`, or logout with a live session, without the session's CSRF token |
| 415 | `unsupported_media_type` | Login with a content type other than `application/json` |
| 422 | FastAPI's list, without `input` or `ctx` | Invalid body |
| 429 | `too_many_attempts` | Login over a rate limit; `Retry-After` gives the seconds to wait |

`require_admin` checks in this order: session (401), then for writes Origin and CSRF token (403). The OpenAPI schema documents 401 and 403 on routes that use it.

**Tables** (migration `0003_admins`):

`admins`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer identity | Primary key |
| `username` | text | Unique; check constraint for the username rule |
| `password_hash` | text | Argon2id encoded hash |
| `active` | boolean | Default true; false when disabled |
| `password_changed_at` | timestamptz | |
| `last_login_at` | timestamptz, nullable | |
| `created_at`, `updated_at` | timestamptz | |

`admin_sessions`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint identity | Primary key |
| `admin_id` | integer | Foreign key to `admins.id`, `ON DELETE CASCADE`, indexed |
| `token_digest` | bytea | Unique. A one-way digest of the session token; the token itself is not stored |
| `csrf_token` | text | |
| `created_at`, `last_seen_at`, `expires_at` | timestamptz | `expires_at` is the absolute expiry |

`login_failures`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint identity | Primary key |
| `username_digest` | bytea | One-way digest of the normalised submitted username; indexed with `created_at` |
| `client_ip` | inet | Indexed with `created_at` |
| `created_at` | timestamptz | |

**Command line tool** (from `api/`, or `docker compose exec api python -m combo_api.admins ...`):

| Command | Effect |
| --- | --- |
| `uv run python -m combo_api.admins create <username>` | Prompts for a password twice, creates an enabled admin |
| `uv run python -m combo_api.admins set-password <username>` | Prompts twice, sets the password, ends all of the admin's sessions |
| `uv run python -m combo_api.admins disable <username>` | Disables the admin and ends all of its sessions |
| `uv run python -m combo_api.admins enable <username>` | Enables the admin |
| `uv run python -m combo_api.admins list` | Prints username, enabled, created, last login, live sessions |

An unknown username, a duplicate on `create`, or a missing terminal prints an error and exits 1.

**Log events** (logger `combo_api.admins`):

| Event | Level | Fields |
| --- | --- | --- |
| `admin login succeeded` | info | `username`, `ip` |
| `admin login failed` | warning | `reason` (`unknown_username`, `wrong_password`, `disabled`), `ip`, `username` only if it exists |
| `admin login rate limited` | warning | `limit` (`ip` or `username`), `ip`, `username` only if it exists |
| `admin logout` | info | `username`, `ip` |
| `admin created`, `admin password changed`, `admin disabled`, `admin enabled` | info | `username`, `sessions_ended` where it applies |
| Startup with `SESSION_COOKIE_SECURE=false` | warning | none |

## Security

- S1. Every write route requires an authenticated, enabled admin through `require_admin`, and a test enforces it for every route added later (R17).
- S2. Passwords are hashed with Argon2id, with parameters no weaker than the RFC 9106 low-memory profile. Plain passwords are never stored or written anywhere.
- S3. Login gives the same status, body and headers for an unknown username, a wrong password and a disabled admin, runs exactly one password verification for each, and takes a similar time for each.
- S4. No password, password hash, session token or CSRF token appears in logs, error messages, validation errors, command output, `repr` output or API responses. The only exceptions are the session token in the login response's `Set-Cookie` header and the CSRF token in the login and `/admin/me` bodies.
- S5. The session cookie is HttpOnly, Secure (unless `SESSION_COOKIE_SECURE=false`), `SameSite=Strict`, host-only and `Path=/`.
- S6. Session and CSRF tokens come from the operating system's secure random generator with at least 256 bits each. The database never holds a session token that could be used as is.
- S7. A session stops working on the next request after logout, expiry, the admin being disabled, or a password change.
- S8. Every login creates a new session token.
- S9. Writes through `require_admin` need an allowed `Origin` and the session's CSRF token; login and logout need an allowed `Origin`.
- S10. Only the origins in `ADMIN_ORIGINS` get CORS headers, never with a wildcard.
- S11. Login rate limits apply per client IP and per submitted username, apply equally to unknown usernames, and hold under concurrent requests. A refused attempt does not check the password.
- S12. Forwarded headers are trusted only from peers in `TRUSTED_PROXIES`.
- S13. At most 2 password hashes are computed at once, outside the event loop.
- S14. Accounts can be created and changed only from the command line tool; it reads passwords only from a hidden terminal prompt.
- S15. Responses of the auth routes and of routes using `require_admin` are not cacheable.
- S16. `api/.env.example` holds placeholder values only. No secrets, accounts or real hostnames are added to the repository, the workflow or `compose.yaml`.

## Acceptance criteria

Test ids and commands are relative to `api/`. "Allowed origin" means an origin listed in the test settings' `ADMIN_ORIGINS`.

**Storage**

1. `uv run alembic upgrade head`, `downgrade base` and `upgrade head` succeed; `uv run alembic check` reports no new operations; the migration tests expect revisions `0001`, `0002`, `0003` and the tables `admins`, `admin_sessions` and `login_failures` added to the known set.
2. Tests insert usernames that break the rule (`AB`, `a`, a 33-character name, `a b`, `ä`) directly into `admins` and get a constraint error; a second admin with the same username fails.

**Command line tool**

3. Tool tests, with the prompt replaced by a test double: `create` stores an enabled admin whose stored hash verifies the password and is not the password; mismatched entries, a 14-character password, a password on the common list (in any letter case), and a password containing the username are each refused with a message naming the rule, and nothing is stored.
4. A test runs `create` and `set-password` with standard input not a terminal: both exit 1 with an error and store nothing. `uv run python -m combo_api.admins create --help` shows no password option.
5. Tests check that `create`, `set-password`, `disable`, `enable` and `list` print neither the password nor the hash, and that `create` with an existing username, and each other subcommand with an unknown one, exits 1.
6. A test logs in twice as one admin, runs `disable`: both sessions get 401 on `/admin/me`, login with the right password returns 401 `invalid_credentials`, and the tool reports 2 sessions ended. After `enable`, login succeeds and the old sessions still get 401.
7. A test logs in twice as one admin and runs `set-password`: both sessions get 401, the old password is refused, and the new one works.
8. A test checks that `list` prints the username, enabled state, created time, last login and live session count for each admin.

**Login, me, logout**

9. Tests: login with valid credentials from an allowed origin returns 200 with the body in API / data model, sets exactly one cookie, and `/admin/me` with that cookie returns the same `admin`, `csrf_token` and `expires_at`. `last_login_at` is set.
10. A test checks that an unknown username, a wrong password and a disabled admin's correct password each get 401 with identical bodies and identical header names and values, and that each runs exactly one Argon2 verification (counted with a spy on the hasher).
11. A timing test with the real hasher and the rate limit cleared between attempts: the median response time of 5 logins for an unknown username, 5 with a wrong password and 5 for a disabled admin are each within a factor of 1.5 of the others.
12. A test checks that logging in with a username in another letter case works, and that two logins create two sessions with different tokens; a login sent with a still-valid session cookie returns a new token and the presented one is not reused as the new session.
13. Tests: login from an origin not in `ADMIN_ORIGINS`, with `Origin: null`, or with no `Origin` returns 403 `origin_not_allowed`; login with `Content-Type: text/plain` or no content type returns 415; neither case creates a session.
14. A test sends a login with a 2000-character password and one with a missing field: both get 422, and the response body contains neither the submitted password nor an `input` field.
15. Tests: logout with the session's CSRF token from an allowed origin returns 204, clears the cookie, and the session then gets 401; logout with a live session and a wrong CSRF token returns 403 `csrf_failed` and the session still works; logout without a session returns 204.
16. A test checks that a weaker stored hash (made with lower Argon2 parameters) is replaced by one with the current parameters after a successful login.

**Sessions and `require_admin`**

17. Tests mount a test-only router with a `GET` and a `POST` route that depend on `require_admin`. `GET` without a cookie, with an unknown token, or with a cookie of a logged-out session returns 401 `not_authenticated`; with a live session it returns 200 and the dependency's value has the admin's id and username.
18. With the test-only `POST` route: a live session with an allowed origin and the right `X-CSRF-Token` gets 200; a missing or wrong token gets 403 `csrf_failed`; another session's token gets 403; a missing or disallowed `Origin` gets 403 `origin_not_allowed`; without a session it gets 401 before any 403.
19. With the clock moved forward in tests: a session unused for longer than `SESSION_IDLE_MINUTES` gets 401; a session used every few minutes still gets 401 after `SESSION_MAX_HOURS`; a request within the idle time extends it.
20. A test sets an admin's `active` to false directly in the database: its live session gets 401 on the next request.
21. A test lists every route of `create_app()` with `POST`, `PUT`, `PATCH` or `DELETE` and fails if one other than `admin_login` and `admin_logout` does not depend on `require_admin`; a second test adds an unprotected `POST` route to a copy of the app and checks that the first check fails on it.
22. Tests check that responses of the three routes and of the test-only protected routes have `Cache-Control: no-store`.

**Cookies, CORS and the client IP**

23. A test reads the login `Set-Cookie` header: `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, no `Domain`, no `Max-Age` or `Expires`, and a name starting with `__Host-`. With `SESSION_COOKIE_SECURE=false` it has no `Secure` and no `__Host-` prefix, and startup logs a warning.
24. CORS tests: a preflight from an allowed origin gets `Access-Control-Allow-Origin` equal to that origin and `Access-Control-Allow-Credentials: true`; one from another origin, including another `localhost` port, gets no CORS headers; with `ADMIN_ORIGINS` empty no origin gets them.
25. Settings tests: `ADMIN_ORIGINS` values `*`, `http://localhost:5174/`, `http://localhost:5174/admin` and `localhost:5174` stop startup with an error naming the variable; `TRUSTED_PROXIES` refuses a value that is not an IP or CIDR range; `SESSION_IDLE_MINUTES` longer than `SESSION_MAX_HOURS` is refused.
26. Client IP tests: with `TRUSTED_PROXIES` empty, an `X-Forwarded-For` header does not change the IP used for rate limiting; with the peer listed, the right-most address that is not a trusted proxy is used; addresses added on the left by the client are ignored. `api/Dockerfile` and the README's `uvicorn` commands pass `--no-proxy-headers`.

**Rate limiting**

27. Tests: after 10 failed logins from one IP within 15 minutes, the next login from that IP, even with the right password, returns 429 `too_many_attempts` with a `Retry-After` in seconds, and the hasher is not called; another IP can still log in. After the window passes (clock moved), login works again.
28. Tests: after 20 failed logins for one username from different IPs within 15 minutes, the next login for that username returns 429 from any IP; the same holds for a username that does not exist, with the same response.
29. A concurrency test sends 30 failing logins for one username at once, from one IP, through separate database connections: at most 10 password verifications happen and the rest get 429.
30. A test checks that `login_failures` rows store no submitted username in clear text and that rows older than 24 hours are removed by a later login.

**Secrets in output**

31. A test runs a full flow (create, failed login, successful login, `/admin/me`, a protected write, logout, disable, set-password) with log capture at debug level and checks that the captured logs, the tool's output and every response body contain neither the password, the stored hash, the session token nor the CSRF token, except the session token in the login `Set-Cookie` and the CSRF token in the login and `/admin/me` bodies.
32. A test logs in with an unknown username equal to a password-like string and checks that the string is not in the captured logs, and that each log event in API / data model is written with its listed fields.

**Settings, docs and checks**

33. `tests/test_settings.py::test_env_example_lists_every_setting` passes with the five new settings listed in `api/.env.example`, and `api/.env.example` holds only placeholder values.
34. `api/openapi.json` contains the three routes with their operation IDs, tag `admin`, and the responses in API / data model; `uv run python -m combo_api.openapi --check` exits 0.
35. `api/README.md` has an "Admin accounts" section that explains creating the first admin with `uv run` and with `docker compose exec`, lists the other commands and the endpoints, shows a login and a write with the CSRF header, and documents the new settings; `THIRD_PARTY_NOTICES.md` credits the common-password list.
36. With the Compose stack up from `api/.env.example`, `GET /admin/me` on the local API returns 401, and the `api` workflow's Compose smoke test checks the same.
37. In `api/`: `uv run ruff format --check .`, `uv run ruff check .`, `uv run mypy`, `uv run pytest` (no skipped tests), the OpenAPI check and `export-website --check` exit 0; `docker build -t combo-skin-api api` exits 0 and the image stays under 250 MB.
38. After the branch is pushed, the `api` workflow run for its latest commit succeeds on GitHub.
39. `gitleaks dir . --no-banner --redact` on a clean clone and `gitleaks git` over the branch report no findings.

## Test plan

| Criterion | How it is checked |
| --- | --- |
| 1 | pytest: migration tests; `uv run alembic check`; `uv run alembic history` |
| 2 | pytest: model tests through `db_session` |
| 3, 4, 5, 6, 7, 8 | pytest: tool tests in `tests/admins/`, calling the tool's `main` with a fake prompt and terminal check; criterion 4 also with a real non-terminal standard input |
| 9 to 16 | pytest: route tests through `client` |
| 17 to 22 | pytest: dependency tests with a test-only router, a controllable clock and the route guard test |
| 23 to 26 | pytest: cookie, CORS, settings and client IP tests; read `api/Dockerfile` and `api/README.md` |
| 27 to 30 | pytest: rate limit tests; criterion 29 uses the test engine directly and cleans up its rows |
| 31, 32 | pytest with `caplog` and captured tool output |
| 33, 34 | pytest; the `--check` command |
| 35 | Read `api/README.md` and `THIRD_PARTY_NOTICES.md` |
| 36 | `cp api/.env.example api/.env && docker compose up -d --wait`, `curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/admin/me`, `docker compose down -v`; read the workflow |
| 37 | The commands in criterion 37; `docker image inspect combo-skin-api --format '{{.Size}}'` |
| 38 | The workflow run page for the branch's latest commit (checked after the owner pushes) |
| 39 | `gitleaks dir . --no-banner --redact`; `gitleaks git --log-opts="main..007-admin-login" --no-banner --redact` |

Section commands, run in `api/` with the Compose database up:

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

None. The owner confirmed every proposal in Design as written: sessions and their lifetimes, CSRF (including the CSRF token in the login and `/admin/me` bodies, the one exception in S4), CORS, rate limiting and the client IP (including the lock-out trade-off), the password rules, a common-password list chosen in implementation and recorded in Implementation notes, one admin role, two-factor login in a later spec before the login is exposed to the internet, logging, and Argon2.

## Implementation notes

Filled in during implementation: deviations from the design and why, follow-ups discovered, and which test covers each acceptance criterion.

## Audit

Filled in by the audit: one line per acceptance criterion (pass or fail, with evidence), the results of lint, tests, build and the secret scan, and a verdict of Pass, Pass with follow-ups, or Fail.
