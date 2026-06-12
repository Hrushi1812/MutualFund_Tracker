# Mutual Fund Tracker — Production Readiness Audit

Audit date: 2026-06-12. Repo: `MutualFund_Tracker` (FastAPI + MongoDB backend, React/Vite frontend, deployed to Render via `Procfile` and Vercel via `frontend/vercel.json`).
All paths are relative to the repo root. Line numbers refer to the files as of commit `1ce1e60`.

---

## Section 1 — Architecture & Code Health

**Overall shape:** The backend has a sane layered layout (`routes/` → `services/` → `db.py`, with `models/` and `utils/`), but two legacy modules duplicate live code, the two core services are monoliths with mixed responsibilities, and a circular dependency between them is patched with function-local imports.

### 1.1 Dead module with a broken import: `backend/auth.py`
- **Severity:** Medium
- **File(s):** `backend/auth.py:41`
- **Issue:** Root-level `auth.py` duplicates `services/auth_service.py` (password hashing, JWT creation, `get_current_user`) and contains `from db import get_user` — but `db.py` defines no `get_user`. Importing this module would crash with `ImportError`. Nothing imports it today (verified by grep), so it is dead code. It also reads a *different* env var (`JWT_SECRET_KEY`, line 14) than the live config (`SECRET_KEY` in `core/config.py:12`), and a third name (`JWT_SECRET`) appears in `README.md:126`.
- **Impact:** Confuses onboarding ("which auth module is real?"), and the three different secret env-var names invite a misconfigured deployment where the JWT secret silently falls back to the hardcoded default.
- **Fix:** Delete `backend/auth.py`. Standardize on `SECRET_KEY` everywhere (README included).

### 1.2 Dead module: `backend/nav_logic.py` (464 lines)
- **Severity:** Medium
- **File(s):** `backend/nav_logic.py` (whole file); importers: `backend/tests/debug_holdings.py:8`, `tests/test_new_flow.py:25`, `tests/test_weekend_nav.py:9`, `tests/verify_live_nav.py:8`, `tests/verify_weekend.py:9`
- **Issue:** A pre-refactor copy of the NAV/P&L logic that the application never imports (`app.py` only wires `routes/*`, which use `services/nav_service.py`). Several tests still import and test this dead module instead of the live `NavService`.
- **Impact:** Tests pass/fail against logic that doesn't run in production; future fixes can be applied to the wrong file. `README.md:73` still documents it as "NAV estimation logic".
- **Fix:** Delete `nav_logic.py`, port the affected tests to `services/nav_service.py`, update README.

### 1.3 Service monoliths and mixed responsibilities
- **Severity:** Medium
- **File(s):** `backend/services/holdings_service.py` (1405 lines), `backend/services/nav_service.py` (871 lines)
- **Issue:** `HoldingsService` alone handles: HTTP downloads of NSE/FYERS symbol masters, Excel parsing/header detection, fuzzy scheme matching, SIP installment generation/state machine, Mongo persistence, and step-up math. `NavService.calculate_pnl` (`nav_service.py:525-868`) is a ~340-line function mixing data fetching, a 5-case decision tree, SIP recalculation, and response shaping. `process_and_save_holdings` (`holdings_service.py:781-1177`) is ~400 lines.
- **Impact:** Hard to unit-test (the existing tests resort to `sys.modules['services.fyers_service'] = MagicMock()`, `tests/test_sip_invariants.py:25`), hard to review, easy to regress.
- **Fix:** Extract `market_data` (NSE/FYERS/mfapi clients), `excel_parser`, and `sip_engine` modules; make `calculate_pnl` compose small pure functions (NAV resolution, unit aggregation, metric computation).

### 1.4 Circular dependency patched with local imports
- **Severity:** Low
- **File(s):** `backend/services/nav_service.py:4` (imports `holdings_service` at top) vs `backend/services/holdings_service.py:1206, 1343` (`from services.nav_service import nav_service  # Local import to avoid circular dep`)
- **Issue:** The two services depend on each other; the cycle is broken by importing inside functions.
- **Impact:** Fragile layering; refactors can easily reintroduce an import-time cycle.
- **Fix:** Move the NAV-fetch helpers (`get_next_nav_after_date` etc.) into a dependency-free `utils/mfapi_client.py` both services can import.

### 1.5 Flask-style tuple return in a FastAPI route
- **Severity:** Medium
- **File(s):** `backend/routes/holdings.py:21`
- **Issue:** `return {"error": "Fund not found"}, 404` — FastAPI does not interpret tuples as (body, status); it serializes the tuple as a JSON **array** and returns HTTP **200**: `[{"error":"Fund not found"}, 404]`.
- **Impact:** Clients deleting a non-existent fund get a 200 with an unexpected array body; the frontend's `api.delete` error handling never triggers.
- **Fix:** `raise HTTPException(status_code=404, detail="Fund not found")`.

### 1.6 27 untyped form fields + manual parsing in the upload endpoint
- **Severity:** Medium
- **File(s):** `backend/routes/holdings.py:24-201`
- **Issue:** `/upload-holdings/` declares ~18 `str` form params (numbers, booleans, JSON arrays all as strings) and hand-parses each with `try/except`/`.lower() == "true"`; six bare `except:` blocks swallow parse errors (lines 80, 94, 102, 109, 117, 186), some silently defaulting money fields to `0.0` (e.g. `total_invested_amount`, lines 114-118).
- **Impact:** A typo'd `total_invested_amount` silently becomes 0 and corrupts P&L instead of returning 422; bare excepts also catch `KeyboardInterrupt`/`SystemExit`.
- **Fix:** Keep `file: UploadFile` as multipart but move scalar fields into a single JSON form field validated by a Pydantic model (or use typed `Form(...)` params: `Form(0.0)` as `float`, `bool`, etc.) and replace bare `except:` with `except ValueError`.

### 1.7 Duplicated Excel-parsing and totals-recalculation logic
- **Severity:** Medium
- **File(s):** `backend/services/holdings_service.py:656-779` (`update_holdings_only`) vs `:794-972` (`process_and_save_holdings`); `:1270-1300` (`handle_sip_action` totals recalc) vs `:1373-1397` (`resolve_pending_nav_installments` — near-identical block); weight-normalization heuristic repeated 4× in `nav_service.py` (262-263, 301-303, 396-398, 495-497)
- **Issue:** Header detection, column normalization, `clean_weight`, ISIN cleaning, and ticker resolution are copy-pasted between the two upload paths; SIP totals recalculation is copy-pasted twice; the `wt > 1` weight heuristic is repeated four times.
- **Impact:** Fixes applied to one copy and not the other (this has already happened: `process_and_save_holdings`'s header detection has a 3-stage fallback at lines 840-859 that `update_holdings_only` lacks). The weight heuristic duplication matters because the heuristic itself is buggy (see Section 9.1).
- **Fix:** Extract `parse_holdings_excel(file) -> list[HoldingItem]` and `recalculate_sip_totals(doc) -> (invested, units)` helpers; define `normalize_weight()` once.

### 1.8 Deprecated APIs throughout
- **Severity:** Low
- **File(s):** `backend/app.py:34` (`@app.on_event("startup")` — deprecated, use lifespan); `datetime.utcnow()` (deprecated since Python 3.12) at `services/auth_service.py:30,32,80,107`, `services/holdings_service.py:495,764,1118,1163`, `models/db_schemas.py:61,67`; Pydantic v1 `.dict()` on v2 (`pydantic>=2.5.0` in requirements) at `services/auth_service.py:83,85`, `holdings_service.py:763,1144`
- **Issue:** All three APIs are deprecated and emit warnings; `utcnow()` returns naive datetimes that get compared against other naive datetimes — works today, breaks the moment one side becomes aware.
- **Impact:** Upgrade friction; subtle TZ bugs (see also Section 9.7).
- **Fix:** Lifespan handler; `datetime.now(timezone.utc)`; `.model_dump()`.

### 1.9 DB connection at import time with hard crash
- **Severity:** Low
- **File(s):** `backend/db.py:10-24`
- **Issue:** `MongoClient` is created and pinged at module import; `InvalidURI/ConfigurationError` re-raises, killing the process before the FastAPI app exists. Uses `print()` with emojis instead of the logging set up in `core/logging.py`. Meanwhile `app.py:34-40` has a second, redundant startup ping that only logs.
- **Impact:** No retry/backoff on transient DNS/Atlas hiccups during deploy; on Render this turns a 5-second Atlas blip into a failed deploy.
- **Fix:** Move client construction into the lifespan handler with retry; replace prints with `logger`.

### 1.10 Frontend mega-components
- **Severity:** Medium
- **File(s):** `frontend/src/components/dashboard/UploadSIP.jsx` (1185 lines), `UploadLumpsum.jsx` (487), `FyersConnectionCard.jsx` (~380), `PortfolioAnalyzer.jsx` (348)
- **Issue:** `UploadSIP.jsx` contains a multi-step wizard, CAS import flow, detailed-installment editor, step-up config, and validation in one file with dozens of `useState` hooks.
- **Impact:** Any SIP UX change touches a 1,200-line file; state interactions are untestable.
- **Fix:** Split per wizard step; lift shared state into a reducer or context.

### 1.11 Misleading/legacy fields
- **Severity:** Low
- **File(s):** `backend/models/db_schemas.py:58` (`last_updated: bool = True # Legacy field, maybe change to datetime?`), `holdings_service.py:764` (`"created_at": datetime.utcnow()  # Reset freshness timestamp`)
- **Issue:** `last_updated` is a boolean that is always `True`; `created_at` doubles as a "holdings freshness" timestamp and is *reset* on every holdings refresh, so it no longer means "created at".
- **Impact:** Anyone querying `created_at` for actual creation date gets wrong answers; `last_updated` is noise stored on every document.
- **Fix:** Add a real `holdings_updated_at: datetime`; drop `last_updated` or make it a datetime.

---

## Section 2 — Dependencies

**Headline finding:** the backend has **no version pinning at all** (39 of 41 lines in `backend/requirements.txt` are bare package names; only `fastapi>=0.109.0`, `pydantic>=2.5.0`, `uvicorn>=0.27.0` have floors) and **no lockfile**. Every deploy installs whatever PyPI serves that day. The frontend does have `package-lock.json` (good).

> "Latest" below is as of the auditor's knowledge cutoff (Jan 2026); verify with `pip index versions` / `npm outdated` before acting.

### Backend (`backend/requirements.txt`)

| Package | Pinned? | Risk | Recommendation |
|---|---|---|---|
| fastapi | `>=0.109.0` floor only | Low — actively maintained | Pin exact version |
| uvicorn | `>=0.27.0` floor only | Low | Pin; add `--workers` (see §8.5) |
| pydantic | `>=2.5.0` floor only | Low | Pin |
| pymongo | unpinned | Medium — major-version jumps (4.x→5.x) change APIs | Pin |
| **python-jose[cryptography]** | unpinned | **High** — effectively unmaintained; CVE-2024-33663 (algorithm-confusion) & CVE-2024-33664 (JWT-bomb DoS) affected ≤3.3.0; unpinned means you can't prove which version is deployed | Replace with `PyJWT` (maintained, smaller) or pin ≥3.4.0 explicitly |
| **passlib[argon2]** | unpinned | **Medium** — unmaintained since 2020; breaks on Python ≥3.13 (`crypt` removal) | Migrate to `argon2-cffi` directly (already a transitive dep) |
| **yfinance** | unpinned | **High operationally** — scrapes Yahoo; breaks several times a year; used as the historical-price fallback (`nav_service.py:417-523`) | Pin; treat as best-effort only (already the case); consider an official data source |
| casparser[mupdf] | unpinned | Medium — parses untrusted PDFs; mupdf CVEs surface regularly | Pin; track advisories |
| pandas / numpy / openpyxl | unpinned | Medium — pandas 3.x will break `df.append`-era idioms; numpy 2.x broke many libs | Pin |
| fyers-apiv3 | unpinned | Medium — broker SDK, breaking API revisions | Pin |
| pandas_market_calendars | unpinned | Low — has graceful fallback (`utils/date_utils.py:42-48`) | Pin |
| requests, python-dotenv, pytz, certifi, dnspython | unpinned | Low | Pin |
| beautifulsoup4, html5lib, lxml, soupsieve, webencodings, multitasking, frozendict, appdirs, et_xmlfile, six | unpinned | Low — these are *transitive* deps of yfinance/openpyxl listed as direct | Remove from requirements; let pip resolve them |
| anyio, h11, starlette, click, idna, charset-normalizer, urllib3, typing_extensions, tzdata | unpinned | Low — transitive deps of fastapi/uvicorn/requests | Remove from requirements |

- **Severity:** High
- **File(s):** `backend/requirements.txt:1-41`
- **Issue:** No pins, no lockfile, and ~half the file is transitive dependencies promoted to direct ones (a snapshot of an old `pip freeze` with versions stripped).
- **Impact:** Non-reproducible builds — a deploy after a bad upstream release (yfinance breakage, pandas 3.0) takes production down with no code change; security posture unauditable.
- **Fix:** Adopt `pip-tools`/`uv`: keep a short `requirements.in` of true direct deps, compile a fully pinned `requirements.txt`.

### Frontend (`frontend/package.json`)

| Package | Declared | Risk | Recommendation |
|---|---|---|---|
| react / react-dom | ^19.2.0 | Low — current major | Keep |
| react-router-dom | ^7.10.1 | Low | Keep |
| axios | ^1.13.2 | Low | Keep; add a response interceptor for 401s (§3.8) |
| vite | ^7.2.4 | Low | Keep |
| tailwindcss | ^4.1.17 | Low | Keep |
| @react-three/fiber + drei + three | ^9.4.2 / ^10.7.7 | Low (bundle size: 3D libs for one landing-page element, `ThreeDElement.jsx`) | Lazy-load the 3D landing element so dashboard users don't pay for three.js |
| @vercel/analytics | ^1.6.1 | Low | Keep |

No unused backend frameworks found; frontend has no test/security tooling at all (no vitest/jest, no eslint-plugin-security) — covered in Section 5.

---

## Section 3 — Security

### 3.1 CRITICAL — Entire Fyers broker integration is unauthenticated and globally shared
- **Severity:** Critical
- **File(s):** `backend/routes/fyers.py:14-137` (no `Depends(get_current_user)` on any route); `backend/services/fyers_service.py:21-34` (singleton), `:18` (`TOKEN_FILE = ... ".fyers_token.json"`)
- **Issue:** Two distinct problems compound:
  1. **No auth:** every `/api/fyers/*` endpoint is public. Anyone on the internet can call `GET /api/fyers/disconnect` (wipes the token — denial of service for all users), `POST /api/fyers/set-token?access_token=...` (plants an attacker-controlled broker token), `GET /api/fyers/auth-url` / `/callback` (initiates/completes the OAuth dance), `GET /api/fyers/status` (leaks `app_id` and token expiry), and `GET /api/fyers/test-quote`.
  2. **Single-tenant token in a multi-tenant app:** `FyersService` is a process-wide singleton holding ONE access token in `backend/.fyers_token.json` (plaintext). Whichever user connects their Fyers account last, *their* brokerage session powers live quotes for **every** user, and any user can disconnect it for everyone.
- **Impact:** Unauthenticated control over a brokerage API session; trivial DoS of the app's core "live NAV" feature; a real user's broker token is shared infrastructure.
- **Fix:** Add `current_user: dict = Depends(get_current_user)` to all Fyers routes; store tokens per-user in MongoDB (encrypted at rest with a key from env, e.g. `cryptography.Fernet`); remove `/set-token` or restrict to an admin role; never return `app_id` from `/status`.

### 3.2 CRITICAL — Live secrets committed to git history
- **Severity:** Critical
- **File(s):** git history — `git show 3493cc8:backend/.env` (later "removed" in commit `813829f` "Removed sensitive info from git", but still fully retrievable)
- **Issue:** A real MongoDB **Atlas connection string including credentials** (82-char value) and an **OPENFIGI_API_KEY** were committed. The repo has a GitHub remote (`origin/main`), so these must be treated as publicly leaked. Deleting the file in a later commit does not remove it from history.
- **Impact:** Anyone with repo access (or a fork/clone made while public) can read/write the production database — all users' portfolio data, password hashes, holdings.
- **Fix:** (1) Rotate the Atlas database user password and the OpenFIGI key **now**; (2) scrub history (`git filter-repo --invert-paths --path backend/.env`) and force-push; (3) add secret scanning (GitHub push protection / gitleaks in CI).

### 3.3 High — Hardcoded fallback JWT secret (the well-known FastAPI tutorial key)
- **Severity:** High
- **File(s):** `backend/core/config.py:12`
- **Issue:** `SECRET_KEY: str = os.getenv("SECRET_KEY", "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7")` — the default is copy-pasted from the FastAPI documentation and is the first key any attacker tries. Unlike the dead `auth.py` (which raised if unset), the live config silently falls back. `FYERS_APP_ID` likewise has a real-looking default (`"DXGLWQ4E2O-100"`, line 19).
- **Impact:** If `SECRET_KEY` is ever missing from the environment (new deploy, renamed var — and the repo uses three different names for it, see §1.1), every JWT and every password-reset token becomes forgeable: full account takeover.
- **Fix:** `SECRET_KEY = os.environ["SECRET_KEY"]` (fail fast), or raise in `Settings.__init__` when unset/equal to the known default.

### 3.4 High — No rate limiting on any endpoint
- **Severity:** High
- **File(s):** `backend/app.py` (no limiter middleware; only CORS at lines 25-31); `backend/routes/auth.py:24-36` (`/token`), `:19-22` (`/register`), `:57-77` (`/forgot-password`)
- **Issue:** Login, registration, forgot-password, and the heavyweight endpoints (`/analyze-portfolio`, `/parse-cas/`) have no throttling, no lockout, no CAPTCHA.
- **Impact:** Credential brute-force against `/token` (Argon2 slows each attempt but also amplifies CPU-DoS); unlimited password-reset emails through your Brevo quota (and Brevo charges/blocks you); `/parse-cas/` lets an authenticated user upload arbitrary PDFs for expensive parsing in a tight loop. Combined with the event-loop blocking in §4.1, a single hostile (or merely impatient) user can freeze the API.
- **Fix:** Add `slowapi` (e.g. `5/minute` on `/token` and `/forgot-password`, `2/minute` on `/parse-cas/`); consider per-user concurrency caps on analysis endpoints.

### 3.5 High — Password-reset tokens are not single-use and survive the reset
- **Severity:** High
- **File(s):** `backend/services/auth_service.py:105-148`
- **Issue:** Reset tokens are stateless JWTs signed with the same `SECRET_KEY` as access tokens. `reset_password()` verifies and updates the password but records nothing — the same token keeps working until its 15-minute expiry, and a reset does not invalidate other reset tokens or existing sessions. The only thing distinguishing a reset token from an access token is the `purpose` claim; `get_current_user` (`routes/auth.py:44-55`) checks only `sub` — a reset token whose `sub` happens to match a username would be accepted as an access token (today `sub` is an email for reset tokens, so usernames containing `@` are the edge case).
- **Impact:** A leaked reset link (browser history, email forward, server logs — the URL contains the token, `routes/auth.py:72`) is replayable for 15 minutes even after the user resets; an attacker who used it once can use it again. Cross-acceptance between token types is a latent privilege bug.
- **Fix:** Store a one-time nonce/hash in the user document (`reset_token_hash`, `reset_token_used_at`), invalidate on use; add `"type": "access"` to access tokens and reject anything else in `get_current_user`; optionally bump a per-user `token_version` on password change to kill live sessions.

### 3.6 Medium — Account enumeration via `/register`
- **Severity:** Medium
- **File(s):** `backend/services/auth_service.py:62-69`
- **Issue:** Registration returns distinct `400 "Username already exists"` / `400 "Email already exists"`. (Forgot-password gets this right with a uniform response, `routes/auth.py:65-68`.)
- **Impact:** Attackers can enumerate registered emails/usernames to target phishing or credential-stuffing.
- **Fix:** Return a generic "registration failed" message, or accept and send a verification email. (Trade-off with UX; at minimum log + rate-limit.)

### 3.7 Medium — Internal error details echoed to clients
- **Severity:** Medium
- **File(s):** `backend/routes/holdings.py:360` (`HTTPException(500, f"Failed to parse CAS: {str(e)}")`), `:434`; `backend/services/holdings_service.py:779` & `:1306` (`return {"error": str(e)}` → surfaced as 400 by the routes); `backend/services/cas_service.py:106`
- **Issue:** Raw exception strings (library internals, file paths, pandas errors) are returned in API responses. The global handler in `app.py:16-22` does this right (generic message) — these paths bypass it.
- **Impact:** Information disclosure (stack internals, dependency versions) aids exploitation; ugly errors leak to UI.
- **Fix:** Map known failures to friendly messages; log the exception server-side and return a generic detail + correlation ID for everything else.

### 3.8 Medium — JWT stored in `localStorage`, no 401 handling
- **Severity:** Medium
- **File(s):** `frontend/src/api.js:10`, `frontend/src/context/AuthContext.jsx:63`
- **Issue:** Access token lives in `localStorage` (readable by any XSS payload); there is no axios *response* interceptor, so a 401 mid-session (token expires after 30 min) just surfaces as a failed request — the app neither logs out nor refreshes.
- **Impact:** XSS → token theft → full account takeover for 30 min per token; expired-session UX is silent breakage.
- **Fix:** Prefer httpOnly secure cookies (with CSRF protection) or at minimum add a response interceptor that clears state and redirects to login on 401.

### 3.9 Medium — MongoDB in docker-compose runs with no auth, port published to host
- **Severity:** Medium
- **File(s):** `docker-compose.yml:27-32`
- **Issue:** `mongo:latest` with no `MONGO_INITDB_ROOT_USERNAME/PASSWORD` and `ports: "27017:27017"` — the DB is reachable, unauthenticated, by anything that can reach the host.
- **Impact:** On a dev laptop, any process/LAN peer can read/write the DB; if this compose file is ever used on a server, it's a public unauthenticated database (the classic "Mongo ransom note" scenario).
- **Fix:** Enable auth via env vars, drop the host port mapping (backend reaches it on the compose network), pin the image (`mongo:7`).

### 3.10 Medium — Docker container runs as root
- **Severity:** Medium
- **File(s):** `backend/Dockerfile` (no `USER` directive; `COPY . .` at line 20)
- **Issue:** The app runs as root in the container. (`.dockerignore` does exclude `.env` — good.) `COPY . .` also bakes `logs/` and any local artifacts into the image.
- **Impact:** Container escape blast radius; PDF parsing (casparser/mupdf) of untrusted user uploads as root is the riskiest combination in this app.
- **Fix:** `RUN useradd -m app && chown -R app /app` + `USER app`; extend `.dockerignore` with `logs`, `tests`, `*.bat`.

### 3.11 Low — PII in logs
- **Severity:** Low
- **File(s):** `backend/routes/auth.py:67` (logs unknown emails verbatim), `services/auth_service.py:63,68,91,94,143` (usernames/emails on every auth event)
- **Issue:** Emails and usernames are logged at INFO/WARNING into `backend/logs/app.log`; CAS endpoints handle PAN numbers (returned to client in `cas_service.get_investor_info`, fine) — currently not logged, but one debug line away.
- **Impact:** Log files become PII stores (GDPR/DPDP exposure); on Render, logs are shipped to the platform.
- **Fix:** Log user IDs instead of emails; add a logging filter for email-shaped strings.

### 3.12 Low — Fyers `/set-token` takes the secret as a query parameter
- **Severity:** Low (subsumed by 3.1)
- **File(s):** `backend/routes/fyers.py:119-125`
- **Issue:** `POST /set-token?access_token=...` — FastAPI binds a bare `str` parameter on a POST to the query string, so the broker token lands in access logs and proxies.
- **Fix:** Move to request body; or delete the endpoint (see 3.1).

### Positive notes (Section 3)
- Argon2 for password hashing (`auth_service.py:14`) — good choice.
- Password strength validation enforced server-side (`auth_service.py:43-54`).
- Forgot-password is enumeration-safe and logs instead of leaking (`routes/auth.py:65-68`).
- NoSQL injection: all user inputs reach pymongo as typed values via Pydantic models (e.g. `models/schemas.py`); `ObjectId()` parsing is wrapped. No string-built queries found.
- CAS temp file is deleted in `finally` (`cas_service.py:107-113`); PDF password is not logged.
- `.env` / `.fyers_token.json` are gitignored (`.gitignore:6-14`) — the history leak (§3.2) predates this.


---

## Section 4 — Performance & Database

### 4.1 CRITICAL — Blocking synchronous I/O inside `async def` routes freezes the whole server
- **Severity:** Critical
- **File(s):** `backend/routes/portfolio.py:8-19` (`async def analyze_portfolio` → `nav_service.calculate_pnl`), `backend/routes/holdings.py:23-49` (`async def upload`), `:302`, `:363`; blocking work: `requests.get` calls throughout `nav_service.py` (77, 124, 158, 192) and `holdings_service.py` (62, 93, 128), `time.sleep` retry loops (`nav_service.py:84,90,110,335`), `ThreadPoolExecutor` join (`nav_service.py:308`), pandas Excel parsing (`holdings_service.py:796`), yfinance download (`nav_service.py:454`)
- **Issue:** These routes are declared `async def`, so FastAPI runs them **on the event loop** — but everything inside is synchronous. One `calculate_pnl` call can do: full NAV-history download + per-installment NAV fetches + live quotes for ~50-100 stocks with retry sleeps (the NSE fallback path alone can sleep `0.3s × failed stocks` sequentially, `nav_service.py:328-350`). While it runs, **every other request to the API — including `/health` — is frozen.** The `Procfile` runs a single uvicorn worker, so there is no other process to absorb traffic.
- **Impact:** With two concurrent users the app is unusable; Render will fail health checks during any analysis of a large fund and restart the dyno. This also turns §3.4 (no rate limiting) into a one-request DoS.
- **Fix:** Short term: declare these routes as plain `def` (FastAPI then runs them in the threadpool). Medium term: switch external calls to `httpx.AsyncClient`, replace `time.sleep` with `asyncio.sleep`, and run CPU-ish work (pandas, casparser) via `run_in_executor`. Also add `--workers 2` (or gunicorn+uvicorn workers) to the `Procfile`.

### 4.2 High — mfapi.in full NAV history downloaded repeatedly per request, no caching
- **Severity:** High
- **File(s):** `backend/services/nav_service.py:117-148` (`get_latest_nav`), `:150-180` (`get_nav_at_date`), `:182-228` (`get_next_nav_after_date`) — each does `GET https://api.mfapi.in/mf/{scheme_code}` which returns the **entire NAV history** (often 5,000+ rows for old funds); callers: `calculate_pnl` (`:572`, `:732`), `sync_sip_installments`→`handle_sip_action` (`holdings_service.py:1210`), `resolve_pending_nav_installments` (`:1346` — **inside a per-installment loop**)
- **Issue:** A single P&L request for a SIP fund with N pending-NAV installments triggers N+2 full-history downloads of the same scheme's data within milliseconds of each other. There is no cache of any kind (contrast: the FYERS BSE symbol map does have a 24h TTL cache, `holdings_service.py:45-87`).
- **Impact:** Multi-second latency per dashboard card; mfapi.in is a free community API — hammering it risks IP bans, which takes down NAV resolution entirely.
- **Fix:** Fetch the scheme history once per request and pass it down; add a process-level TTL cache (e.g. `cachetools.TTLCache`, 15-min TTL keyed by scheme_code). Official NAVs publish once daily — even a 1-hour cache is safe outside the publishing window.

### 4.3 High — NSE equity master re-downloaded per upload; O(N×M) linear ISIN resolution
- **Severity:** High
- **File(s):** `backend/services/holdings_service.py:89-98` (`load_nse_csv` — no caching), `:100-118` (`isin_to_symbol_nse` — full-table linear scan per ISIN), call sites `:728`, `:924`
- **Issue:** Every holdings upload downloads the ~2,000-row NSE `EQUITY_L.csv` and then, for each of the fund's ~30-100 holdings, linearly scans the whole table (the header-detection `next()` calls also re-run per ISIN). The 24h-TTL pattern already exists 40 lines above for the BSE map but wasn't applied here.
- **Impact:** Upload latency measured in tens of seconds for large funds; another external dependency hit on every user action.
- **Fix:** Cache the CSV with the same TTL pattern and build an `{isin: symbol}` dict once — turns O(N×M) into O(N+M).

### 4.4 High — No MongoDB indexes anywhere
- **Severity:** High
- **File(s):** no `create_index` call in the repo (verified by grep); hot queries: `users_collection.find_one({"username": ...})` (`services/auth_service.py:40` — runs on **every authenticated request** via `get_current_user`), `find_one({"email": ...})` (`:102`), `holdings_collection.find({"user_id": ...})` (`holdings_service.py:516`), compound `{"_id", "user_id"}` lookups, and the multi-key upsert at `holdings_service.py:1129-1144`
- **Issue:** Every query is a collection scan. Worse, the absence of **unique** indexes on `users.username` / `users.email` means the check-then-insert in `create_user` (`auth_service.py:62-83`) is a race: two concurrent registrations create duplicate usernames, after which `get_user` returns an arbitrary one.
- **Impact:** Per-request latency grows linearly with user count; duplicate-account integrity bug is exploitable (register the victim's username concurrently).
- **Fix:** At startup: `users.create_index("username", unique=True)`, `users.create_index("email", unique=True)`, `holdings.create_index([("user_id", 1)])`; make `create_user` rely on the unique index (catch `DuplicateKeyError`) instead of check-then-insert.

### 4.5 Medium — Read-modify-write race on SIP installments
- **Severity:** Medium
- **File(s):** `backend/services/holdings_service.py:1185-1300` (`handle_sip_action`: `find_one` → mutate full `sip_installments` array in Python → `update_one $set` whole array), same pattern in `resolve_pending_nav_installments` (`:1320-1397`); `calculate_pnl` triggers `sync` + `resolve` + re-read per request (`nav_service.py:546-550`)
- **Issue:** Two concurrent requests (e.g. user double-clicks "PAID" while the dashboard auto-resolves pending NAVs) each read the doc, mutate independently, and the last `$set` wins — losing the other's installment updates, and recomputing `invested_amount`/`future_sip_units` from stale data.
- **Impact:** Lost SIP confirmations and silently wrong invested totals — a financial-data integrity bug, not just a perf one.
- **Fix:** Use targeted atomic updates with array filters (`update_one({"_id": ..., "sip_installments.date": date_str}, {"$set": {"sip_installments.$.status": ...}})`) or add an optimistic-concurrency `version` field.

### 4.6 Medium — Per-stock sequential HTTP calls for historical estimation
- **Severity:** Medium
- **File(s):** `backend/services/nav_service.py:394-404` — one `fyers_service.get_historical_pct_change` call (1-2 HTTP requests, `fyers_service.py:427-472`) per stock, sequentially; yfinance fallback at least batches (`nav_service.py:454`)
- **Issue:** For a 75-stock fund, the Fyers historical path makes up to 150 sequential API calls inside the request (each with its own latency), on the event loop (§4.1).
- **Impact:** D-1 estimation can take minutes; multiplies the event-loop freeze.
- **Fix:** Fyers history API is per-symbol, but the calls can be parallelized in a bounded threadpool (as the NSE live path already does at `nav_service.py:308`), and results cached per (symbol, date).

### 4.7 Low — Frontend polling loops
- **Severity:** Low
- **File(s):** `frontend/src/components/ui/ServerWakeUp.jsx:64` (polls `/health` every 5 s during cold start — reasonable), `frontend/src/components/dashboard/FyersBanner.jsx:33` and `FyersConnectionCard.jsx:51` (poll Fyers status on intervals)
- **Issue:** Multiple components poll independently; with §4.1 unfixed, the polls themselves contribute to queue buildup behind a blocked event loop.
- **Impact:** Minor server load; mostly symptomatic.
- **Fix:** Centralize Fyers status in `FyersContext` with a single poller (partially done); back off when the tab is hidden.

---

## Section 5 — Testing

**State of play:** ~26 files under `backend/tests/`, but they are a mix of (a) real `unittest` suites, (b) standalone debug scripts with `if __name__ == "__main__"` and live network calls, and (c) placeholder tests with empty bodies. There is **no pytest config, no conftest.py, no CI to run any of it** (no `.github/` in the repo), **no coverage tooling**, and the **frontend has zero tests** (no test runner in `frontend/package.json`).

### Coverage table

| Area | Status | Risk | Recommended tests |
|---|---|---|---|
| XIRR math (`utils/xirr.py`) | OK — `tests/test_xirr.py` covers growth/loss/SIP/20-yr cases | Medium — the bisection-fallback bug (§9.2) is exactly the path with no test | Add: no-root-in-interval → expect `None`; same-date flows; extreme rates |
| SIP installment generation | Partial — `tests/test_sip_invariants.py` covers date clamping (day 31, Feb), but the state-machine tests are **empty placeholders** (`test_terminal_state_paid_cannot_be_modified` etc. are literally `pass`, lines 33-47, with comments saying the system currently allows the invalid transitions) | High — documented-but-untested invariant violations in money-tracking code | Implement the placeholder tests with mongomock; add PAID→SKIPPED transition rejection (or implement the rejection first) |
| P&L decision tree (`nav_service.calculate_pnl`, 5 NAV-fallback cases) | None against live code — `tests/test_new_flow.py`, `verify_live_nav.py`, `test_weekend_nav.py` import the **dead `nav_logic.py`** | **Critical** — the core product feature has zero tests | Extract pure functions (decision tree given a `nav_map`) and table-test all 5 branches incl. stale-D0 detection |
| Weight normalization / portfolio change | None | **Critical** — §9.1 bug ships silently | Unit test: holdings with 0.5% and 50% weights → assert correct weighted average |
| Auth (register/login/reset, JWT) | None | High — account takeover paths untested | FastAPI `TestClient` + mongomock: duplicate registration, wrong password, expired/forged/reset-as-access tokens |
| Holdings upload (Excel parsing, header detection) | Scripts only (`test_column_detection.py`, `test_casparser*.py` run against local sample files/network) | High — most fragile input path | Pytest with fixture .xlsx files (normal, weird headers, no-ISIN, % strings) |
| CAS parsing | Script-style, requires a real CAS PDF + password | Medium | Commit a synthetic/redacted fixture; test password-failure mapping |
| Fyers service | None (mocked away wholesale in other tests) | Medium | Mock SDK responses; token expiry/reload logic |
| Routes/authorization (user A can't touch user B's fund) | None | High — `user_id` scoping is hand-rolled per query | TestClient: cross-tenant access on `/funds/{id}`, `/sip-action`, `/analyze-portfolio` |
| Frontend (all of it) | Zero tests, no runner installed | Medium — 1,185-line `UploadSIP.jsx` wizard logic | Vitest + React Testing Library for wizard state transitions and `AuthContext` token expiry |

### 5.1 High — Tests target dead code
- **Severity:** High
- **File(s):** `backend/tests/test_new_flow.py:25`, `tests/verify_live_nav.py:8-33`, `tests/test_weekend_nav.py:9`, `tests/verify_weekend.py:9`, `tests/debug_holdings.py:8`, `tests/debug_pnl_detailed.py:10`
- **Issue:** Six test/verify scripts import `nav_logic` (absent from the app's import graph since the services refactor). They give false confidence about behavior that production no longer runs.
- **Impact:** Real `calculate_pnl` regressions ship undetected.
- **Fix:** Port to `services/nav_service.py` or delete alongside `nav_logic.py`.

### 5.2 High — No CI; tests not runnable as a suite
- **Severity:** High
- **File(s):** repo root (no `.github/workflows/`, no `pytest.ini`/`pyproject.toml`/`conftest.py`); `README.md:244-248` claims `pytest tests/ -v` works
- **Issue:** Many "tests" execute network calls (NSE, mfapi, yfinance) at import or call time (e.g. `tests/test_live_fetch_robustness.py`, `verify_nse_fetch.py`), so a plain pytest run is flaky-by-design and there is no automation to run even the hermetic ones.
- **Impact:** Nothing protects `main`; every deploy is untested by machinery.
- **Fix:** Split `tests/unit` (hermetic, CI-gated) from `tests/integration` (opt-in, marked); add a GitHub Actions workflow: `ruff` + `pytest tests/unit` + `npm run build`.

---

## Section 6 — Database Schema & Migrations

### 6.1 High — No unique constraints on identity fields (race-prone registration, heuristic upsert)
- **Severity:** High
- **File(s):** `backend/services/auth_service.py:62-83` (check-then-insert without unique index — see §4.4); `backend/services/holdings_service.py:1129-1144` (fund identity = `{fund_name, user_id, invested_date, investment_type}` + `invested_amount` for lumpsum, used as upsert key)
- **Issue:** Fund "identity" is a heuristic tuple of user-editable values. Two SIPs in the same fund started on the same date silently overwrite each other (`update_one(..., upsert=True)`); a different `fund_name` spelling from a different AMC sheet creates a duplicate instead of updating. The code comments acknowledge the uncertainty ("We should probably keep this behavior but be careful.", line 1134).
- **Impact:** User uploads can silently destroy or duplicate investment records — data loss in the system of record for money.
- **Fix:** Generate the `_id` up front and return it; make re-upload an explicit `PUT /funds/{id}/...`; add a unique compound index on whatever identity is chosen so collisions error instead of overwriting.

### 6.2 Medium — Schemaless drift handled ad hoc; no migration mechanism
- **Severity:** Medium
- **File(s):** `backend/services/holdings_service.py:414` (`doc.get("current_sip_amount") or doc.get("sip_amount", 0)` — two generations of field names read defensively), `models/db_schemas.py:58` (`last_updated: bool # Legacy field`), `nav_service.py:746-784` (multiple `doc.get(..., 0) or 0` fallbacks for older documents)
- **Issue:** Pydantic validates documents on *write* (`HoldingsDocument(**doc_data)`, `holdings_service.py:1124`) but reads are raw dicts with per-call-site fallbacks. There is no migration tool, no versioned migration scripts, no `schema_version` field on documents.
- **Impact:** Every schema evolution adds another `or doc.get(...)` branch; old documents follow different code paths than new ones — exactly where money-math bugs hide.
- **Fix:** Add `schema_version` to documents; write one-off migration scripts under `backend/migrations/` run at deploy; parse reads through the Pydantic model (`HoldingsDocument.model_validate(doc)`) so fallbacks live in one place.

### 6.3 Medium — Dates stored as `DD-MM-YYYY` strings; inconsistent format contract
- **Severity:** Medium
- **File(s):** `models/db_schemas.py:14` (`date: str # DD-MM-YYYY`), `:29` (`invested_date: Optional[str] # YYYY-MM-DD` — comment contradicts actual stored format), `models/schemas.py:35,41` (API regex demands `YYYY-MM-DD`) vs `routes/holdings.py:126` (API regex demands `DD-MM-YYYY`); sorting workaround at `cas_service.py:288-291`
- **Issue:** Dates are strings in two competing formats depending on the endpoint; Mongo can't range-query or sort them chronologically (`"02-01-2026" < "31-12-2025"` lexically). Code repeatedly re-parses with `parse_date_from_str` in loops.
- **Impact:** Any future "installments between X and Y" query needs full-collection client-side filtering; off-by-format bugs (the upload route and the analyze route literally disagree today).
- **Fix:** Store BSON dates (or ISO `YYYY-MM-DD`); convert at the API boundary only; pick one wire format.

### 6.4 Medium — Denormalized `users.uploads` array drifts from `holdings`
- **Severity:** Medium
- **File(s):** `backend/services/holdings_service.py:1150-1168` (push/pull on `users.uploads`), `:549-561` (`delete_fund` pulls it), `models/db_schemas.py:63-67`
- **Issue:** Each upload is mirrored into the user document. Nothing reads `users.uploads` anywhere in the codebase (verified by grep — only writes). Sync is manual and best-effort: the `$pull` + `$push` pair isn't transactional with the holdings upsert.
- **Impact:** Unused write amplification plus a guaranteed-to-drift mirror; unbounded array growth in the user doc.
- **Fix:** Delete the `uploads` mirror; derive from `holdings_collection.find({"user_id": ...})` (already indexed per §4.4 fix).

### 6.5 Medium — No backup/restore story
- **Severity:** Medium
- **File(s):** `docker-compose.yml:27-35` (bare `mongo_data` volume, no backup sidecar/docs); no mention in `README.md`
- **Issue:** Production is presumably Atlas (the leaked URI in §3.2 was Atlas) — Atlas free tier (M0) has no continuous backups. Nothing in the repo documents or automates backups, and there is no seed/restore script.
- **Impact:** A bad deploy plus the upsert-overwrite bug (§6.1) or the race (§4.5) can corrupt holdings with no way back. This app's entire value is the data users typed in.
- **Fix:** Document the Atlas tier and enable scheduled snapshots (or `mongodump` cron to object storage); test a restore once.

### 6.6 Low — Monetary values stored as doubles
- **Severity:** Low (schema aspect; calculation aspect in §9.5)
- **File(s):** `models/db_schemas.py:36,42-44` (`float` for amounts/units), `cas_service.py:40-43` (casparser's `Decimal` deliberately downcast to `float`)
- **Issue:** Money and units are IEEE-754 doubles end to end; CAS data arrives as `Decimal` and is immediately degraded.
- **Impact:** Paisa-level drift in invested totals after many additions; cosmetic mismatches against CAS statements (users notice Rs 0.01 discrepancies in finance apps).
- **Fix:** Store amounts as `Decimal128` (pymongo supports it) or integer paise; round only at display.


---

## Section 7 — Documentation & DX

### 7.1 Medium — README documents an API that doesn't exist
- **Severity:** Medium
- **File(s):** `README.md:183-208` vs actual routes
- **Issue:** The endpoint table lists `POST /auth/register`, `POST /auth/login`, `GET /holdings/`, `POST /holdings/upload`, `DELETE /holdings/{id}`, `GET /portfolio/analysis`, `POST /fyers/callback`. The real API is `POST /register`, `POST /token` (OAuth2 form, not JSON login), `GET /funds/`, `POST /upload-holdings/`, `DELETE /funds/{fund_id}`, `POST /analyze-portfolio`, `GET /api/fyers/callback`. Not one documented path matches.
- **Impact:** Any integrator or new contributor following the README gets 404s on every call.
- **Fix:** Regenerate the table from the live OpenAPI spec (`/docs`), or just link to it and delete the table.

### 7.2 Medium — Setup instructions reference the wrong env var and wrong ports
- **Severity:** Medium
- **File(s):** `README.md:122-128` (`JWT_SECRET=your-secret-key` — the app reads `SECRET_KEY`, `core/config.py:12`; a `.env` built from the README leaves the app on the hardcoded default key, see §3.3); `README.md:236-238` ("Backend API on port 8000, Frontend on port 3000") vs `docker-compose.yml:5,23` (host ports **8001** and **5174**); missing `BREVO_*`/`FRONTEND_URL` from the README env list (they are in `.env.example`, which is accurate — good)
- **Issue:** README and `.env.example` disagree; README and compose disagree.
- **Impact:** The JWT_SECRET error silently produces a forgeable-token deployment — a doc bug with a security consequence.
- **Fix:** Make README defer to `.env.example` as the single source of truth; fix the ports.

### 7.3 Low — Stale architecture description and testing claims
- **Severity:** Low
- **File(s):** `README.md:68-99` (project tree lists `nav_logic.py` as live logic, omits `core/`, `utils/`, `cas_service`, `email_service`, `schemes` route), `README.md:244-248` (`pytest tests/ -v` — no pytest config exists and several tests need live network/PDFs, §5.2), `README.md:15` (claims "Yahoo Finance" is the live-price source; the primary is Fyers, with NSE scraping then yfinance as fallbacks)
- **Issue:** Documentation lags roughly one refactor behind the code.
- **Impact:** Misleading mental model for contributors; "transparent estimation logic" (the product's stated differentiator, line 3) is undocumented — the actual D0/D-1 decision tree exists only in code comments.
- **Fix:** Document the NAV estimation decision tree (it's good!) in a `docs/nav-estimation.md`; prune the README tree.

### 7.4 Low — Frontend README is Vite boilerplate; no .env validation
- **Severity:** Low
- **File(s):** `frontend/README.md` (stock Vite template text), `frontend/.env.example` (single var, fine), `frontend/src/api.js:4` (silent fallback to `http://127.0.0.1:8000` when `VITE_API_URL` is unset — a prod build with a missing var quietly points at localhost)
- **Issue:** No frontend-specific docs; misconfigured builds fail silently at runtime.
- **Impact:** A Vercel deploy without the env var renders a UI that can't reach the API, with no build-time warning.
- **Fix:** Fail the build when `VITE_API_URL` is missing in production mode (`vite.config.js` check); replace the boilerplate README.

---

## Section 8 — Logging, Monitoring & Deployment

### 8.1 High — No CI/CD pipeline at all
- **Severity:** High
- **File(s):** repo root — no `.github/workflows/`, no `render.yaml`, no test/lint gate of any kind; deployment is implied by `Procfile` (Render) + `frontend/vercel.json`
- **Issue:** Pushes to `main` deploy (via Render/Vercel auto-deploy) with zero automated checks — not even `python -m compileall` or `npm run build`.
- **Impact:** A syntax error in any backend file takes production down; rollback is manual (re-deploy a previous commit from the Render dashboard).
- **Fix:** Minimal GitHub Actions: backend `pip install + pytest tests/unit + ruff`, frontend `npm ci + npm run build`; enable "wait for CI" on Render/Vercel auto-deploys.

### 8.2 Medium — File logging to ephemeral disk; no log aggregation or error tracking
- **Severity:** Medium
- **File(s):** `backend/core/logging.py:7-9, 30-33` (RotatingFileHandler → `logs/app.log`); `backend/logs/` (runtime artifacts incl. yfinance SQLite caches accumulate inside the app dir); no Sentry/Rollbar/etc. anywhere
- **Issue:** On Render, the container filesystem is ephemeral — `logs/app.log` vanishes on every deploy/restart, so the file handler is pure overhead in production; stdout (which Render does capture) is the only real channel. There is no error tracker, so unhandled exceptions (caught by `app.py:16-22`) are only discoverable by reading platform logs.
- **Impact:** Production incidents are invisible unless a user reports them; no alerting on the `logger.critical` Mongo-startup failure (`app.py:40`) — the app keeps serving 500s indefinitely.
- **Fix:** Keep stdout-only logging in prod (env-gate the file handler); add Sentry (FastAPI integration is ~3 lines); alert on startup-failure logs.

### 8.3 Medium — Health check doesn't check anything
- **Severity:** Medium
- **File(s):** `backend/app.py:53-55` (`/health` returns `{"status": "ok"}` unconditionally); `backend/app.py:34-40` (startup logs `critical` on Mongo failure but app stays up)
- **Issue:** `/health` reports OK even when MongoDB is unreachable or the Fyers/mfapi dependencies are dead; conversely, during a long blocking request (§4.1) it doesn't answer at all.
- **Impact:** Render keeps routing traffic to a dead-DB instance; the frontend `ServerWakeUp` flow declares the server "awake" when it can't serve a single authenticated request.
- **Fix:** `/health` (liveness) stays trivial; add `/ready` that pings Mongo with a short timeout and use it as the platform health check.

### 8.4 Medium — Unpinned/anonymous infrastructure in docker-compose
- **Severity:** Medium
- **File(s):** `docker-compose.yml:28` (`mongo:latest`), no `restart:` policies, no healthchecks on any service; `backend/Dockerfile:2` pins only `python:3.11-slim` (floating minor)
- **Issue:** `mongo:latest` jumped major versions twice in two years; a `docker-compose pull` can silently upgrade the database engine. No `restart: unless-stopped` means a crashed backend stays down.
- **Impact:** Non-reproducible local/prod-ish environments; surprise Mongo upgrades can require manual feature-compat fixes.
- **Fix:** Pin `mongo:7`, add restart policies + healthchecks, pin the Python image digest or at least minor (`python:3.11.9-slim`).

### 8.5 Medium — Single worker, no concurrency headroom
- **Severity:** Medium (becomes Critical combined with §4.1)
- **File(s):** `Procfile:1` (`uvicorn app:app --host 0.0.0.0 --port $PORT` — one process, one event loop), same in `backend/Dockerfile:26`
- **Issue:** One uvicorn process with no `--workers`; given the blocking handlers, effective concurrency is 1 request at a time for the heavy endpoints.
- **Impact:** See §4.1; also no graceful-restart story.
- **Fix:** `uvicorn app:app --workers 2` minimum (Render free tier RAM permitting) after fixing §4.1; or gunicorn with uvicorn workers.

### 8.6 Low — print() instead of logger; emoji in operational output
- **Severity:** Low
- **File(s):** `backend/db.py:19-23` (prints with ✅/❌/👉 before logging is configured), `backend/services/email_service.py:35-41` (prints full password-reset email incl. the tokenized URL to stdout in dev mode — fine in dev, but the mode flag is just "no BREVO_API_KEY", so a prod deploy missing that one env var prints live reset tokens into platform logs)
- **Issue:** Operational messages bypass the logging pipeline; dev-mode fallback is triggered by config absence rather than an explicit `ENV` check.
- **Impact:** Reset tokens in log aggregation if Brevo is ever misconfigured (token + email = account takeover, compounding §3.5).
- **Fix:** Gate dev-mode email on `IS_PRODUCTION` (already computed in `core/config.py:7`) — in prod with no API key, fail loudly instead of printing the token.

---

## Section 9 — Domain Logic (Financial Accuracy)

### 9.1 High — Weight-normalization heuristic misweights all sub-1% holdings by up to 100×
- **Severity:** High
- **File(s):** `backend/services/nav_service.py:261-263` (Fyers live path), `:300-303` (NSE fallback), `:330-332` (retry pass), `:395-398` (Fyers historical), `:494-497` (yfinance historical)
- **Issue:** Weights come from the AMC Excel as percentages (e.g. `9.13`, `0.85` — `clean_weight` at `holdings_service.py:914-921` just strips `%`). The estimator normalizes with `wt = wt/100 if wt > 1 else wt`. A 0.85% holding therefore stays `0.85` and is treated as **85%** of the portfolio, while a 9.13% holding becomes `0.0913`. One small-cap position moving 3% can swing the estimated NAV more than the entire rest of the fund. The same flawed branch also corrupts the coverage check (`total_wt >= 0.75`), so the "insufficient coverage" guard passes when it shouldn't.
- **Impact:** The headline feature — live NAV estimation — produces materially wrong numbers for any fund holding positions under 1% (which is nearly every diversified equity fund; typically 10-30 such positions). Day-P&L numbers shown to users are wrong in both direction and magnitude on volatile days.
- **Fix:** Normalize once at ingestion: decide the unit at parse time (if column header contains `%`, divide by 100 and store fractions), validate `sum(weights) ≈ 1.0 ± tolerance` per fund, and delete the per-call heuristic. Example:
  ```python
  total = sum(h["Weight"] for h in holdings_list)
  if not 95 <= total <= 105:   # percentages should sum to ~100
      return {"error": f"Holdings weights sum to {total:.1f}%, expected ~100%"}
  for h in holdings_list:
      h["Weight"] = h["Weight"] / 100.0   # store as fraction, always
  ```

### 9.2 High — XIRR bisection fallback fabricates -99% or +1000% instead of returning None
- **Severity:** High
- **File(s):** `backend/utils/xirr.py:177-184`
- **Issue:** When Newton-Raphson fails and bisection finds no sign change in [-0.99, 10.0], the code returns the nearer bound as the answer:
  ```python
  if npv_low * npv_high > 0:
      if abs(npv_low) < abs(npv_high):
          return low * 100      # → -99.0 (%)
      return high * 100         # → 1000.0 (%)
  ```
  These are not approximations of anything — they're interval endpoints.
- **Impact:** Users see "-99%" or "1000%" annualized return on their dashboard for degenerate cash-flow patterns (e.g. very recent first installment, value ≈ invested). `nav_service.py:837-838` rounds and forwards it without sanity checks.
- **Fix:** Return `None` when no root exists in the interval; in `calculate_pnl`, suppress XIRR display when `None` (already handled) and consider suppressing XIRR for holdings younger than ~30 days, where annualization is meaningless.

### 9.3 Medium — Simple-mode SIP XIRR uses today's installment amount for all past months
- **Severity:** Medium
- **File(s):** `backend/utils/xirr.py:233-288` (`calculate_sip_xirr` builds cash flows from `installments` only; `manual_invested_amount` param explicitly "DEPRECATED … ignored", lines 247-248), fed from `holdings_service.generate_installment_dates` (`:331-388`) which stamps every generated past installment with the *current* `sip_amount`
- **Issue:** In simple mode the user supplies a CAS total (`manual_invested_amount`) plus a SIP amount; past months are synthesized as ASSUMED_PAID flows of exactly `sip_amount` each. If the real history had step-ups, top-ups, pauses, or a different starting amount, the synthesized flows misstate timing and size of investments. The CAS lump itself never enters the flows except via this approximation; meanwhile `current_value` includes all real units.
- **Impact:** XIRR can be off by several percentage points for anyone whose SIP wasn't perfectly constant since inception — i.e., exactly the step-up users the app courts (`stepup_enabled` config). Detailed mode is correct; simple mode silently isn't, with no caveat shown.
- **Fix:** Label simple-mode XIRR as approximate in the API response (`xirr_is_estimate: true`), and/or distribute `manual_invested_amount` across the synthesized dates so at least the total matches reality.

### 9.4 Medium — Lumpsum purchase NAV silently falls back to *today's* NAV
- **Severity:** Medium
- **File(s):** `backend/services/nav_service.py:724` (`purchase_nav = current_nav` initial value), `:728-741` (only overwritten if `get_nav_at_date` succeeds; failure path is `logger.debug` + fall-through)
- **Issue:** If the historical-NAV fetch fails (mfapi timeout — a 5s `timeout=5` on an uncached full-history call, §4.2), units are computed as `investment / current_nav`, i.e. as if the user bought today.
- **Impact:** P&L silently shows ≈ 0 and "units" change between refreshes depending on a third-party API's mood — with no flag in the response distinguishing real from fallback math.
- **Fix:** On failure, return an explicit error/`is_partial: true` flag rather than computing with the wrong NAV; retry/caching from §4.2 makes failures rare.

### 9.5 Medium — Float arithmetic end-to-end for money and units
- **Severity:** Medium
- **File(s):** unit allocation `holdings_service.py:1226-1229` (`stamp_duty = round(sip_amount * 0.00005, 2); units = net_amount / nav` — floats), totals `:1270-1300`, P&L `nav_service.py:786-801`, CAS Decimal→float downcast `cas_service.py:38-43`
- **Issue:** All monetary aggregation is binary floating point; values are `round(x, 2)`-ed at various intermediate points (not just display), so error compounds differently depending on code path. casparser hands over exact `Decimal`s which are immediately downcast.
- **Impact:** Unit balances drift from CAS at the 4th decimal (units are legally significant to 3-4 decimals in India); invested totals can mismatch CAS by paise, eroding trust in a finance tool.
- **Fix:** Use `Decimal` for amounts/units in the SIP engine and CAS pipeline (quantize units to 0.0001, money to 0.01 with explicit rounding mode `ROUND_HALF_UP` matching RTA behavior); floats are fine for the *estimation* paths (market data is approximate anyway).
- **Positive note:** the stamp-duty model itself is right — 0.005% deducted before unit allocation (`holdings_service.py:1226-1228`), matching SEBI rules; the unused `_apply_stamp_duty` helper in `utils/xirr.py:212-229` uses the opposite (add-on) convention and should be deleted before someone uses it.

### 9.6 Medium — Fyers historical candles dated in server-local time, not IST
- **Severity:** Medium
- **File(s):** `backend/services/fyers_service.py:412` and `:529` (`datetime.fromtimestamp(c[0]).strftime("%Y-%m-%d")` — naive local time), compared against IST-derived target dates from `nav_service.py:562` (`get_previous_business_day` of IST today)
- **Issue:** Fyers returns epoch timestamps. On a UTC server (Render default), an NSE daily candle stamped 09:15 IST = 03:45 UTC still lands on the right calendar day — but the same pattern with any timestamp after 18:30 IST, or a server west of UTC, shifts the candle to the previous day, and the `c["date"] == target_str` match at `:447,489` silently finds nothing (or the wrong day).
- **Impact:** Historical D-1 estimation returns None (degrading to worse fallbacks) or computes the change for the wrong session, depending on hosting region — a heisenbug that only appears in deployment.
- **Fix:** `datetime.fromtimestamp(c[0], tz=pytz.timezone("Asia/Kolkata")).strftime(...)` in both helpers.

### 9.7 Low — Stale-NAV detection by float equality
- **Severity:** Low
- **File(s):** `backend/services/nav_service.py:587-593` (`if official_d0 == official_d_minus_1: … official_d0 = None`)
- **Issue:** A genuinely unchanged NAV (possible for debt/arbitrage funds on flat days) is indistinguishable from a stale API row, and float equality is the trigger.
- **Impact:** Rare false positives discard a real official NAV in favor of an estimate (note says "Estimated" instead of "Official"; value barely differs). Cosmetic, but worth a comment.
- **Fix:** Only apply the stale-row heuristic when the API's D0 row date equals D-1's value *and* the fund is equity; or compare `date` fields instead of values.

### 9.8 Low — Hardcoded NSE holiday fallback covers only 2025-2026
- **Severity:** Low
- **File(s):** `backend/utils/date_utils.py:50-64` (`_get_fallback_holidays`), used when `pandas_market_calendars` is unavailable (`:42-48`)
- **Issue:** The safety-net holiday list ends at 2026-12-25. From 2027, if the calendar library ever fails to import (it's unpinned, §2), holiday detection silently degrades to weekends-only.
- **Impact:** On a 2027 holiday, "is_trading_day" returns True → the app treats a closed market as open and interprets stale live quotes as D0 data.
- **Fix:** Log loudly when falling back; add a unit test that fails after the last hardcoded year (a "time-bomb test" forcing list refresh).

### 9.9 Low — `get_next_nav_after_date` falls back to an arbitrary latest NAV
- **Severity:** Low (mitigated by callers)
- **File(s):** `backend/services/nav_service.py:221-224` (no NAV on/after target → returns the newest NAV anyway)
- **Issue:** The function's contract is "first NAV on or after date", but the fallback returns the latest NAV regardless of date. Both current callers re-verify the returned date (`holdings_service.py:1218-1234`, `:1351-1356`), so units aren't actually mis-allocated today — but the trap is set for the next caller.
- **Impact:** Latent unit-allocation-at-wrong-NAV bug.
- **Fix:** Return `None` in the fallback case; let callers decide.

### 9.10 External data source reliability (summary)
- **Severity:** Medium (systemic)
- **File(s):** `utils/common.py:3-19` (NSE scraping endpoints with spoofed browser User-Agent + cookie bootstrap, `nav_service.py:55-68`), mfapi.in (unofficial community NAV API), yfinance (scraper), Fyers (the only contractual API, but a single shared token, §3.1)
- **Issue:** Three of the four data sources are scrapers/unofficial APIs with no SLA; NSE actively rotates anti-bot measures (the code already fights cookies and HTML-instead-of-JSON responses, `nav_service.py:87-93`). Retry logic exists (good: exponential backoff at `:81-84`, parallel + sequential retry passes) but there's no caching layer, no circuit breaker, and the per-request fan-out (§4.2-4.3) maximizes exposure.
- **Impact:** The app's correctness is hostage to scraping fragility; an NSE layout change or mfapi outage breaks core flows at runtime.
- **Fix:** Cache aggressively (NAV history is immutable; intraday quotes need only ~1-min freshness), add circuit breakers per source, and consider AMFI's official NAVAll.txt feed as the NAV source of truth instead of mfapi.in.


---

## Section 10 — Final Summary

### Category scores (out of 10)

| # | Category | Score | One-line rationale |
|---|---|---|---|
| 1 | Architecture & Code Health | 5/10 | Sound layering undermined by two dead modules, two 1,000+ line service monoliths, and copy-pasted parsing/totals logic |
| 2 | Dependencies | 3/10 | Zero pinning, no lockfile, transitive deps masquerading as direct, unmaintained auth libs (python-jose, passlib) |
| 3 | Security | 3/10 | Good crypto choices (Argon2, Pydantic input typing) wiped out by unauthenticated broker endpoints, leaked Atlas credentials in git history, and a hardcoded fallback JWT secret |
| 4 | Performance & Database | 3/10 | Blocking sync I/O on the event loop with a single worker; uncached full-history downloads per request; no DB indexes |
| 5 | Testing | 3/10 | Real XIRR/date-edge tests exist, but core P&L logic is tested only via a dead module, invariant tests are `pass` stubs, no CI, frontend untested |
| 6 | Database Schema & Migrations | 4/10 | Pydantic write-validation is good; identity-by-heuristic upserts, string dates in two formats, no unique indexes, no migrations/backups |
| 7 | Documentation & DX | 4/10 | Thorough README that is wrong: every documented endpoint, the JWT env var, and the ports don't match the code; `.env.example` is the one accurate doc |
| 8 | Logging, Monitoring & Deployment | 3/10 | Structured rotating logs exist but go to ephemeral disk; no CI/CD, no error tracking, health check checks nothing, single worker |
| 9 | Domain Logic (Financial Accuracy) | 5/10 | Thoughtful NAV decision tree, correct stamp-duty model, real XIRR implementation — but the weight-normalization bug corrupts the headline estimate and the XIRR fallback fabricates returns |

**Overall: not production-ready.** The app is an impressive solo project with genuinely sophisticated domain logic, but it currently has unauthenticated control of a brokerage integration, leaked database credentials, a server that freezes under one heavy request, and a flagship calculation (live NAV estimate) that is numerically wrong for most real funds.

### Top 10 priority issues (by business impact / security risk / dev velocity)

| # | Issue | Ref | Severity |
|---|---|---|---|
| 1 | Rotate the leaked MongoDB Atlas credentials + OpenFIGI key; scrub git history | §3.2 | Critical |
| 2 | Add auth to all `/api/fyers/*` endpoints; make the Fyers token per-user (or at minimum remove `/set-token` and `/disconnect` from public reach) | §3.1 | Critical |
| 3 | Stop blocking the event loop: make heavy routes sync-`def` (threadpool) and add a second worker | §4.1, §8.5 | Critical |
| 4 | Remove the hardcoded fallback `SECRET_KEY`; fail fast when unset; unify the env-var name (README says `JWT_SECRET`) | §3.3, §7.2 | High |
| 5 | Fix weight normalization (store fractions at ingestion; validate weights sum ≈ 100%) — the live NAV estimate is wrong for funds with sub-1% holdings | §9.1 | High |
| 6 | Cache external data (mfapi NAV history, NSE master CSV) and stop N+1 full-history downloads per P&L request | §4.2, §4.3 | High |
| 7 | Add rate limiting on `/token`, `/forgot-password`, `/parse-cas/`; make reset tokens single-use | §3.4, §3.5 | High |
| 8 | Create MongoDB indexes incl. unique on `users.username`/`users.email`; fix check-then-insert registration race | §4.4, §6.1 | High |
| 9 | Pin all dependencies (compile a locked requirements.txt); replace/pin python-jose | §2 | High |
| 10 | Stand up minimal CI (compile + unit tests + frontend build) and retire tests that target dead `nav_logic.py`; fix XIRR bisection returning -99%/1000% | §5.1, §5.2, §9.2 | High |

### Action plan

**This week (stop the bleeding — hours, not days):**
1. Rotate Atlas password + OpenFIGI key; verify no other live secrets in history; enable GitHub push protection (§3.2).
2. Add `Depends(get_current_user)` to every Fyers route; delete `/set-token`; stop returning `app_id` from `/status` (§3.1).
3. Remove the default `SECRET_KEY` fallback — raise on missing env (§3.3). Fix `README` env-var name so the next deploy doesn't reintroduce it (§7.2).
4. Change `async def` → `def` on `/analyze-portfolio`, `/upload-holdings/`, `/parse-cas/` routes (one-word change per route, moves them off the event loop) (§4.1).
5. Create the four MongoDB indexes at startup (§4.4).

**Next month (correctness + guardrails):**
1. Fix weight normalization at ingestion + weights-sum validation; add the unit test that would have caught it (§9.1).
2. Fix XIRR bisection fallback to return `None`; suppress XIRR for <30-day holdings (§9.2).
3. Add TTL caches: mfapi scheme history (15-60 min), NSE master CSV (24h, dict-keyed by ISIN) (§4.2-4.3).
4. Add `slowapi` rate limits; single-use reset tokens with a stored nonce (§3.4-3.5).
5. Pin dependencies via pip-tools/uv; swap python-jose → PyJWT; prune transitive deps from requirements (§2).
6. Minimal GitHub Actions CI gating Render/Vercel deploys; delete `nav_logic.py` + `backend/auth.py` and port/retire their tests (§5, §1.1-1.2).
7. Add Sentry; env-gate file logging; make `/ready` ping Mongo (§8.2-8.3).

**Next quarter (structural):**
1. Per-user Fyers tokens stored encrypted in Mongo; remove the singleton token file (§3.1).
2. Atomic SIP installment updates (array filters) to kill the read-modify-write race; recalc totals server-side from one source of truth (§4.5).
3. Decimal-based money/units in the SIP engine and CAS pipeline; stop downcasting casparser Decimals (§9.5, §6.6).
4. Explicit fund identity (`_id`-addressed updates instead of heuristic upserts); migration script + `schema_version` field; backup automation with one tested restore (§6.1-6.5).
5. Extract `market_data` clients + `excel_parser` + `sip_engine` from the two service monoliths; break the circular dependency (§1.3-1.4, §1.7).
6. Test the money paths: P&L decision tree, SIP state machine (implement the placeholder invariant tests), cross-tenant authorization (§5 table).

**Long-term (product hardening):**
1. Replace mfapi.in with AMFI's official NAV feed; add circuit breakers per data source; cache quotes in Redis if multi-instance (§9.10).
2. Move JWTs to httpOnly cookies + refresh tokens; add token versioning for global logout (§3.8, §3.5).
3. Async I/O throughout (httpx, asyncio) once routes are stable; horizontal scaling beyond one worker (§4.1).
4. Frontend test suite (Vitest) and decomposition of `UploadSIP.jsx`; lazy-load the three.js landing element (§1.10, §2 frontend).
5. IST-aware datetimes everywhere (replace `utcnow()`/naive `fromtimestamp`); time-bomb test for the holiday fallback list (§1.8, §9.6, §9.8).

---

*Audit complete — 2026-06-12. Sections 1-10 written across one session; see AUDIT_PROGRESS.md for the trail.*
