# Logic Verification & Improvement Plan

## Verification of Current Logic

The core formula used in `nav_logic.py` is:
$$ \text{Estimated NAV} = \text{Prev NAV} \times (1 + \sum (\text{Weight} \times \text{Stock Change \%})) $$

**Verdict**: The mathematical approximation for *daily change* is **correct**, assuming:
1.  **Weights Sum to 100%**: If the Excel only lists equity (e.g. 95%), the remaining 5% (Cash/Debt) is implicitly treated as having 0% change. This is a safe assumption for intraday estimation.
2.  **Prev NAV is Yesterday's NAV**: To estimate *today's* NAV, `prev_nav` must be the official NAV from yesterday.

## Identified Gaps & Improvements

### 1. Critical: Symbol Mapping (ISIN vs Ticker)
- **Current**: Assumes the Excel file has a column `Symbol` that matches Yahoo Finance tickers (e.g., `RELIANCE.NS`).
- **Reality**: AMC Excel files usually contain **ISIN** (e.g., `INE002A01018`) or **Security Name**. They do *not* have Yahoo tickers.
- **Fix**: We need a mapping system.
    - **Option A**: Use an API to search/resolve ISIN to Ticker.
    - **Option B**: Maintain a local JSON/DB mapping `ISIN -> Yahoo Ticker`.

### 2. Historical NAV Fetching
- **Current**: User manually inputs `prev_nav`. This is error-prone.
- **Requirement**: "Fetch NAV at investment date" and "Fetch recent NAV".
- **Fix**: Integrate an API like `https://api.mfapi.in/mf/{scheme_code}` to:
    - Get NAV on "Investment Date" (to calculate Since Inception P&L).
    - Get NAV of "Yesterday" (to calculate Today's Est. NAV).

### 3. Performance: Sequential vs Batch API
- **Current**: Loops through every stock and calls `yf.download`.
    - 50 stocks = 50 seconds (due to `time.sleep`).
- **Fix**: **Vectorize.** Download all symbols in ONE request: `yf.download("TICK1 TICK2 ...")`.
    - Reduces time from ~60s to ~2s.

### 4. Input Handling
- **Current**: User inputs `prev_nav` directly.
- **Requirement**: User inputs `Investment Date` and `Amount`.
- **Fix**:
    - Frontend: Accept Date picker.
    - Backend: Lookup NAV for that date from MF API.

## Proposed New Workflow

1.  **Upload**: User uploads Excel -> Parse ISIN/Names -> **Map to Tickers** (autofill or ask user for missing ones) -> Save to DB.
2.  **Estimate**:
    - Fetch Portfolio from DB.
    - Fetch **Market Data** (Batch download from Yahoo).
    - Fetch **Official NAV History** (from MFAPI.in).
    - Calculate:
        - `NAV_yesterday` (Official)
        - `NAV_today_est` = `NAV_yesterday` * (1 + PortfolioChange).
        - `NAV_invest` = NAV on Investment Date.
        - `P&L` = (Units * NAV_today_est) - Invested_Amount.

## Immediate Action Items
1.  [ ] **Batch Fetching**: Refactor `nav_logic.py` to use `yf.download(tickers)`.
2.  [ ] **MF API Integration**: Add function to get NAV history.
3.  [ ] **Symbol Mapping**: Add a mapping step (or valid placeholder) for ISIN->Ticker.
