import sys
print("Starting test execution...", flush=True)
import os
from unittest.mock import MagicMock

# Mock db module to avoid connection during test
sys.modules['db'] = MagicMock()
sys.modules['core.logging'] = MagicMock()
sys.modules['utils.common'] = MagicMock()

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pandas as pd
from services.holdings_service import HoldingsService

def test_column_detection(columns):
    """Test the column detection logic against various column formats"""
    # Create a dummy dataframe with these columns
    df = pd.DataFrame(columns=columns)
    
    # Run normalization
    col_map = HoldingsService._normalize_columns(df)
    
    # Check what we found
    isin_found = "ISIN" in col_map.values()
    name_found = "Name" in col_map.values()
    weight_found = "Weight" in col_map.values()
    
    # Check for duplicates in values (multiple cols mapped to same target)
    targets = list(col_map.values())
    has_duplicates = len(targets) != len(set(targets))
    
    return col_map, isin_found, name_found, weight_found, has_duplicates

# Test cases - different AMC formats
test_cases = [
    # SBI Mutual Fund format (from user's image)
    {
        "name": "SBI Mutual Fund",
        "columns": ["Name of the Instrument / Issuer", "ISIN", "Rating / Industry", "Quantity", 
                    "Market value (Rs. In Lakhs)", "% to AUM", "YTM %", "YTC % ##", "Notes & Symbols"],
        "expected": {"ISIN": True, "Name": True, "Weight": True}
    },
    # HDFC format
    {
        "name": "HDFC Mutual Fund",
        "columns": ["Company Name", "ISIN Code", "Industry", "Quantity", "Market Value", "% of NAV"],
        "expected": {"ISIN": True, "Name": True, "Weight": True}
    },
    # ICICI format
    {
        "name": "ICICI Prudential",
        "columns": ["Security Name", "ISIN", "Sector", "Quantity", "Market Value (Lakhs)", "% to Net Assets"],
        "expected": {"ISIN": True, "Name": True, "Weight": True}
    },
    # Axis format
    {
        "name": "Axis Mutual Fund",
        "columns": ["Name", "ISIN NO", "Sector", "Qty", "Value", "Weight %"],
        "expected": {"ISIN": True, "Name": True, "Weight": True}
    },
    # Nippon format
    {
        "name": "Nippon India",
        "columns": ["Instrument Name", "ISIN", "Rating", "Quantity", "Market Value", "% of AUM"],
        "expected": {"ISIN": True, "Name": True, "Weight": True}
    },
    # Minimal format
    {
        "name": "Minimal (ISIN + Weight only)",
        "columns": ["ISIN", "Weight"],
        "expected": {"ISIN": True, "Name": False, "Weight": True}
    },
    # Another variant
    {
        "name": "Description variant",
        "columns": ["Description", "ISIN Number", "Allocation %"],
        "expected": {"ISIN": True, "Name": True, "Weight": True}
    },
    # BUG REPRODUCTION: Duplicate Name columns
    {
        "name": "Duplicate Name Columns (Fix Verification)",
        "columns": ["Instrument Name", "Issuer Name", "ISIN", "% to AUM"],
        "expected": {"ISIN": True, "Name": True, "Weight": True},
        "should_fail_if_duplicate_targets": True
    },
]

print("=" * 70)
print("HOLDINGS EXCEL COLUMN DETECTION TEST")
print("=" * 70)

all_passed = True
for test in test_cases:
    col_map, isin, name, weight, has_duplicates = test_column_detection(test["columns"])
    
    # Check results
    isin_ok = isin == test["expected"]["ISIN"]
    name_ok = name == test["expected"]["Name"]
    weight_ok = weight == test["expected"]["Weight"]
    dup_ok = not has_duplicates
    
    passed = isin_ok and name_ok and weight_ok and dup_ok
    all_passed = all_passed and passed
    
    status = "[PASS]" if passed else "[FAIL]"
    print(f"\n{status} | {test['name']}")
    print(f"  Columns: {test['columns']}")
    print(f"  Detected: {col_map}")
    print(f"  ISIN: {'OK' if isin_ok else 'X'} | Name: {'OK' if name_ok else 'X'} | Weight: {'OK' if weight_ok else 'X'}")
    print(f"  Unique Targets: {'OK' if dup_ok else 'FAIL (Duplicates Mapped)'}")

print("\n" + "=" * 70)
if all_passed:
    print("ALL TESTS PASSED! Column detection is robust.")
else:
    print("SOME TESTS FAILED! Review the detection logic.")
print("=" * 70)
