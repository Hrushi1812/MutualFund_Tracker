# Audit To-Do Tracker

Issue-by-issue checklist from `AUDIT_REPORT.md` (section numbers match). Check items off as they land on `main`.

**Status legend:** `[x]` fixed (branch noted) · `[ ]` open · ~~struck~~ = closed without fix (decision noted)

**Branches awaiting merge (stacked — merge in this order, or merge `pin-dependencies` alone to get all seven):**
1. `security-hotfixes` → 2. `unblock-event-loop` → 3. `db-indexes` → 4. `fix-xirr-fallback` → 5. `external-data-caching` → 6. `auth-hardening` → 7. `pin-dependencies`

---

## Section 1 — Architecture & Code Health

### Critical
*(none)*

### High
*(none)*

### Medium
- [x] 1.1 Dead `backend/auth.py` with broken import + wrong env var name — **deleted on `security-hotfixes`**
- [ ] 1.2 Dead `backend/nav_logic.py` (464 lines); 6 test/debug scripts still import it
- [ ] 1.3 Service monoliths: `holdings_service.py` (1,400 lines), `calculate_pnl` (~340 lines) — extract market_data / excel_parser / sip_engine
- [ ] 1.5 Flask-style `return {"error": ...}, 404` in `routes/holdings.py:21` returns HTTP 200 with an array body
- [ ] 1.6 `/upload-holdings/` has ~18 untyped string Form fields, bare `except:` blocks silently zeroing money fields
- [ ] 1.7 Duplicated Excel-parsing and SIP-totals logic between upload paths
- [ ] 1.10 Frontend mega-components (`UploadSIP.jsx` 1,185 lines; `UploadLumpsum`, `PortfolioAnalyzer`)

### Low
- [ ] 1.4 Circular dependency between nav_service and holdings_service patched with function-local imports
- [ ] 1.8 Deprecated APIs: `@app.on_event`, `datetime.utcnow()`, Pydantic v1 `.dict()`
- [ ] 1.9 DB connects at import time, no retry; `print()` with emojis instead of logger (crashes on cp1252 consoles — confirmed during this work)
- [ ] 1.11 `last_updated: bool` legacy field; `created_at` doubles as holdings-freshness timestamp

---

## Section 2 — Dependencies

### High
- [x] 2.A Backend `requirements.txt` fully unpinned, no lockfile — **rewritten as curated direct deps, each pinned to the verified-working version, on `pin-dependencies`** *(future: pip-tools/uv for a full transitive lock)*
- [x] 2.B Replace unmaintained `python-jose` with `PyJWT` — **swapped on `pin-dependencies`; verified encode/decode round-trip + tampered-token rejection**
- [x] 2.C `yfinance` unpinned and scraping-based — **pinned (==1.0) on `pin-dependencies`; still best-effort**

### Medium
- [ ] 2.D Migrate off unmaintained `passlib` to `argon2-cffi` directly (breaks on Python ≥3.13) — *still using passlib[argon2], now pinned*
- [x] 2.E Pin `casparser`, `pandas`, `numpy`, `fyers-apiv3`, `pymongo` — **all pinned on `pin-dependencies`**

### Low
- [x] 2.F Remove ~18 transitive deps listed as direct in requirements.txt — **pruned on `pin-dependencies`**
- [ ] 2.G Lazy-load the three.js landing element so dashboard users don't download 3D libs

---

## Section 3 — Security

### Critical
- [x] 3.1 Fyers routes unauthenticated; `/set-token` let anyone plant a broker token — **auth added to all routes, `/set-token` deleted, `app_id` removed from `/status`, on `security-hotfixes`** *(remaining Medium follow-up: per-user Fyers tokens instead of one global token file — tracked as 3.1b below)*
- ~~3.2 Leaked Atlas credentials + OpenFIGI key in git history~~ — **closed without fix (user decision 2026-06-13: accepted risk, no rotation/history scrub)**

### High
- [x] 3.3 Hardcoded fallback `SECRET_KEY` (FastAPI tutorial key) — **removed; app now refuses to start without env var, on `security-hotfixes`**
- [x] 3.4 No rate limiting — **slowapi added: /token & /register 5/min, /forgot-password 3/min, /reset-password 5/min, /parse-cas 2/min, on `auth-hardening`**
- [x] 3.5 Reset tokens replayable, reset-token-as-access-token edge — **single-use jti tokens + `type: access` claim check, on `auth-hardening`**

### Medium
- [ ] 3.1b Per-user Fyers tokens stored encrypted in Mongo (today: one shared plaintext token file for all users)
- [ ] 3.6 Account enumeration via `/register` (distinct username/email-exists errors)
- [ ] 3.7 Raw exception strings returned to clients (`parse-cas` 500s, `update_holdings_only`, `handle_sip_action`)
- [ ] 3.8 JWT in localStorage; no axios 401 interceptor (expired sessions fail silently)
- [ ] 3.9 docker-compose Mongo has no auth, port 27017 published to host, `mongo:latest`
- [ ] 3.10 Backend container runs as root; add USER directive + extend .dockerignore

### Low
- [ ] 3.11 PII (emails/usernames) logged at INFO/WARNING into app.log
- [x] 3.12 `/set-token` took the broker token as a query parameter — **endpoint deleted on `security-hotfixes`**

---

## Section 4 — Performance & Database

### Critical
- [x] 4.1 Blocking sync I/O inside `async def` routes froze the whole server — **heavy routes converted to threadpool-run `def`, on `unblock-event-loop`**

### High
- [x] 4.2 mfapi full NAV history re-downloaded N+2 times per P&L request — **15-min TTL cache + retry/backoff, on `external-data-caching`**
- [x] 4.3 NSE master CSV re-downloaded per upload, O(N×M) linear ISIN scans — **24h-TTL ISIN→symbol dict, on `external-data-caching`**
- [x] 4.4 No MongoDB indexes; registration check-then-insert race — **unique indexes on users.username/email + holdings.user_id at startup, DuplicateKeyError backstop, on `db-indexes`** *(verified live DB had no pre-existing duplicates: 8 users, clean)*

### Medium
- [ ] 4.5 Read-modify-write race on `sip_installments` (whole-array `$set`; lost updates) — use array-filter atomic updates
- [ ] 4.6 Per-stock sequential Fyers historical calls — parallelize in bounded threadpool + cache per (symbol, date)

### Low
- [ ] 4.7 Multiple independent frontend polling loops (ServerWakeUp, FyersBanner, FyersConnectionCard)

---

## Section 5 — Testing  *(DEFERRED — user decision 2026-06-13: will implement in future)*

### High
- [ ] 5.1 Six test/verify scripts test dead `nav_logic.py` instead of live `nav_service`
- [ ] 5.2 No CI, no pytest config; network-dependent tests mixed with hermetic ones
- [ ] 5.3 Pre-existing failure in `tests/test_fund_validation.py`: its mocked DataFrame predates current header-detection logic (fails identically on old code; patch targets updated to `load_nse_isin_map` on `external-data-caching` so it at least imports)
- [ ] 5.4 Empty placeholder tests in `test_sip_invariants.py` (state-machine invariants are `pass` stubs)
- [ ] 5.5 Zero coverage on: P&L decision tree, auth flows, cross-tenant authorization, frontend (no test runner installed)

---

## Section 6 — Database Schema & Migrations

### High
- [x] 6.1a Registration race (no unique constraints on users) — **fixed via unique indexes on `db-indexes`**
- [ ] 6.1b Fund identity is a heuristic upsert key (`fund_name + user_id + invested_date + type`); same-day SIPs silently overwrite — move to `_id`-addressed updates

### Medium
- [ ] 6.2 No migration mechanism / `schema_version`; reads are raw dicts with per-call-site fallbacks
- [ ] 6.3 Dates stored as `DD-MM-YYYY` strings; API contract disagrees between endpoints (`YYYY-MM-DD` in schemas.py vs `DD-MM-YYYY` in holdings route)
- [ ] 6.4 `users.uploads` mirror array is written but never read; drifts from holdings — delete it
- [ ] 6.5 No backup/restore story (Atlas tier snapshots not documented; no mongodump automation)

### Low
- [ ] 6.6 Money/units stored as IEEE-754 doubles; CAS Decimals downcast to float

---

## Section 7 — Documentation & DX

### Medium
- [ ] 7.1 README endpoint table documents an API that doesn't exist (every path wrong)
- [x] 7.2a README said `JWT_SECRET`; app reads `SECRET_KEY` — **fixed on `security-hotfixes`**
- [ ] 7.2b README ports (8000/3000) disagree with docker-compose (8001/5174)

### Low
- [ ] 7.3 Stale architecture tree in README (lists nav_logic.py as live, omits core/, utils/, cas/email services); NAV decision tree undocumented
- [ ] 7.4 Frontend README is Vite boilerplate; prod build silently falls back to localhost API when `VITE_API_URL` unset

---

## Section 8 — Logging, Monitoring & Deployment

### High
- [ ] 8.1 No CI/CD pipeline; pushes to main auto-deploy unchecked *(DEFERRED — user decision 2026-06-13: will implement in future)*

### Medium
- [ ] 8.2 File logging to ephemeral disk on Render; no Sentry/error tracking; no alerting on critical startup logs
- [ ] 8.3 `/health` returns ok unconditionally — add `/ready` that pings Mongo
- [ ] 8.4 `mongo:latest` unpinned; no restart policies or healthchecks in docker-compose
- [x] 8.5 Single uvicorn worker — **`--workers 2` in Procfile + Dockerfile, on `unblock-event-loop`** *(watch Render free-tier RAM; drop to 1 worker if OOM — the threadpool fix alone removes the freeze)*

### Low
- [ ] 8.6 `print()` in db.py (crashes on cp1252 consoles); dev-mode email prints reset URLs — gate on IS_PRODUCTION, fail loudly in prod when Brevo unconfigured

---

## Section 9 — Domain Logic (Financial Accuracy)

### High
- ~~9.1 Weight-normalization heuristic (`wt > 1 → /100`) misweights sub-1% holdings~~ — **closed without fix (user decision 2026-06-13: reviewed, existing math confirmed correct and working for live data)**
- [x] 9.2 XIRR bisection fallback fabricated -99%/+1000% returns — **returns None; XIRR also suppressed for holdings <30 days, on `fix-xirr-fallback`**

### Medium
- [ ] 9.3 Simple-mode SIP XIRR synthesizes past months at today's `sip_amount` (ignores step-up history/CAS amounts) — label as estimate or distribute manual amount
- [ ] 9.4 Lumpsum purchase NAV silently falls back to *today's* NAV when historical fetch fails (P&L shows ≈0 with no flag)
- [ ] 9.5 Float arithmetic for money/units end-to-end; CAS Decimals downcast — move SIP engine + CAS pipeline to Decimal *(dead wrong-convention `_apply_stamp_duty` helper already deleted on `fix-xirr-fallback`)*
- [ ] 9.6 Fyers candles dated with naive `fromtimestamp` (server-local TZ, not IST) — wrong-day matches on non-IST hosts
- [ ] 9.10 External-source resilience: circuit breakers per source; consider AMFI official NAV feed over mfapi.in *(caching half done on `external-data-caching`)*

### Low
- [ ] 9.7 Stale-D0-NAV detection uses float equality (false positives on genuinely flat NAVs)
- [ ] 9.8 Hardcoded NSE holiday fallback list ends 2026 — silent degradation from 2027 if calendar lib unavailable
- [ ] 9.9 `get_next_nav_after_date` falls back to latest NAV regardless of date (contract trap; current callers re-verify)

---

## Summary

| Severity | Total | Fixed | Closed (decision) | Open |
|---|---|---|---|---|
| Critical | 3 | 2 | 1 (3.2) | 0 |
| High | 19 | 11 | 1 (9.1) | 7 (5.1–5.5 testing + 6.1b + 8.1 CI — all deferred/future) |
| Medium | 24 | 4 | 0 | 20 |
| Low | 13 | 2 | 0 | 11 |

*Fixed counts include items sitting on the seven unmerged branches listed at the top. All Critical findings are resolved (2 fixed, 1 accepted by decision). Remaining open High items are the deferred Section 5 (testing) and 8.1 (CI), plus 6.1b (fund-identity upsert).*

*Deploy notes: the app now refuses to boot without `SECRET_KEY` set in the Render environment (it already is, if the app runs today). All users get logged out once on deploy (access tokens now carry a `type` claim); they just log in again. `requirements.txt` is now fully pinned — a clean `pip install -r requirements.txt` reproduces the verified set.*
