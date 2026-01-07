"""
CAS Parser Test Script v2 - Using pdfplumber (no pymupdf)
=========================================================
Fallback approach if casparser has DLL issues.

Usage:
    python test_casparser_v2.py "path_to_cas.pdf" PASSWORD
"""

import sys
import re
from datetime import datetime

try:
    import pdfplumber
except ImportError:
    print("Installing pdfplumber...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pdfplumber"])
    import pdfplumber


def extract_text_from_pdf(pdf_path: str, password: str = None) -> str:
    """Extract all text from PDF."""
    full_text = ""
    try:
        with pdfplumber.open(pdf_path, password=password) as pdf:
            print(f"📄 PDF has {len(pdf.pages)} pages")
            for i, page in enumerate(pdf.pages):
                text = page.extract_text() or ""
                full_text += text + "\n"
                print(f"   Page {i+1}: {len(text)} characters")
    except Exception as e:
        print(f"❌ Error: {e}")
        return ""
    return full_text


def parse_transactions_simple(text: str):
    """
    Simple regex-based transaction parser for CAS statements.
    This is a basic parser - actual CAS formats vary.
    """
    transactions = []
    
    # Common CAS transaction line pattern:
    # DD-Mon-YYYY | Description | Amount | Units | NAV | Unit Balance
    # Example: 15-Jan-2024   Purchase   5000.00   50.1234   99.75   150.5678
    
    # Pattern to find transaction-like lines
    date_pattern = r'(\d{1,2}[-/][A-Za-z]{3}[-/]\d{4}|\d{1,2}[-/]\d{2}[-/]\d{4})'
    
    lines = text.split('\n')
    for line in lines:
        # Check if line contains a date
        date_match = re.search(date_pattern, line)
        if date_match:
            # Try to extract numbers from this line
            numbers = re.findall(r'[-+]?\d*\.?\d+', line)
            if len(numbers) >= 3:  # At least date parts + amount + units
                transactions.append({
                    "raw_line": line.strip(),
                    "date": date_match.group(1),
                    "numbers_found": numbers
                })
    
    return transactions


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    
    pdf_path = sys.argv[1]
    password = sys.argv[2] if len(sys.argv) > 2 else None
    
    print(f"\n📄 Opening: {pdf_path}")
    print(f"🔐 Password: {'*' * len(password) if password else 'None'}")
    print("=" * 60)
    
    # Extract text
    text = extract_text_from_pdf(pdf_path, password)
    
    if not text:
        print("❌ Could not extract text from PDF")
        return
    
    # Save raw text for inspection
    with open("cas_raw_text.txt", "w", encoding="utf-8") as f:
        f.write(text)
    print(f"\n💾 Raw text saved to: cas_raw_text.txt")
    
    # Show first 2000 chars as preview
    print("\n" + "=" * 60)
    print("📝 TEXT PREVIEW (first 2000 chars):")
    print("=" * 60)
    print(text[:2000])
    print("\n... [truncated]")
    
    # Try to find transactions
    print("\n" + "=" * 60)
    print("🔍 SEARCHING FOR TRANSACTION PATTERNS:")
    print("=" * 60)
    
    transactions = parse_transactions_simple(text)
    print(f"\nFound {len(transactions)} potential transaction lines:")
    for txn in transactions[:20]:  # Show first 20
        print(f"  📌 {txn['raw_line'][:80]}...")
    
    print("\n" + "=" * 60)
    print("✅ Done! Review 'cas_raw_text.txt' to see the full extracted text.")
    print("   This will help us understand the exact format for parsing.")
    print("=" * 60)


if __name__ == "__main__":
    main()
