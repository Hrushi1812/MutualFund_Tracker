from datetime import datetime, date, timedelta
import time
import requests
from services.holdings_service import holdings_service, session
from services.fyers_service import fyers_service
from utils.date_utils import (
    is_market_open,
    get_current_ist_time,
    is_trading_day,
    get_previous_business_day,
    format_date_for_api,
    parse_date_from_str,
    MARKET_OPEN_TIME,
)
from utils.common import NSE_API_URL, NSE_BASE_URL
from utils.xirr import calculate_sip_xirr
from core.logging import get_logger

logger = get_logger("NavService")


class NavService:
    # ==================== FYERS-BASED METHODS (PRIMARY) ====================
    
    @staticmethod
    def get_live_price_change_fyers(symbol):
        """
        Fetches live P-Change using Fyers API.
        Returns float (e.g., 1.25 for +1.25%) or None.
        """
        if not fyers_service.is_authenticated():
            logger.debug(f"Fyers not authenticated, falling back to NSE for {symbol}")
            return NavService.get_live_price_change_nse(symbol)
        
        try:
            pct = fyers_service.get_quote_pct_change(symbol)
            if pct is not None:
                return float(pct)
        except Exception as e:
            logger.debug(f"Fyers quote failed for {symbol}: {e}")
        
        # Fallback to NSE
        return NavService.get_live_price_change_nse(symbol)

    @staticmethod
    def get_live_price_change(symbol, max_retries=3):
        """
        Primary method: Uses Fyers if authenticated, falls back to NSE scraping.
        """
        return NavService.get_live_price_change_fyers(symbol)

    # ==================== NSE FALLBACK METHODS ====================

    @staticmethod
    def ensure_nse_cookies():
        """Ensures that the session has valid cookies from NSE home page."""
        if not session.cookies.get("nsit"):  # Check for a specific NSE cookie if possible, or just length
             # If no cookies, or we want to be safe, visit home
             try:
                 # Check if we already have some cookies
                 if len(session.cookies) > 0:
                     return

                 logger.info("Initializing NSE cookies (visiting home page)...")
                 # User-Agent is already in headers
                 session.get(NSE_BASE_URL, timeout=10)
             except Exception as e:
                 logger.error(f"Failed to initialize NSE cookies: {e}")

    @staticmethod
    def get_live_price_change_nse(symbol, max_retries=3):
        """Fetches live P-Change from NSE for a symbol (FALLBACK method).
        Includes retry logic with exponential backoff for robustness.
        """
        for attempt in range(max_retries):
            try:
                r = session.get(NSE_API_URL, params={"symbol": symbol}, timeout=10)
                content_type = r.headers.get("Content-Type", "")
                
                # Handle rate limiting (429) or server errors (5xx)
                if r.status_code == 429 or r.status_code >= 500:
                    wait_time = (attempt + 1) * 2  # 2s, 4s, 6s
                    logger.debug(f"NSE rate limit/error for {symbol}, retry {attempt+1} after {wait_time}s")
                    time.sleep(wait_time)
                    continue
                    
                if "application/json" not in content_type:
                    # Sometimes NSE returns HTML on overload, retry
                    if attempt < max_retries - 1:
                        time.sleep(1)
                        continue
                    logger.debug(f"NSE returned non-json for {symbol}: {content_type}")
                    return None
                    
                data = r.json()
                # defensive access
                price_info = data.get("priceInfo") or {}
                p_change = price_info.get("pChange")
                return float(p_change) if p_change is not None else None
                
            except requests.exceptions.Timeout:
                if attempt < max_retries - 1:
                    logger.debug(f"Timeout for {symbol}, retry {attempt+1}")
                    time.sleep(1)
                    continue
                logger.debug(f"get_live_price_change_nse({symbol}) timed out after {max_retries} attempts")
                return None
            except Exception as e:
                if attempt < max_retries - 1:
                    time.sleep(0.5)
                    continue
                logger.debug(f"get_live_price_change_nse({symbol}) failed: {e}")
                return None
        return None

    @staticmethod
    def get_latest_nav(scheme_code, limit=1):
        """
        Returns a list of latest NAV entries (newest first).
        Each entry: {"date": "DD-MM-YYYY", "nav": float, "meta": ...}
        Always returns a list (empty if none).
        """
        try:
            url = f"https://api.mfapi.in/mf/{scheme_code}"
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "SUCCESS":
                    nav_data = data.get("data") or []
                    if nav_data:
                        # nav_data is usually newest-first; slice defensively
                        recent = nav_data[:limit]
                        results = []
                        for item in recent:
                            try:
                                results.append(
                                    {
                                        "date": item["date"],
                                        "nav": float(item["nav"]),
                                        "meta": data.get("meta"),
                                    }
                                )
                            except Exception:
                                continue
                        return results
        except Exception as e:
            logger.error(f"Error fetching NAV for {scheme_code}: {e}")
        return []

    @staticmethod
    def get_nav_at_date(scheme_code, target_date_str):
        """
        Robustly finds NAV for a target date (DD-MM-YYYY / YYYY-MM-DD / DD/MM/YYYY).
        If the exact date is missing, it finds the nearest previous NAV.
        Returns (nav_float, nav_date_str) or None.
        """
        try:
            url = f"https://api.mfapi.in/mf/{scheme_code}"
            response = requests.get(url, timeout=5)
            if response.status_code != 200:
                return None

            data = response.json()
            if data.get("status") != "SUCCESS":
                return None

            target_date = parse_date_from_str(target_date_str).date()
            nav_data = data.get("data") or []

            # iterate through nav_data (assumed newest-first); find first entry <= target_date
            for entry in nav_data:
                try:
                    entry_date = datetime.strptime(entry["date"], "%d-%m-%Y").date()
                    if entry_date <= target_date:
                        return (float(entry["nav"]), entry["date"])
                except Exception:
                    continue
        except Exception as e:
            logger.error(f"Error fetching historical NAV for {scheme_code} date {target_date_str}: {e}")
        return None

    @staticmethod
    def get_next_nav_after_date(scheme_code, target_date_str):
        """
        Finds the first official NAV on or after the target date.
        This is used for SIP unit calculation - units are allocated based on 
        the NAV of the investment date (or next business day if market was closed).
        
        Returns (nav_float, nav_date_str) or None.
        """
        try:
            url = f"https://api.mfapi.in/mf/{scheme_code}"
            response = requests.get(url, timeout=5)
            if response.status_code != 200:
                return None

            data = response.json()
            if data.get("status") != "SUCCESS":
                return None

            target_date = parse_date_from_str(target_date_str).date()
            nav_data = data.get("data") or []

            # nav_data is newest-first, so we need to find the earliest entry >= target_date
            # We'll collect all entries >= target_date, then take the oldest one (smallest date)
            candidates = []
            for entry in nav_data:
                try:
                    entry_date = datetime.strptime(entry["date"], "%d-%m-%Y").date()
                    if entry_date >= target_date:
                        candidates.append((entry_date, float(entry["nav"]), entry["date"]))
                except Exception:
                    continue
            
            if candidates:
                # Sort by date ascending and take the first (oldest/earliest)
                candidates.sort(key=lambda x: x[0])
                _, nav, nav_date_str = candidates[0]
                return (nav, nav_date_str)
            
            # If no NAV on or after target_date, fall back to latest available
            if nav_data:
                latest = nav_data[0]
                return (float(latest["nav"]), latest["date"])
                
        except Exception as e:
            logger.error(f"Error fetching next NAV for {scheme_code} date {target_date_str}: {e}")
        return None

    @staticmethod
    def calculate_portfolio_change(holdings):
        """
        Calculates the weighted average percent change (intraday live) of the portfolio.
        Uses Fyers bulk quotes if authenticated, falls back to parallel NSE fetching.
        
        Returns weighted pct change (e.g., 1.23 for +1.23%) or None if insufficient coverage.
        """
        import concurrent.futures

        total_prod = 0.0
        total_wt = 0.0
        stocks_checked = 0

        # Filter valid stocks first
        valid_stocks = [s for s in holdings if s.get("Symbol") and s.get("Weight", 0) > 0]
        total_stocks = len(valid_stocks)
        if total_stocks == 0:
            return None

        logger.info(f"Starting live price fetch for {total_stocks} stocks...")
        start_time = time.time()

        # ============ TRY FYERS BULK QUOTES FIRST ============
        if fyers_service.is_authenticated():
            logger.info("Using Fyers API for bulk quotes...")
            symbols = [s.get("Symbol") for s in valid_stocks]
            pct_changes = fyers_service.get_bulk_quotes_pct_change(symbols)
            
            for stock in valid_stocks:
                sym = stock.get("Symbol")
                wt = float(stock.get("Weight", 0) or 0)
                if wt > 1:
                    wt = wt / 100.0
                
                pct = pct_changes.get(sym)
                if pct is not None:
                    total_prod += (wt * pct)
                    total_wt += wt
                    stocks_checked += 1

            duration = time.time() - start_time
            logger.info(f"Fyers bulk fetch completed in {duration:.2f}s. Valid: {stocks_checked}/{total_stocks}, Coverage: {total_wt*100:.1f}%")

            if total_wt >= 0.75:
                return total_prod / total_wt
            else:
                logger.warning(f"Insufficient Fyers coverage ({total_wt*100:.1f}% < 75%), trying NSE fallback...")

        # ============ FALLBACK TO NSE SCRAPING ============
        logger.info("Using NSE scraping fallback...")
        total_prod = 0.0
        total_wt = 0.0
        stocks_checked = 0

        # NSE fallback can only handle plain NSE symbols (no exchange prefix)
        valid_stocks = [s for s in valid_stocks if ":" not in (s.get("Symbol") or "")]
        total_stocks = len(valid_stocks)
        if total_stocks == 0:
            return None
        
        # Ensure we have cookies before starting parallel requests
        NavService.ensure_nse_cookies()
        
        # Track results and failures for retry
        results = {}  # symbol -> (weight, pct_change)
        failed_stocks = []

        def fetch_price(stock):
            sym = stock.get("Symbol")
            # normalize weight to fraction
            wt = float(stock.get("Weight", 0) or 0)
            if wt > 1:
                wt = wt / 100.0
            pct = NavService.get_live_price_change_nse(sym)
            return (sym, wt, pct)

        # PASS 1: Parallel fetch with reduced concurrency to avoid rate limiting
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            future_to_stock = {executor.submit(fetch_price, stock): stock for stock in valid_stocks}
            for future in concurrent.futures.as_completed(future_to_stock):
                stock = future_to_stock[future]
                try:
                    sym, wt, pct = future.result()
                    if pct is not None:
                        results[sym] = (wt, pct)
                        total_prod += (wt * pct)
                        total_wt += wt
                        stocks_checked += 1
                    else:
                        failed_stocks.append(stock)
                except Exception as exc:
                    logger.debug(f"Stock fetch exception for {stock.get('Symbol')}: {exc}")
                    failed_stocks.append(stock)

        # PASS 2: Sequential retry for failed stocks with delay between requests
        if failed_stocks:
            logger.info(f"Retrying {len(failed_stocks)} failed stocks sequentially...")
            for stock in failed_stocks:
                sym = stock.get("Symbol")
                wt = float(stock.get("Weight", 0) or 0)
                if wt > 1:
                    wt = wt / 100.0
                
                # Small delay to avoid rate limiting
                time.sleep(0.3)
                
                # Retry with fresh cookie refresh if many failures
                if len(failed_stocks) > 20 and failed_stocks.index(stock) == 0:
                    try:
                        session.cookies.clear()
                        session.get(NSE_BASE_URL, timeout=10)
                    except Exception:
                        pass
                
                pct = NavService.get_live_price_change_nse(sym, max_retries=2)
                if pct is not None:
                    results[sym] = (wt, pct)
                    total_prod += (wt * pct)
                    total_wt += wt
                    stocks_checked += 1

        duration = time.time() - start_time
        logger.info(f"NSE fetch completed in {duration:.2f}s. Valid: {stocks_checked}/{total_stocks}, Coverage: {total_wt*100:.1f}%")

        # require at least 75% of portfolio weight coverage for reliable estimation
        if total_wt >= 0.75:
            # normalized weighted average percent change
            return total_prod / total_wt
        else:
            logger.warning(f"Insufficient coverage ({total_wt*100:.1f}% < 75%), skipping D0 estimation")
        return None

    @staticmethod
    def ensure_yf_symbol(sym):
        """Ensure a yfinance-friendly ticker (adds .NS if missing and symbol likely NSE)."""
        if sym.upper().endswith(".NS") or sym.upper().endswith(".BO"):
            return sym
        return f"{sym}.NS"

    @staticmethod
    def get_historical_portfolio_change(holdings, target_date):
        """
        Calculates weighted average percent change for a specific historical date (target_date - a date object).
        Uses Fyers if authenticated, falls back to yfinance.
        Returns weighted pct (e.g., 1.23 for +1.23%) or None if insufficient coverage.
        """
        valid_stocks = [s for s in holdings if s.get("Symbol") and s.get("Weight", 0) > 0]
        if not valid_stocks:
            return None

        # ============ TRY FYERS FIRST ============
        if fyers_service.is_authenticated():
            logger.info(f"Using Fyers for historical data on {target_date}...")
            total_prod = 0.0
            total_wt = 0.0
            stocks_checked = 0

            # Convert target_date to datetime if needed
            if isinstance(target_date, date) and not isinstance(target_date, datetime):
                target_dt = datetime.combine(target_date, datetime.min.time())
            else:
                target_dt = target_date

            for stock in valid_stocks:
                sym = stock["Symbol"]
                wt = float(stock.get("Weight", 0) or 0)
                if wt > 1:
                    wt = wt / 100.0

                pct = fyers_service.get_historical_pct_change(sym, target_dt)
                if pct is not None:
                    total_prod += wt * pct
                    total_wt += wt
                    stocks_checked += 1

            logger.info(f"Fyers historical fetch complete. Valid: {stocks_checked}/{len(valid_stocks)}, Coverage: {total_wt*100:.1f}%")

            if total_wt >= 0.75:
                return total_prod / total_wt
            else:
                logger.warning(f"Insufficient Fyers historical coverage ({total_wt*100:.1f}% < 75%), trying yfinance fallback...")

        # ============ FALLBACK TO YFINANCE ============
        return NavService._get_historical_portfolio_change_yfinance(holdings, target_date)

    @staticmethod
    def _get_historical_portfolio_change_yfinance(holdings, target_date):
        """
        FALLBACK: Uses yfinance to fetch historical close prices.
        """
        import os
        from pathlib import Path
        import yfinance as yf
        import pandas as pd

        # yfinance may fail to initialise its default Windows cache dir if a file exists
        # where it expects a folder (e.g. %LOCALAPPDATA%\py-yfinance). Point it to a
        # project-local, writable directory to avoid noisy logs.
        try:
            cache_dir = Path(__file__).resolve().parents[1] / "logs" / "py-yfinance"
            cache_dir.mkdir(parents=True, exist_ok=True)
            yf.set_tz_cache_location(str(cache_dir))
        except Exception:
            pass

        valid_stocks = [s for s in holdings if s.get("Symbol") and s.get("Weight", 0) > 0]
        if not valid_stocks:
            return None

        # Prepare tickers
        tickers_map = {}
        for s in valid_stocks:
            sym = s["Symbol"]
            yf_sym = NavService.ensure_yf_symbol(sym)
            tickers_map[sym] = yf_sym
        tickers_list = list(set(tickers_map.values()))

        try:
            # Fetch small window around target_date to get close[t-1] and close[t]
            start_date = target_date - timedelta(days=7)
            end_date = target_date + timedelta(days=2)  # yfinance end is exclusive, be generous
            logger.info(f"Fetching historical data for {len(tickers_list)} stocks via yfinance between {start_date} and {end_date}")

            data = yf.download(tickers_list, start=start_date, end=end_date, progress=False, threads=True, group_by='column')
            if data is None or data.empty:
                logger.warning("yfinance returned empty data")
                return None

            # 'Close' may be a DataFrame or a MultiIndex DataFrame depending on tickers count
            if "Close" in data:
                close_df = data["Close"]
            else:
                # data itself might be a simple DataFrame of Close if one ticker
                close_df = data

            # Ensure index is datetime
            close_df.index = pd.to_datetime(close_df.index)

            # Calculate percent change per ticker: (Close[t] - Close[t-1]) / Close[t-1] * 100
            pct_df = close_df.pct_change() * 100

            # Normalize target_date to date
            if isinstance(target_date, str):
                t_date = pd.to_datetime(target_date).date()
            else:
                t_date = target_date

            # Find index row that matches target_date
            idx_loc = None
            for idx in pct_df.index:
                if idx.date() == t_date:
                    idx_loc = idx
                    break

            if idx_loc is None:
                logger.warning(f"No yfinance pct row found for target date {t_date}")
                return None

            total_prod = 0.0
            total_wt = 0.0
            stocks_checked = 0

            for stock in valid_stocks:
                sym = stock["Symbol"]
                wt = float(stock.get("Weight", 0) or 0)
                if wt > 1:
                    wt = wt / 100.0

                yf_sym = tickers_map.get(sym)
                # column names may be just yf_sym or a tuple depending on df shape; handle simple case
                if yf_sym in pct_df.columns:
                    val = pct_df.loc[idx_loc, yf_sym]
                else:
                    # try uppercase fallback
                    found_col = next((c for c in pct_df.columns if str(c).upper() == yf_sym.upper()), None)
                    val = pct_df.loc[idx_loc, found_col] if found_col is not None else None

                if val is not None and not pd.isna(val):
                    total_prod += wt * float(val)
                    total_wt += wt
                    stocks_checked += 1

            logger.info(f"yfinance historical fetch complete. Valid: {stocks_checked}/{len(valid_stocks)}, Coverage: {total_wt*100:.1f}%")

            # require at least 75% of portfolio weight coverage for reliable estimation
            if total_wt >= 0.75:
                return total_prod / total_wt
            else:
                logger.warning(f"Insufficient coverage ({total_wt*100:.1f}% < 75%), skipping D-1 estimation")
        except Exception as e:
            logger.error(f"yfinance history fetch failed: {e}")

        return None

    @staticmethod
    def calculate_pnl(fund_id, user_id, investment=None, input_date=None):
        """
        Main entry: returns NAV, units, PnL, day PnL etc using the robust decision tree:
         - Prefer Official D0
         - Else Estimate D0 if we have D0 prices (live)
         - Else Use Official D-1
         - Else Estimate D-1 using historical closes
         - Else fallback to D-2...
        """
        doc = holdings_service.get_holdings(fund_id, user_id)
        if not doc:
            return {"error": "Fund not found."}

        # Get stale info for the response
        stale_info = holdings_service._get_stale_info(doc.get("created_at"))

        # Sync SIP installments (adds new PENDING installments for current month if needed)
        # This ensures the user is prompted about new month's SIP if the day has passed
        investment_type = doc.get("investment_type", "lumpsum")
        if investment_type == "sip":
            synced = holdings_service.sync_sip_installments(fund_id, user_id)
            if synced:
                # Re-fetch document to get updated installments
                doc = holdings_service.get_holdings(fund_id, user_id)

        fund_name = doc.get("fund_name", "Unknown Fund")
        scheme_code = doc.get("scheme_code")
        if not scheme_code:
            return {"error": "Scheme Code missing for this fund."}

        # --- dates setup ---
        now = get_current_ist_time()
        d0_date = now.date()
        d0_str = format_date_for_api(d0_date)

        d_minus_1_date = get_previous_business_day(d0_date)
        d_minus_1_str = format_date_for_api(d_minus_1_date)

        d_minus_2_date = get_previous_business_day(d_minus_1_date)
        d_minus_2_str = format_date_for_api(d_minus_2_date)

        d_minus_3_date = get_previous_business_day(d_minus_2_date)
        d_minus_3_str = format_date_for_api(d_minus_3_date)

        # --- fetch official nav history ---
        recent_navs = NavService.get_latest_nav(scheme_code, limit=10)  # always list
        nav_map = {item["date"]: float(item["nav"]) for item in recent_navs} if recent_navs else {}

        official_d0 = nav_map.get(d0_str)
        official_d_minus_1 = nav_map.get(d_minus_1_str)
        official_d_minus_2 = nav_map.get(d_minus_2_str)
        official_d_minus_3 = nav_map.get(d_minus_3_str)

        # --- Determine if live data should be considered D0 or D-1 ---
        # We'll interpret live "D0" data only when:
        # 1. Today is a valid trading day (not weekend/holiday)
        # 2. Market has already opened (current time >= MARKET_OPEN_TIME)
        # If it's a trading day but before market open, live API might return old data or zeros, so we stick to D-1.
        # If it's a weekend/holiday, live API returns previous trading day's close, so it does NOT belong to "Today" (D0).
        
        # FIX: Check for stale D0 NAV (same as D-1) during market hours
        # This happens when API returns a "today" row but value hasn't updated from yesterday yet.
        if is_trading_day(now) and now.time() >= MARKET_OPEN_TIME:
             if official_d0 is not None and official_d_minus_1 is not None:
                 if official_d0 == official_d_minus_1:
                     logger.info(f"Detected stale D0 NAV for {scheme_code}: D0 matches D-1. Forcing estimation.")
                     official_d0 = None
                     
        data_is_d0 = False
        if is_trading_day(now) and now.time() >= MARKET_OPEN_TIME:
             data_is_d0 = True

        # --- Prepare Estimates ---
        estimated_d0 = None
        has_d0_prices = False

        estimated_d_minus_1 = None
        has_d_minus_1_prices = False

        # BRANCH A: Estimate D0 (Live/Intraday) - only if official D0 missing and we believe live data maps to D0
        if official_d0 is None and data_is_d0:
            port_change_d0 = NavService.calculate_portfolio_change(doc.get("holdings", []))
            if port_change_d0 is not None and official_d_minus_1 is not None:
                # port_change_d0 is percent (e.g., 1.23), official_d_minus_1 is NAV
                estimated_d0 = official_d_minus_1 * (1 + (port_change_d0 / 100.0))
                has_d0_prices = True

        # BRANCH B: Estimate D-1 (Historical Close) - only if official D-1 missing
        if official_d_minus_1 is None:
            port_change_d_minus_1 = NavService.get_historical_portfolio_change(doc.get("holdings", []), d_minus_1_date)
            if port_change_d_minus_1 is not None and official_d_minus_2 is not None:
                estimated_d_minus_1 = official_d_minus_2 * (1 + (port_change_d_minus_1 / 100.0))
                has_d_minus_1_prices = True

        # --- DECISION TREE EXECUTION ---
        current_nav = None
        day_pnl_val = 0.0
        reference_nav_for_day = None
        note = ""
        last_updated_str = ""
        is_live_estimated = False
        active_change_pct = None  # percent used in note

        if official_d0 is not None:
            # Case 1: Official NAV for D0 exists
            current_nav = official_d0
            last_updated_str = d0_str
            note = f"Official NAV ({d0_str})"

            # Reference for day PnL should be previous official (fallback search if missing)
            reference = official_d_minus_1 or official_d_minus_2
            if reference is None and recent_navs:
                for item in recent_navs:
                    if item["date"] != d0_str:
                        reference = float(item["nav"])
                        break
            if reference is not None:
                reference_nav_for_day = reference
                day_pnl_val = current_nav - reference_nav_for_day

        else:
            # Official D0 missing
            if has_d0_prices and estimated_d0 is not None:
                # Case 2: Estimate D0 using Live prices
                current_nav = estimated_d0
                is_live_estimated = True
                # active change percent relative to official D-1
                active_change_pct = ((estimated_d0 / official_d_minus_1 - 1) * 100) if official_d_minus_1 else None

                last_updated_str = "Live Est" if is_market_open(now) else "Est Close"
                note = f"Estimated ({last_updated_str})"

                # 1D = Estimated[D0] - Official[D-1] (official D-1 must exist)
                reference_nav_for_day = official_d_minus_1 or official_d_minus_2
                if reference_nav_for_day is not None:
                    day_pnl_val = current_nav - reference_nav_for_day

            else:
                # No D0 prices available
                if official_d_minus_1 is not None:
                    # Case 3: Use Official D-1
                    current_nav = official_d_minus_1
                    last_updated_str = d_minus_1_str
                    note = f"Official NAV ({d_minus_1_str})"

                    reference_nav_for_day = official_d_minus_2
                    if reference_nav_for_day is None and recent_navs:
                        for item in recent_navs:
                            if item["date"] not in (d0_str, d_minus_1_str):
                                reference_nav_for_day = float(item["nav"])
                                break
                    if reference_nav_for_day is not None:
                        day_pnl_val = current_nav - reference_nav_for_day

                else:
                    # Official D-1 missing
                    if has_d_minus_1_prices and estimated_d_minus_1 is not None:
                        # Case 4: Estimate D-1 using historical closes
                        current_nav = estimated_d_minus_1
                        is_live_estimated = True
                        active_change_pct = ((estimated_d_minus_1 / official_d_minus_2 - 1) * 100) if official_d_minus_2 else None

                        last_updated_str = f"Est {d_minus_1_str}"
                        note = f"Estimated NAV ({d_minus_1_str})"

                        reference_nav_for_day = official_d_minus_2
                        if reference_nav_for_day is not None:
                            day_pnl_val = current_nav - reference_nav_for_day

                    else:
                        # Case 5: Fallback to D-2
                        if official_d_minus_2 is not None:
                            current_nav = official_d_minus_2
                            last_updated_str = d_minus_2_str
                            note = f"Official NAV ({d_minus_2_str}) - D-1 Missing"

                            if official_d_minus_3 is not None:
                                reference_nav_for_day = official_d_minus_3
                                day_pnl_val = current_nav - reference_nav_for_day
                        else:
                            # Total Failure fallback
                            if recent_navs:
                                latest = recent_navs[0]
                                current_nav = float(latest["nav"])
                                last_updated_str = latest["date"]
                                note = f"Official NAV ({last_updated_str}) - Stale"
                            else:
                                return {"error": "No NAV data available."}

        # --- 2. Historical NAV (Purchase Price) ---
        investment_type = doc.get("investment_type", "lumpsum")
        
        if not investment:
            investment = float(doc.get("invested_amount", 0) or 0)
        if not input_date:
            input_date = doc.get("invested_date")

        purchase_nav = current_nav
        units = 0.0
        has_estimated_units = False  # Will be set True only for SIP with estimated units
        
        if investment_type == "lumpsum":
            # Existing Lumpsum Logic
            if input_date:
                try:
                    hist_res = NavService.get_nav_at_date(scheme_code, input_date)
                    if hist_res:
                        purchase_nav = hist_res[0]
                except Exception as e:
                    logger.debug(f"Failed to fetch purchase NAV for {input_date}: {e}")
            
            if purchase_nav and purchase_nav > 0:
                units = investment / purchase_nav
            else:
                 units = 0 # Safety
                 
        else:
            # SIP Logic
            # Total Units = Manual Start Units + Future Accumulated Units
            manual_units = float(doc.get("manual_total_units", 0) or 0)
            future_units = float(doc.get("future_sip_units", 0) or 0)
            units = manual_units + future_units
            
            # Check if any units are estimated
            has_estimated_units = future_units > 0  # future_sip_units are always estimated
            
            # Recalculate investment with stamp duty from installments
            # This ensures accurate display even for old data
            sip_mode = doc.get("sip_mode", "simple")
            installments = doc.get("sip_installments", [])
            
            if sip_mode == "detailed" and installments:
                # For detailed mode: use stored invested_amount (includes CAS cost_value)
                # Just sum units from installments for current value calculation
                total_units_from_installments = 0.0
                
                for inst in installments:
                    if inst.get("status") in ("PAID", "ASSUMED_PAID"):
                        # Sum units from installments (CAS provides actual units)
                        inst_units = inst.get("units")
                        if inst_units is not None:
                            total_units_from_installments += float(inst_units)
                
                # Use stored invested_amount (already includes CAS cost_value or calculated stamp duty)
                investment = float(doc.get("invested_amount", 0) or 0)
                
                # Use units from installments if available (more accurate than stored totals)
                if total_units_from_installments > 0:
                    units = total_units_from_installments
            else:
                # Simple mode: use stored invested_amount + manual_invested_amount
                investment = float(doc.get("invested_amount", 0) or 0)
            
            # Average NAV = Total Invested / Total Units
            if units > 0:
                purchase_nav = investment / units
            else:
                purchase_nav = 0.0

        # --- 3. Compute Metrics ---
        current_value = units * current_nav if current_nav is not None else 0
        total_pnl = current_value - investment
        total_pnl_pct = (total_pnl / investment) * 100 if investment > 0 else 0

        day_pnl_amt = day_pnl_val * units if day_pnl_val and units is not None else 0

        # Compute day_pnl_pct from the stored reference_nav_for_day (safe)
        if reference_nav_for_day and reference_nav_for_day > 0:
            day_pnl_pct = (day_pnl_val / reference_nav_for_day) * 100
        else:
            day_pnl_pct = 0

        # Enhance note with percent change if estimated
        if is_live_estimated and active_change_pct is not None:
            note += f" ({active_change_pct:+.2f}%)"
            
        # Detect Pending SIP Installments for Frontend Alert
        sip_pending_installments = []
        xirr_value = None  # XIRR (Annualized Return)
        has_pending_nav_sip = False  # SIP paid but units not yet allocated
        pending_nav_amount = 0.0  # Amount invested but not yet allocated units
        
        if investment_type == "sip":
            installments = doc.get("sip_installments", [])
            for inst in installments:
                if inst.get("status") == "PENDING":
                    sip_pending_installments.append(inst)
                elif inst.get("status") == "PAID":
                    # Check if this PAID installment has pending NAV (units is None)
                    if inst.get("units") is None or inst.get("allocation_status") == "PENDING_NAV":
                        has_pending_nav_sip = True
                        pending_nav_amount += float(inst.get("amount", 0))
                    # Check if units are estimated
                    if inst.get("allocation_status") == "ESTIMATED" or inst.get("is_estimated"):
                        has_estimated_units = True
            
            # Calculate XIRR for SIP
            # Only calculate if we have current value and confirmed installments with units
            if current_value > 0 and installments and units > 0:
                try:
                    manual_invested = float(doc.get("manual_invested_amount", 0) or 0)
                    sip_start = doc.get("sip_start_date") or doc.get("invested_date")
                    
                    xirr_value = calculate_sip_xirr(
                        installments=installments,
                        current_value=current_value,
                        current_date=d0_date,
                        manual_invested_amount=manual_invested,
                        sip_start_date=sip_start
                    )
                    if xirr_value is not None:
                        xirr_value = round(xirr_value, 2)
                except Exception as e:
                    logger.debug(f"XIRR calculation failed for {fund_id}: {e}")
                    xirr_value = None

        return {
            "fund_id": fund_id,
            "fund_name": fund_name,
            "invested_amount": investment,
            "manual_invested_amount": float(doc.get("manual_invested_amount", 0) or 0) if investment_type == "sip" else 0.0,
            "invested_date": input_date,
            "units": round(units, 4),
            "purchase_nav": round(purchase_nav, 4) if purchase_nav else 0.0,
            "current_nav": round(current_nav, 4) if current_nav is not None else None,
            "current_value": round(current_value, 2),
            "pnl": round(total_pnl, 2),
            "pnl_pct": round(total_pnl_pct, 2),
            "xirr": xirr_value,  # Annualized return (XIRR) for SIP
            "day_pnl": round(day_pnl_amt, 2),
            "day_pnl_pct": round(day_pnl_pct, 2),
            "last_updated": last_updated_str,
            "note": note,
            "nickname": doc.get("nickname"),
            "investment_type": investment_type,
            "sip_pending_installments": sip_pending_installments,
            "has_estimated_units": has_estimated_units if investment_type == "sip" else False,
            "has_pending_nav_sip": has_pending_nav_sip,
            "pending_nav_amount": round(pending_nav_amount, 2),
            "is_stale": stale_info["is_stale"],
            "days_since_update": stale_info["days_since_update"]
        }


nav_service = NavService()
