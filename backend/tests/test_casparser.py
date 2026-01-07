"""
CAS Parser Test Script
======================
This script demonstrates how casparser extracts data from CAS PDF statements.

Usage:
    python test_casparser.py <path_to_cas.pdf> [password]
    
Example:
    python test_casparser.py my_cas.pdf ABCDE1234F
    (password is usually your PAN number)
"""

import sys
import json
from datetime import datetime

try:
    import casparser
except ImportError:
    print("=" * 60)
    print("casparser not installed. Installing now...")
    print("=" * 60)
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "casparser"])
    import casparser


def parse_cas(pdf_path: str, password: str = None):
    """Parse CAS PDF and return structured data."""
    print(f"\n📄 Parsing: {pdf_path}")
    print(f"🔐 Password: {'*' * len(password) if password else 'None'}")
    print("=" * 60)
    
    # Check dependencies
    print("\n🔍 Checking dependencies...")
    try:
        import fitz  # pymupdf
        print(f"   ✅ PyMuPDF (fitz) version: {fitz.version}")
    except ImportError:
        print("   ❌ PyMuPDF NOT installed! Run: pip install pymupdf")
        return None
    
    try:
        # Parse the CAS PDF with explicit output format
        # casparser should auto-detect pymupdf if installed
        data = casparser.read_cas_pdf(pdf_path, password, output="dict")
        return data
    except Exception as e:
        print(f"❌ Error parsing CAS: {e}")
        print(f"\n🔧 Troubleshooting tips:")
        print(f"   1. Ensure pymupdf is installed: pip install pymupdf")
        print(f"   2. Try reinstalling casparser: pip install --upgrade casparser[mupdf]")
        print(f"   3. Check if PDF is a valid CAS statement (CAMS/Karvy/MFCentral)")
        print(f"   4. Verify the password (usually your PAN number)")
        return None


def display_summary(data):
    """Display a summary of the parsed CAS data."""
    if not data:
        return
    
    print("\n" + "=" * 60)
    print("📊 CAS SUMMARY")
    print("=" * 60)
    
    # Investor Info
    investor = data.get("investor_info", {})
    print(f"\n👤 Investor: {investor.get('name', 'N/A')}")
    print(f"   Email: {investor.get('email', 'N/A')}")
    print(f"   PAN: {investor.get('pan', 'N/A')}")
    
    # Statement Period
    period = data.get("statement_period", {})
    print(f"\n📅 Statement Period: {period.get('from', 'N/A')} to {period.get('to', 'N/A')}")
    
    # Folios Summary
    folios = data.get("folios", [])
    print(f"\n📁 Total Folios: {len(folios)}")


def display_folios(data):
    """Display each folio with its schemes and transactions."""
    if not data:
        return
    
    folios = data.get("folios", [])
    
    for i, folio in enumerate(folios, 1):
        print("\n" + "=" * 60)
        print(f"📁 FOLIO {i}: {folio.get('folio', 'N/A')}")
        print(f"   AMC: {folio.get('amc', 'N/A')}")
        print(f"   PAN: {folio.get('PAN', 'N/A')}")
        print("=" * 60)
        
        schemes = folio.get("schemes", [])
        for j, scheme in enumerate(schemes, 1):
            print(f"\n  💼 Scheme {j}: {scheme.get('scheme', 'N/A')}")
            print(f"     ISIN: {scheme.get('isin', 'N/A')}")
            print(f"     AMFI Code: {scheme.get('amfi', 'N/A')}")
            print(f"     Type: {scheme.get('type', 'N/A')}")
            print(f"     Open Balance: {scheme.get('open', 'N/A')} units")
            print(f"     Close Balance: {scheme.get('close', 'N/A')} units")
            
            # Valuation
            valuation = scheme.get("valuation", {})
            print(f"     NAV: ₹{valuation.get('nav', 'N/A')}")
            print(f"     Value: ₹{valuation.get('value', 'N/A')}")
            
            # Transactions - THE KEY DATA FOR XIRR!
            transactions = scheme.get("transactions", [])
            print(f"\n     📈 Transactions ({len(transactions)}):")
            print("     " + "-" * 50)
            
            for txn in transactions:
                date = txn.get("date", "N/A")
                desc = txn.get("description", "N/A")[:30]
                amount = txn.get("amount", 0)
                units = txn.get("units", 0)
                nav = txn.get("nav", 0)
                balance = txn.get("balance", 0)
                
                # Format: Date | Type | Amount | Units | NAV | Balance
                print(f"     {date} | {desc:30} | ₹{amount:>10.2f} | {units:>10.4f} units | NAV: {nav:>8.4f} | Bal: {balance:>10.4f}")


def extract_transactions_for_xirr(data, scheme_name_filter: str = None):
    """
    Extract transactions in format suitable for XIRR calculation.
    Returns list of dicts: [{date, amount, units, nav, type}, ...]
    """
    if not data:
        return []
    
    all_transactions = []
    
    for folio in data.get("folios", []):
        for scheme in folio.get("schemes", []):
            scheme_name = scheme.get("scheme", "")
            
            # Optional: filter by scheme name
            if scheme_name_filter and scheme_name_filter.lower() not in scheme_name.lower():
                continue
            
            for txn in scheme.get("transactions", []):
                all_transactions.append({
                    "scheme": scheme_name,
                    "isin": scheme.get("isin"),
                    "amfi": scheme.get("amfi"),
                    "date": str(txn.get("date")),
                    "description": txn.get("description"),
                    "amount": txn.get("amount", 0),
                    "units": txn.get("units", 0),
                    "nav": txn.get("nav", 0),
                    "balance": txn.get("balance", 0),
                    "type": txn.get("type", "UNKNOWN")
                })
    
    return all_transactions


def save_to_json(data, output_path: str = "cas_parsed.json"):
    """Save parsed data to JSON for inspection."""
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)
    print(f"\n💾 Full data saved to: {output_path}")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        print("\n⚠️  Please provide a CAS PDF path!")
        print("   Example: python test_casparser.py my_cas.pdf PANCARD123")
        return
    
    pdf_path = sys.argv[1]
    password = sys.argv[2] if len(sys.argv) > 2 else None
    
    # Parse CAS
    data = parse_cas(pdf_path, password)
    
    if not data:
        return
    
    # Display summary
    display_summary(data)
    
    # Display folios and transactions
    display_folios(data)
    
    # Extract transactions for XIRR
    print("\n" + "=" * 60)
    print("🎯 TRANSACTIONS FOR XIRR CALCULATION")
    print("=" * 60)
    
    transactions = extract_transactions_for_xirr(data)
    print(f"\nTotal transactions extracted: {len(transactions)}")
    
    # Show first 10 as sample
    print("\nSample (first 10):")
    for txn in transactions[:10]:
        print(f"  {txn['date']} | {txn['description'][:25]:25} | ₹{txn['amount']:>10.2f} | {txn['units']:>10.4f} units")
    
    # Save full data to JSON
    save_to_json(data)
    
    print("\n" + "=" * 60)
    print("✅ Done! Check 'cas_parsed.json' for full structured data.")
    print("=" * 60)


if __name__ == "__main__":
    main()
