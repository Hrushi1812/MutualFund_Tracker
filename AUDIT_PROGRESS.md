# Audit Progress

## Status: COMPLETE

## Completed sections
- [x] 1. Architecture & Code Health
- [x] 2. Dependencies
- [x] 3. Security
- [x] 4. Performance & Database
- [x] 5. Testing
- [x] 6. Database Schema & Migrations
- [x] 7. Documentation & DX
- [x] 8. Logging, Monitoring & Deployment
- [x] 9. Domain Logic (Financial Accuracy)
- [x] 10. Final Summary

## Currently on
Done. Full report in AUDIT_REPORT.md (sections 1-10, category scores, top-10 priorities, action plan).

## Note
Session was opened in C:\Users\Arush\Desktop\Hrushi\Splitwise but the audit target is
C:\Users\Arush\Desktop\Hrushi\MutualFund_Tracker (the prompt's NAV/XIRR/mutual-fund domain
matches this repo). All paths in AUDIT_REPORT.md are relative to MutualFund_Tracker root,
line numbers as of commit 1ce1e60.

## Files reviewed in detail
- backend/app.py, db.py, auth.py (dead), core/config.py, core/logging.py
- backend/routes/auth.py, holdings.py, fyers.py, portfolio.py, schemes.py
- backend/services/auth_service.py, holdings_service.py, nav_service.py, fyers_service.py, cas_service.py, email_service.py
- backend/utils/xirr.py, date_utils.py, common.py
- backend/models/schemas.py, db_schemas.py
- backend/requirements.txt, .env.example, .dockerignore, Dockerfile, runtime.txt
- docker-compose.yml, Procfile, .gitignore, README.md
- backend/tests/test_xirr.py, test_sip_invariants.py
- frontend/package.json, src/api.js, AuthContext.jsx, PortfolioContext.jsx, Dashboard.jsx, nginx.conf
- git history: backend/.env committed at 3493cc8 (Atlas URI + OPENFIGI key), removed 813829f, still in history

## Headline findings (for quick recall)
- CRITICAL: /api/fyers/* routes unauthenticated; global shared broker token in plaintext file
- CRITICAL: Atlas credentials + OpenFIGI key retrievable from git history — rotate
- CRITICAL: blocking sync I/O inside async routes + single uvicorn worker = whole-server freeze
- HIGH: hardcoded fallback SECRET_KEY (FastAPI tutorial key) in core/config.py:12
- HIGH: weight normalization bug (nav_service, 5 sites) — sub-1% holdings overweighted up to 100x
- HIGH: XIRR bisection fallback returns -99%/+1000% instead of None (utils/xirr.py:177-184)
- HIGH: no rate limiting; reset tokens not single-use; no Mongo indexes (registration race)
- HIGH: requirements.txt fully unpinned; no CI; tests target dead nav_logic.py

## Next steps
None — audit finished. If a follow-up session is asked to act on findings, start from the
"This week" action plan in AUDIT_REPORT.md Section 10. User explicitly wanted the report only, no fixes.
