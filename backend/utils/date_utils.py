from datetime import datetime, time, timedelta, timezone
import pytz

from core.logging import get_logger

logger = get_logger("DateUtils")

# Indian Standard Time
IST = pytz.timezone('Asia/Kolkata')

# Market Timings
MARKET_OPEN_TIME = time(9, 15)
MARKET_CLOSE_TIME = time(15, 30)

# --- Dynamic Holiday Calendar ---
# Uses pandas_market_calendars for automatic, up-to-date holiday detection.
# Falls back to a minimal hardcoded list if the library is unavailable.

_nse_calendar = None
_nse_holidays_set = None


def _init_nse_calendar():
    """
    Initialize the NSE calendar from pandas_market_calendars.
    This is called once and cached for the lifetime of the application.
    Always pre-populates _nse_holidays_set with fallback holidays first,
    then attempts to load the calendar for dynamic checks.
    """
    global _nse_calendar, _nse_holidays_set
    if _nse_calendar is not None or _nse_holidays_set is not None:
        return

    # Always start with fallback holidays as a safety net
    _nse_holidays_set = _get_fallback_holidays()

    try:
        import pandas_market_calendars as mcal
        _nse_calendar = mcal.get_calendar('NSE')
        # Calendar loaded successfully; valid_days() will be used for checks
        # _nse_holidays_set remains as fallback if valid_days() fails at runtime
    except ImportError:
        # Library not available; _nse_calendar stays None, fallback will be used
        logger.warning("pandas_market_calendars not available, using fallback holidays")
        _nse_calendar = None
    except Exception as e:
        logger.exception("Error initializing NSE calendar")
        _nse_calendar = None

def _get_fallback_holidays():
    """
    Fallback hardcoded holidays if pandas_market_calendars is unavailable.
    This is a minimal list and should be extended as needed.
    """
    return {
        # 2025
        "2025-01-26", "2025-03-14", "2025-03-31", "2025-04-10", "2025-04-14",
        "2025-04-18", "2025-05-01", "2025-08-15", "2025-08-27", "2025-10-02",
        "2025-10-21", "2025-10-23", "2025-11-05", "2025-11-12", "2025-12-25",
        # 2026
        "2026-01-26", "2026-03-03", "2026-03-26", "2026-03-31", "2026-04-03",
        "2026-04-14", "2026-05-01", "2026-05-28", "2026-06-26", "2026-09-14",
        "2026-10-02", "2026-10-20", "2026-11-10", "2026-11-24", "2026-12-25",
    }


def is_nse_holiday(date_obj):
    """
    Check if a given date is an NSE holiday.
    Uses pandas_market_calendars if available, else falls back to hardcoded list.
    """
    _init_nse_calendar()

    date_str = date_obj.strftime("%Y-%m-%d")

    if _nse_calendar is not None:
        try:
            import pandas as pd
            # Check if this date is a valid session (trading day)
            return _nse_calendar.valid_days(start_date=date_str, end_date=date_str).size == 0
        except Exception as e:
            logger.exception(f"Error checking NSE calendar for {date_str}")

    # Fallback to hardcoded set
    return date_str in _nse_holidays_set


def get_current_ist_time():
    """Returns current time in IST."""
    return datetime.now(IST)


def is_market_open(current_dt=None):
    """
    Checks if NSE market is currently open.
    """
    if not current_dt:
        current_dt = get_current_ist_time()

    # Check Weekend
    if current_dt.weekday() >= 5:  # 5=Sat, 6=Sun
        return False

    # Check Holiday (dynamic)
    if is_nse_holiday(current_dt.date() if hasattr(current_dt, 'date') else current_dt):
        return False

    # Check Time
    current_time = current_dt.time()
    return MARKET_OPEN_TIME <= current_time <= MARKET_CLOSE_TIME


def is_trading_day(dt_obj=None):
    """Checks if the given date is a valid trading day (Mon-Fri, not holiday)."""
    if not dt_obj:
        dt_obj = get_current_ist_time()

    # Check Weekend
    if dt_obj.weekday() >= 5:
        return False

    # Check Holiday (dynamic)
    date_to_check = dt_obj.date() if hasattr(dt_obj, 'date') else dt_obj
    if is_nse_holiday(date_to_check):
        return False

    return True


def get_previous_business_day(ref_date=None):
    """
    Returns the date of the previous valid business day.
    """
    if not ref_date:
        ref_date = get_current_ist_time().date()

    check_date = ref_date - timedelta(days=1)

    # Loop back until we find a business day
    while True:
        # Check Weekend
        if check_date.weekday() >= 5:
            check_date -= timedelta(days=1)
            continue

        # Check Holiday (dynamic)
        if is_nse_holiday(check_date):
            check_date -= timedelta(days=1)
            continue

        return check_date


def format_date_for_api(dt_obj):
    """Formats date as DD-MM-YYYY for MFAPI."""
    return dt_obj.strftime("%d-%m-%Y")


def parse_date_from_str(date_str):
    """Parses various date formats safely."""
    formats = ["%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"]
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    raise ValueError(f"Could not parse date: {date_str}")
