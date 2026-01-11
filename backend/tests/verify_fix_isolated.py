import sys
import unittest
from unittest.mock import MagicMock
import pandas as pd

# AGGRESSIVE MOCKING to avoid import side-effects
sys.modules["db"] = MagicMock()
sys.modules["requests"] = MagicMock()
sys.modules["bson"] = MagicMock()
# sys.modules["utils"] = MagicMock() 
# Mocking submodules explicitly
sys.modules["utils.common"] = MagicMock()
sys.modules["utils.date_utils"] = MagicMock()
sys.modules["core"] = MagicMock()
sys.modules["core.logging"] = MagicMock()
sys.modules["dateutil"] = MagicMock()
sys.modules["dateutil.relativedelta"] = MagicMock()

import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Import targeted service
from services.holdings_service import HoldingsService

class TestFix(unittest.TestCase):
    def test_normalize_columns(self):
        print("Running isolated verification...", flush=True)
        # BUG REPRODUCTION: duplicate Name candidates
        # "Instrument Name" is score 5 ("NAME") + 3 (contains INSTRUMENT but not NAME? No, wait)
        # Let's check logic:
        # "Instrument Name": "NAME" in c (+5), "INSTRUMENT" in c (+5). Score 10.
        # "Issuer Name": "NAME" in c (+5), "ISSUER" in c (+3). Score 8.
        # "Instrument Name" should win.
        
        cols = ["Instrument Name", "Issuer Name", "ISIN", "% to AUM"]
        df = pd.DataFrame(columns=cols)
        
        mapping = HoldingsService._normalize_columns(df)
        
        print(f"Mapping: {mapping}", flush=True)
        
        # Verify "Instrument Name" is selected for "Name"
        self.assertIn("Instrument Name", mapping) 
        self.assertEqual(mapping["Instrument Name"], "Name")
        
        # Ensure "Issuer Name" is NOT mapped to Name (duplicates avoided)
        self.assertNotIn("Issuer Name", mapping)
        
        # Verify ISIN and Weight
        self.assertIn("ISIN", mapping)
        self.assertEqual(mapping["ISIN"], "ISIN")
        
        self.assertIn("% to AUM", mapping)
        self.assertEqual(mapping["% to AUM"], "Weight")

        # Verify targets are unique
        targets = list(mapping.values())
        self.assertEqual(len(targets), len(set(targets)), "Duplicate targets found! Fix failed.")
        print("SUCCESS: Unique targets verified.", flush=True)

if __name__ == "__main__":
    unittest.main()
