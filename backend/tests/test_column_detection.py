"""
Test script for robust Excel column detection
Tests various column name formats from different AMC portfolio disclosures
"""

import pandas as pd
import io

# Simulate the column detection logic
def test_column_detection(columns):
    """Test the column detection logic against various column formats"""
    col_map = {}
    isin_found = False
    name_found = False
    weight_found = False
    
    for col in columns:
        c = str(col).strip().upper()
        
        # ISIN Detection
        if not isin_found:
            if "ISIN" in c or c in ["ISIN", "ISIN CODE", "ISIN NO", "ISIN NUMBER"]:
                col_map[col] = "ISIN"
                isin_found = True
                continue
        
        # Name Detection
        if not name_found:
            name_keywords = ["INSTRUMENT", "ISSUER", "COMPANY", "SECURITY", "STOCK", "SCHEME", "FUND"]
            if "NAME" in c:
                if any(kw in c for kw in name_keywords) or c in ["NAME", "SCHEME NAME", "FUND NAME", "SECURITY NAME", "COMPANY NAME"]:
                    col_map[col] = "Name"
                    name_found = True
                    continue
            elif c in ["DESCRIPTION", "SCRIP", "SCRIPT", "PARTICULARS"]:
                col_map[col] = "Name"
                name_found = True
                continue
            elif any(kw in c for kw in ["INSTRUMENT", "ISSUER"]) and ("NAME" in c or "OF THE" in c):
                col_map[col] = "Name"
                name_found = True
                continue
        
        # Weight Detection
        if not weight_found:
            weight_keywords = ["AUM", "ASSET", "NAV", "WEIGHT", "ALLOCATION", "HOLDING", "PORTFOLIO"]
            
            if "%" in c:
                for kw in weight_keywords:
                    if kw in c:
                        col_map[col] = "Weight"
                        weight_found = True
                        break
                if not weight_found and ("TO" in c or "OF" in c):
                    col_map[col] = "Weight"
                    weight_found = True
                if not weight_found and ("WEIGHT" in c or "ALLOC" in c):
                    col_map[col] = "Weight"
                    weight_found = True
            
            if not weight_found:
                if c in ["WEIGHT", "WEIGHTAGE", "ALLOCATION", "PORTFOLIO WEIGHT", "% TO AUM", "AUM %"]:
                    col_map[col] = "Weight"
                    weight_found = True
                elif ("WEIGHT" in c or "ALLOC" in c) and "NET" not in c:
                    col_map[col] = "Weight"
                    weight_found = True
    
    return col_map, isin_found, name_found, weight_found


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
]

print("=" * 70)
print("HOLDINGS EXCEL COLUMN DETECTION TEST")
print("=" * 70)

all_passed = True
for test in test_cases:
    col_map, isin, name, weight = test_column_detection(test["columns"])
    
    # Check results
    isin_ok = isin == test["expected"]["ISIN"]
    name_ok = name == test["expected"]["Name"]
    weight_ok = weight == test["expected"]["Weight"]
    
    passed = isin_ok and name_ok and weight_ok
    all_passed = all_passed and passed
    
    status = "[PASS]" if passed else "[FAIL]"
    print(f"\n{status} | {test['name']}")
    print(f"  Columns: {test['columns']}")
    print(f"  Detected: {col_map}")
    print(f"  ISIN: {'OK' if isin_ok else 'X'} | Name: {'OK' if name_ok else 'X'} | Weight: {'OK' if weight_ok else 'X'}")

print("\n" + "=" * 70)
if all_passed:
    print("ALL TESTS PASSED! Column detection is robust.")
else:
    print("SOME TESTS FAILED! Review the detection logic.")
print("=" * 70)
