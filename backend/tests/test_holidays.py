"""
Test holiday detection to ensure dynamic calendar works correctly.
"""
import pytest
from datetime import date, datetime
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.date_utils import is_nse_holiday, is_trading_day, is_market_open, get_previous_business_day


class TestNSEHolidays:
    """Tests for NSE holiday detection."""

    def test_republic_day_2026_is_holiday(self):
        """Republic Day 2026 (Jan 26) should be detected as a holiday."""
        republic_day = date(2026, 1, 26)
        assert is_nse_holiday(republic_day) is True

    def test_republic_day_2026_is_not_trading_day(self):
        """Republic Day 2026 should not be a trading day."""
        republic_day = datetime(2026, 1, 26, 10, 0, 0)
        assert is_trading_day(republic_day) is False

    def test_holi_2026_is_holiday(self):
        """Holi 2026 (Mar 3) should be detected as a holiday."""
        holi = date(2026, 3, 3)
        assert is_nse_holiday(holi) is True

    def test_regular_weekday_is_trading_day(self):
        """A regular weekday (non-holiday) should be a trading day."""
        # Jan 27, 2026 is a Tuesday (day after Republic Day)
        regular_day = datetime(2026, 1, 27, 10, 0, 0)
        assert is_trading_day(regular_day) is True

    def test_weekend_is_not_trading_day(self):
        """Saturday/Sunday should not be trading days."""
        saturday = datetime(2026, 1, 24, 10, 0, 0)
        sunday = datetime(2026, 1, 25, 10, 0, 0)
        assert is_trading_day(saturday) is False
        assert is_trading_day(sunday) is False

    def test_market_closed_on_holiday(self):
        """Market should be closed on a holiday even during market hours."""
        # Republic Day 2026 at 10:30 AM (normally market would be open)
        republic_day_market_hours = datetime(2026, 1, 26, 10, 30, 0)
        assert is_market_open(republic_day_market_hours) is False

    def test_get_previous_business_day_skips_holiday(self):
        """get_previous_business_day should skip holidays."""
        # Jan 27, 2026 is a Tuesday, previous business day should be Jan 23 (Friday)
        # because Jan 26 (Monday) is Republic Day
        jan_27 = date(2026, 1, 27)
        prev_day = get_previous_business_day(jan_27)
        assert prev_day == date(2026, 1, 23)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
