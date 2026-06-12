
import unittest
from unittest.mock import MagicMock, patch
import pandas as pd
import sys
import os

# Set up path to find backend modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Patch dependencies BEFORE importing service to avoid running top-level code if any
# (Though generally imports are fine, but sidebar: HoldingsService instantiates at bottom of file)
# We will import the class via package

class TestFundValidation(unittest.TestCase):
    
    @patch('services.holdings_service.load_nse_isin_map')
    @patch('services.holdings_service.get_scheme_candidates')
    @patch('services.holdings_service.pd.read_excel')
    @patch('services.holdings_service.holdings_collection') # Mock DB to be safe
    @patch('services.holdings_service.users_collection')
    def test_invalid_fund_name_returns_error(self, mock_users, mock_holdings_col, mock_read_excel, mock_get_candidates, mock_load_nse):
        
        # Import inside to make sure mocks are active if needed (though patch handles it usually for validation)
        from services.holdings_service import HoldingsService
        service = HoldingsService()

        # 1. Setup Mock Excel Data
        # The service expects specific columns or header search. 
        # Let's provide a DataFrame that passes the validation logic.
        # Logic looks for ISIN and Name columns.
        data = {
            'ISIN': ['INF209KA12Z1'], # valid format
            'Scheme Name': ['Test Scheme'],
            'Net Assets %': ['100.00']
        }
        df_mock = pd.DataFrame(data)
        mock_read_excel.return_value = df_mock
        
        # 2. Mock NSE Utils
        mock_load_nse.return_value = {'INF209KA12Z1': "TESTSYMBOL"} # So it resolves tickers
        
        # 3. Mock Candidates -> EMPTY LIST (The Test Case)
        mock_get_candidates.return_value = []
        
        # 4. Mock File Input
        mock_file = MagicMock()
        
        # 5. Run Method
        fund_name = "Completely Random Invalid Name"
        print(f"\nRunning test with fund_name: '{fund_name}'...")
        
        result = service.process_and_save_holdings(
            fund_name=fund_name,
            excel_file=mock_file,
            user_id="dummy_user_id"
        )
        
        # 6. Verify Results
        print("Result:", result)
        
        self.assertIsInstance(result, dict)
        self.assertIn("error", result)
        self.assertIn("Could not find any schemes matching", result["error"])
        
        print("SUCCESS: Validation logic blocked the valid file because of invalid fund name.")

if __name__ == '__main__':
    unittest.main()
