# Refined Implementation Plan: Persistent Daily Tracker

The goal is to enable a workflow where the user uploads holdings **once a month**, and then simply checks the app daily for real-time P&L usage without re-uploading.

## Workflow Updates

### 1. One-Time Setup (Monthly)
- **Action**: User uploads AMC Excel sheet.
- **System**:
    1.  Parses Excel (ISIN, Name, % Weight).
    2.  **Mapping Step**: converts ISIN -> Yahoo Ticker (e.g., `INE002A01018` -> `RELIANCE.NS`).
        - *Crucial*: This mapping must be stored so we don't resolve it every day.
    3.  **Storage**: Saves this structured data to MongoDB under the `fund_name`.

### 2. Daily Usage (Instant)
- **Action**: User opens app (no upload needed).
- **System**:
    1.  **Fetch Context**: Gets stored holdings (tickers & weights) from DB.
    2.  **Fetch Base NAV**: Calls `MFAPI.in` to get the *official* NAV of the previous closing day.
    3.  **Fetch Live Prices**: Batch downloads current prices for all tickers from Yahoo Finance.
    4.  **Calculate**: Applies today's price changes to the weights -> estimates *Today's* NAV.

## Required Code Changes

### Backend (`backend/`)
-   **`db.py`**: Ensure schema supports storing `ticker` alongside ISIN.
-   **`nav_logic.py`**:
    -   `save_holdings_to_mongo`: Add a step to map ISINs to Tickers (will use a hardcoded map or search algorithm for now).
    -   `estimate_nav`:
        -   Remove `prev_nav` argument (fetch it automatically).
        -   Use `yfinance` **batch download** for speed.
        -   Add `fetch_daily_nav(scheme_code)` to get the base NAV.

### Frontend (`frontend/`)
-   **`UploadHoldings.jsx`**: Remain as "Monthly Setup".
-   **`NavEstimator.jsx`**:
    -   Remove `prev_nav` input.
    -   Add `Scheme Code` input (to fetch official NAV) or store it with the fund.
    -   Add `Investment Date` input (to fetch historical NAV for total P&L).

## Verification
-   Verify that one upload allows multiple subsequent estimations.
-   Verify speed improvement (batching).
-   Verify accuracy of "Yesterday's NAV" fetch.
