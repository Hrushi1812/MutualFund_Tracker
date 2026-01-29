"""
Fyers API Service - Handles authentication and market data fetching
"""
import os
import json
import time
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from pathlib import Path

from fyers_apiv3 import fyersModel
from core.config import settings
from core.logging import get_logger

logger = get_logger("FyersService")

# Token storage path
TOKEN_FILE = Path(__file__).parent.parent / ".fyers_token.json"


class FyersService:
    """
    Singleton service for Fyers API operations.
    Handles authentication, token management, quotes, and historical data.
    """
    _instance = None
    _fyers: Optional[fyersModel.FyersModel] = None
    _access_token: Optional[str] = None
    _token_expiry: Optional[datetime] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        self.app_id = settings.FYERS_APP_ID
        self.secret_key = settings.FYERS_SECRET_KEY
        self.redirect_uri = settings.FYERS_REDIRECT_URI
        self._load_token()

    def _load_token(self):
        """Load saved token from file if exists and not expired."""
        try:
            if TOKEN_FILE.exists():
                with open(TOKEN_FILE, "r") as f:
                    data = json.load(f)
                    expiry = datetime.fromisoformat(data.get("expiry", "2000-01-01"))
                    if expiry > datetime.now():
                        self._access_token = data.get("access_token")
                        self._token_expiry = expiry
                        self._init_fyers_model()
                        logger.info("Loaded valid Fyers token from cache")
                    else:
                        logger.info("Cached Fyers token expired")
        except Exception as e:
            logger.warning(f"Failed to load Fyers token: {e}")

    def _save_token(self):
        """Save token to file for persistence."""
        try:
            with open(TOKEN_FILE, "w") as f:
                json.dump({
                    "access_token": self._access_token,
                    "expiry": self._token_expiry.isoformat() if self._token_expiry else None
                }, f)
            logger.info("Fyers token saved to cache")
        except Exception as e:
            logger.warning(f"Failed to save Fyers token: {e}")

    def _init_fyers_model(self):
        """Initialize the Fyers API model with current token."""
        if self._access_token:
            self._fyers = fyersModel.FyersModel(
                client_id=self.app_id,
                token=self._access_token,
                is_async=False,
                log_path=""
            )

    def get_auth_url(self) -> str:
        """
        Generate the OAuth authorization URL.
        User needs to visit this URL to authorize the app.
        """
        session = fyersModel.SessionModel(
            client_id=self.app_id,
            secret_key=self.secret_key,
            redirect_uri=self.redirect_uri,
            response_type="code",
            grant_type="authorization_code"
        )
        return session.generate_authcode()

    def generate_token(self, auth_code: str) -> bool:
        """
        Exchange authorization code for access token.
        Call this after user authorizes via the auth URL.
        """
        try:
            session = fyersModel.SessionModel(
                client_id=self.app_id,
                secret_key=self.secret_key,
                redirect_uri=self.redirect_uri,
                response_type="code",
                grant_type="authorization_code"
            )
            session.set_token(auth_code)
            response = session.generate_token()
            
            if response.get("s") == "ok" or response.get("access_token"):
                self._access_token = response["access_token"]
                # Fyers tokens are valid for ~24 hours
                self._token_expiry = datetime.now() + timedelta(hours=23)
                self._save_token()
                self._init_fyers_model()
                logger.info("Fyers token generated successfully")
                return True
            else:
                logger.error(f"Token generation failed: {response}")
                return False
        except Exception as e:
            logger.error(f"Token generation error: {e}")
            return False

    def set_token_directly(self, access_token: str):
        """
        Manually set an access token (useful for testing or manual token generation).
        """
        self._access_token = access_token
        self._token_expiry = datetime.now() + timedelta(hours=23)
        self._save_token()
        self._init_fyers_model()
        logger.info("Fyers token set directly")

    def is_authenticated(self) -> bool:
        """Check if we have a valid (non-expired) cached token."""
        if not self._access_token or not self._token_expiry:
            return False
        return datetime.now() < self._token_expiry

    def validate_token_live(self) -> bool:
        """
        Perform a lightweight API call to verify the token is actually valid.
        This catches cases where token is cached but revoked/expired on broker side.
        """
        if not self._access_token:
            return False
        
        try:
            # Use profile API as lightweight validation
            response = self._fyers.get_profile()
            if response.get("s") == "ok":
                logger.debug("Fyers token validated via live API call")
                return True
            else:
                logger.warning(f"Fyers token validation failed: {response}")
                return False
        except Exception as e:
            logger.warning(f"Fyers token validation error: {e}")
            return False

    def get_market_status(self) -> Optional[Dict[str, Any]]:
        """
        Get real-time market status from Fyers API.
        Returns dict with exchange status info, or None if not authenticated/failed.
        """
        if not self.is_authenticated() or not self._fyers:
            return None
        
        try:
            response = self._fyers.market_status()
            if response.get("s") == "ok":
                return response
            else:
                logger.debug(f"Market status check failed: {response}")
                return None
        except Exception as e:
            logger.debug(f"Market status error: {e}")
            return None

    def is_nse_market_open_live(self) -> Optional[bool]:
        """
        Check if NSE equity market is currently open using live Fyers API.
        Returns True/False, or None if unable to determine.
        """
        status = self.get_market_status()
        if not status:
            return None
        
        try:
            for market in status.get("marketStatus", []):
                if market.get("exchange") == "NSE" and market.get("segment") == "CM":
                    return market.get("status") == "OPEN"
        except Exception:
            pass
        
        return None

    def clear_token(self):
        """Clear the cached token (disconnect)."""
        self._access_token = None
        self._token_expiry = None
        self._fyers = None
        try:
            if TOKEN_FILE.exists():
                TOKEN_FILE.unlink()
            logger.info("Fyers token cleared")
        except Exception as e:
            logger.warning(f"Failed to delete token file: {e}")

    @staticmethod
    def format_symbol(symbol: str, exchange: str = "NSE") -> str:
        """
        Convert a plain symbol to Fyers format.
        Example: RELIANCE -> NSE:RELIANCE-EQ
        """
        symbol = symbol.upper().strip()
        # Remove any existing suffix
        if symbol.endswith(".NS") or symbol.endswith(".BO"):
            symbol = symbol[:-3]
        if symbol.endswith("-EQ"):
            symbol = symbol[:-3]
        if ":" in symbol:
            return symbol  # Already formatted
        return f"{exchange}:{symbol}-EQ"

    def _get_pct_change_for_formatted_symbols(self, formatted_symbols: List[str]) -> Dict[str, Optional[float]]:
        """Fetch pct change for already-formatted FYERS symbols (e.g., 'BSE:SBICARD-A').

        Returns dict keyed by the formatted symbol string.
        """
        result: Dict[str, Optional[float]] = {}
        if not self.is_authenticated() or not formatted_symbols:
            return result

        try:
            batch_size = 50
            for i in range(0, len(formatted_symbols), batch_size):
                batch = formatted_symbols[i:i + batch_size]
                symbols_str = ",".join(batch)
                response = self._fyers.quotes({"symbols": symbols_str})
                if response.get("s") == "ok" and response.get("d"):
                    for quote in response["d"]:
                        v = quote.get("v", {})
                        sym = quote.get("n")
                        pct = v.get("chp")
                        if sym:
                            result[sym] = float(pct) if pct is not None else None

                if i + batch_size < len(formatted_symbols):
                    time.sleep(0.1)
        except Exception as e:
            logger.debug(f"Formatted quotes error: {e}")

        return result

    def get_quotes(self, symbols: List[str]) -> Dict[str, Any]:
        """
        Fetch live quotes for multiple symbols.
        
        Args:
            symbols: List of symbols (can be plain like "RELIANCE" or formatted like "NSE:RELIANCE-EQ")
            
        Returns:
            Dict with symbol -> quote data mapping, or empty dict on failure
        """
        if not self.is_authenticated():
            logger.warning("Fyers not authenticated. Cannot fetch quotes.")
            return {}

        try:
            # Format symbols
            formatted = [self.format_symbol(s) for s in symbols]
            symbols_str = ",".join(formatted)
            
            data = {"symbols": symbols_str}
            response = self._fyers.quotes(data)
            
            if response.get("s") == "ok" and response.get("d"):
                result = {}
                for quote in response["d"]:
                    # v contains the quote values
                    v = quote.get("v", {})
                    sym = quote.get("n", "").replace("NSE:", "").replace("-EQ", "")
                    result[sym] = {
                        "ltp": v.get("lp"),           # Last traded price
                        "change": v.get("ch"),         # Absolute change
                        "pct_change": v.get("chp"),    # Percent change
                        "open": v.get("open_price"),
                        "high": v.get("high_price"),
                        "low": v.get("low_price"),
                        "prev_close": v.get("prev_close_price"),
                        "volume": v.get("volume"),
                        "timestamp": v.get("tt")
                    }
                return result
            else:
                logger.warning(f"Fyers quotes failed: {response}")
                return {}
        except Exception as e:
            logger.error(f"Fyers quotes error: {e}")
            return {}

    def get_quote_pct_change(self, symbol: str) -> Optional[float]:
        """
        Get the percent change for a single symbol.
        Tries NSE first, then BSE as fallback.
        Returns float (e.g., 1.25 for +1.25%) or None.
        """
        # If caller already provided a full FYERS symbol (e.g., BSE:SBICARD-A), use it directly.
        if ":" in (symbol or ""):
            if not self.is_authenticated():
                return None
            try:
                response = self._fyers.quotes({"symbols": symbol})
                if response.get("s") == "ok" and response.get("d"):
                    for quote in response["d"]:
                        v = quote.get("v", {})
                        pct = v.get("chp")
                        if pct is not None:
                            return float(pct)
            except Exception as e:
                logger.debug(f"Quote fetch failed for formatted symbol {symbol}: {e}")
            return None

        plain_sym = symbol.upper().replace(".NS", "").replace(".BO", "").replace("-EQ", "")
        
        # Try NSE first
        nse_result = self._get_quote_for_exchange(plain_sym, "NSE")
        if nse_result is not None:
            return nse_result
        
        # Fallback to BSE
        bse_result = self._get_quote_for_exchange(plain_sym, "BSE")
        if bse_result is not None:
            logger.debug(f"Found {plain_sym} on BSE (not on NSE)")
            return bse_result
        
        return None

    def _get_quote_for_exchange(self, symbol: str, exchange: str) -> Optional[float]:
        """Helper to get quote from a specific exchange."""
        if not self.is_authenticated():
            return None
        
        try:
            formatted = self.format_symbol(symbol, exchange)
            data = {"symbols": formatted}
            response = self._fyers.quotes(data)
            
            if response.get("s") == "ok" and response.get("d"):
                for quote in response["d"]:
                    v = quote.get("v", {})
                    pct = v.get("chp")
                    if pct is not None:
                        return float(pct)
        except Exception as e:
            logger.debug(f"Quote fetch failed for {symbol} on {exchange}: {e}")
        
        return None

    def get_historical_data(
        self,
        symbol: str,
        resolution: str = "D",
        from_date: datetime = None,
        to_date: datetime = None
    ) -> Optional[List[Dict]]:
        """
        Fetch historical OHLCV data.
        
        Args:
            symbol: Stock symbol
            resolution: D (daily), 1 (1min), 5, 15, 30, 60, 120, 240
            from_date: Start date
            to_date: End date
            
        Returns:
            List of candles or None on failure
        """
        if not self.is_authenticated():
            logger.warning("Fyers not authenticated. Cannot fetch history.")
            return None

        try:
            formatted_symbol = self.format_symbol(symbol)
            
            # Default date range: last 10 days
            if not to_date:
                to_date = datetime.now()
            if not from_date:
                from_date = to_date - timedelta(days=10)

            data = {
                "symbol": formatted_symbol,
                "resolution": resolution,
                "date_format": "0",  # 0 = epoch timestamps (int), 1 = YYYY-MM-DD strings
                "range_from": int(from_date.timestamp()),
                "range_to": int(to_date.timestamp()),
                "cont_flag": "1"
            }
            
            response = self._fyers.history(data)
            
            if response.get("s") == "ok" and response.get("candles"):
                candles = []
                for c in response["candles"]:
                    # [timestamp, open, high, low, close, volume]
                    candles.append({
                        "timestamp": c[0],
                        "date": datetime.fromtimestamp(c[0]).strftime("%Y-%m-%d"),
                        "open": c[1],
                        "high": c[2],
                        "low": c[3],
                        "close": c[4],
                        "volume": c[5]
                    })
                return candles
            else:
                logger.warning(f"Fyers history failed for {symbol}: {response}")
                return None
        except Exception as e:
            logger.error(f"Fyers history error for {symbol}: {e}")
            return None

    def get_historical_pct_change(self, symbol: str, target_date: datetime) -> Optional[float]:
        """
        Calculate percent change for a specific historical date.
        Tries NSE first, then BSE as fallback.
        
        Returns float or None.
        """
        # If caller already provided a full FYERS symbol, use it directly.
        if ":" in (symbol or ""):
            try:
                from_date = target_date - timedelta(days=7)
                to_date = target_date + timedelta(days=1)
                candles = self.get_historical_data(symbol, "D", from_date, to_date)
                if not candles or len(candles) < 2:
                    return None

                target_str = target_date.strftime("%Y-%m-%d")
                target_candle = None
                prev_candle = None
                for i, c in enumerate(candles):
                    if c["date"] == target_str:
                        target_candle = c
                        if i > 0:
                            prev_candle = candles[i - 1]
                        break

                if target_candle and prev_candle and prev_candle["close"] > 0:
                    return ((target_candle["close"] - prev_candle["close"]) / prev_candle["close"]) * 100
            except Exception as e:
                logger.debug(f"Historical pct change failed for formatted symbol {symbol}: {e}")
            return None

        plain_sym = symbol.upper().replace(".NS", "").replace(".BO", "").replace("-EQ", "")
        
        # Try NSE first
        result = self._get_historical_pct_for_exchange(plain_sym, target_date, "NSE")
        if result is not None:
            return result
        
        # Fallback to BSE
        result = self._get_historical_pct_for_exchange(plain_sym, target_date, "BSE")
        if result is not None:
            logger.debug(f"Found historical data for {plain_sym} on BSE")
            return result
        
        return None

    def _get_historical_pct_for_exchange(self, symbol: str, target_date: datetime, exchange: str) -> Optional[float]:
        """Helper to get historical percent change from a specific exchange."""
        try:
            from_date = target_date - timedelta(days=7)
            to_date = target_date + timedelta(days=1)
            
            candles = self._get_historical_data_for_exchange(symbol, "D", from_date, to_date, exchange)
            if not candles or len(candles) < 2:
                return None

            target_str = target_date.strftime("%Y-%m-%d")
            target_candle = None
            prev_candle = None
            
            for i, c in enumerate(candles):
                if c["date"] == target_str:
                    target_candle = c
                    if i > 0:
                        prev_candle = candles[i - 1]
                    break

            if target_candle and prev_candle and prev_candle["close"] > 0:
                pct = ((target_candle["close"] - prev_candle["close"]) / prev_candle["close"]) * 100
                return pct
        except Exception as e:
            logger.debug(f"Historical pct change error for {symbol} on {exchange}: {e}")
        
        return None

    def _get_historical_data_for_exchange(
        self, symbol: str, resolution: str, from_date: datetime, to_date: datetime, exchange: str
    ) -> Optional[List[Dict]]:
        """Helper to get historical data from a specific exchange."""
        if not self.is_authenticated():
            return None

        try:
            formatted_symbol = self.format_symbol(symbol, exchange)
            
            data = {
                "symbol": formatted_symbol,
                "resolution": resolution,
                "date_format": "0",  # 0 = epoch timestamps (int), 1 = YYYY-MM-DD strings
                "range_from": int(from_date.timestamp()),
                "range_to": int(to_date.timestamp()),
                "cont_flag": "1"
            }
            
            response = self._fyers.history(data)
            
            if response.get("s") == "ok" and response.get("candles"):
                candles = []
                for c in response["candles"]:
                    candles.append({
                        "timestamp": c[0],
                        "date": datetime.fromtimestamp(c[0]).strftime("%Y-%m-%d"),
                        "open": c[1],
                        "high": c[2],
                        "low": c[3],
                        "close": c[4],
                        "volume": c[5]
                    })
                return candles
        except Exception as e:
            logger.debug(f"History fetch error for {symbol} on {exchange}: {e}")
        
        return None

    def get_bulk_quotes_pct_change(self, symbols: List[str]) -> Dict[str, Optional[float]]:
        """
        Get percent changes for multiple symbols.
        Tries NSE first for all, then BSE for any that failed.
        
        Returns dict: symbol -> pct_change (or None if failed)
        """
        result: Dict[str, Optional[float]] = {}
        if not symbols:
            return result

        # Split into formatted (explicit exchange/suffix) vs plain symbols
        formatted_inputs = [s for s in symbols if ":" in (s or "")]
        plain_inputs = [s for s in symbols if ":" not in (s or "")]

        # 1) Handle formatted symbols directly
        if formatted_inputs:
            formatted_quotes = self._get_pct_change_for_formatted_symbols(formatted_inputs)
            for s in formatted_inputs:
                result[s] = formatted_quotes.get(s)

        # 2) Handle plain symbols (legacy behavior: NSE first, then BSE with -EQ)
        if not plain_inputs:
            return result

        clean_symbols = [s.upper().replace(".NS", "").replace(".BO", "").replace("-EQ", "") for s in plain_inputs]
        symbol_map = {clean: orig for clean, orig in zip(clean_symbols, plain_inputs)}
        
        # PASS 1: Try all on NSE
        nse_quotes = self._get_bulk_quotes_for_exchange(clean_symbols, "NSE")
        failed_symbols = []
        
        for clean_sym, orig_sym in symbol_map.items():
            if clean_sym in nse_quotes and nse_quotes[clean_sym] is not None:
                result[orig_sym] = nse_quotes[clean_sym]
            else:
                failed_symbols.append(clean_sym)
        
        # PASS 2: Try failed symbols on BSE
        if failed_symbols:
            logger.debug(f"Trying {len(failed_symbols)} symbols on BSE...")
            bse_quotes = self._get_bulk_quotes_for_exchange(failed_symbols, "BSE")
            
            for clean_sym in failed_symbols:
                orig_sym = symbol_map[clean_sym]
                if clean_sym in bse_quotes and bse_quotes[clean_sym] is not None:
                    result[orig_sym] = bse_quotes[clean_sym]
                else:
                    result[orig_sym] = None
        
        return result

    def _get_bulk_quotes_for_exchange(self, symbols: List[str], exchange: str) -> Dict[str, Optional[float]]:
        """Helper to get bulk quotes from a specific exchange."""
        result = {}
        if not self.is_authenticated() or not symbols:
            return result

        try:
            # Fyers API limit is ~50 symbols per request
            batch_size = 50
            for i in range(0, len(symbols), batch_size):
                batch = symbols[i:i + batch_size]
                formatted = [self.format_symbol(s, exchange) for s in batch]
                symbols_str = ",".join(formatted)
                
                response = self._fyers.quotes({"symbols": symbols_str})
                
                if response.get("s") == "ok" and response.get("d"):
                    for quote in response["d"]:
                        v = quote.get("v", {})
                        # Extract symbol name without exchange prefix
                        sym = quote.get("n", "").replace(f"{exchange}:", "").replace("-EQ", "")
                        pct = v.get("chp")
                        if pct is not None:
                            result[sym] = float(pct)
                
                if i + batch_size < len(symbols):
                    time.sleep(0.1)
        except Exception as e:
            logger.debug(f"Bulk quotes error on {exchange}: {e}")
        
        return result


# Singleton instance
fyers_service = FyersService()
