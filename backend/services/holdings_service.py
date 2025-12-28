import pandas as pd
import csv
import requests
import os
import re
import time
from io import StringIO
from bson import ObjectId
from db import holdings_collection, users_collection
from typing import List, Optional
import difflib

from datetime import datetime
from utils.common import NSE_HEADERS, NSE_CSV_URL, FYERS_BSE_CM_URL
from utils.date_utils import format_date_for_api, parse_date_from_str, get_current_ist_time
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from core.logging import get_logger

logger = get_logger("HoldingsService")

# Dev-only debug logging - set to True to enable
DEBUG_HOLDINGS = os.getenv("DEBUG_HOLDINGS", "false").lower() == "true"

session = requests.Session()
session.headers.update(NSE_HEADERS)

_FYERS_BSE_ISIN_MAP = None  # type: Optional[dict]
_FYERS_BSE_ISIN_MAP_LOADED_AT = 0.0
_FYERS_BSE_ISIN_MAP_TTL_SECONDS = 24 * 60 * 60
_ISIN_RE = re.compile(r"\b[A-Z0-9]{12}\b")


def _extract_fyers_symbol(line: str, exchange_prefix: str) -> Optional[str]:
    idx = line.find(f"{exchange_prefix}:")
    if idx < 0:
        return None
    end = line.find(",", idx)
    if end < 0:
        end = len(line)
    sym = line[idx:end].strip()
    return sym or None


def load_fyers_bse_isin_map(force: bool = False) -> dict:
    """Loads a mapping of ISIN -> FYERS BSE symbol (e.g., 'BSE:SBICARD-A').

    Uses FYERS public BSE symbol master file and caches it in-memory.
    """
    global _FYERS_BSE_ISIN_MAP, _FYERS_BSE_ISIN_MAP_LOADED_AT

    now = time.time()
    if (
        not force
        and _FYERS_BSE_ISIN_MAP is not None
        and (now - _FYERS_BSE_ISIN_MAP_LOADED_AT) < _FYERS_BSE_ISIN_MAP_TTL_SECONDS
    ):
        return _FYERS_BSE_ISIN_MAP

    mapping: dict = {}
    try:
        with requests.get(FYERS_BSE_CM_URL, stream=True, timeout=30) as r:
            r.raise_for_status()
            for raw in r.iter_lines(decode_unicode=True):
                if not raw:
                    continue
                line = raw.strip()
                if "BSE:" not in line:
                    continue

                m = _ISIN_RE.search(line)
                if not m:
                    continue
                isin = m.group(0).upper()

                sym = _extract_fyers_symbol(line, "BSE")
                if sym:
                    mapping[isin] = sym

        _FYERS_BSE_ISIN_MAP = mapping
        _FYERS_BSE_ISIN_MAP_LOADED_AT = now
        return mapping
    except Exception as e:
        logger.warning(f"Failed to load FYERS BSE symbol master: {e}")
        _FYERS_BSE_ISIN_MAP = {}
        _FYERS_BSE_ISIN_MAP_LOADED_AT = now
        return _FYERS_BSE_ISIN_MAP

def load_nse_csv():
    """Downloads and caches the NSE Equity Master List (CSV)."""
    url = NSE_CSV_URL
    try:
        r = session.get(url, timeout=20)
        f = StringIO(r.text)
        return list(csv.DictReader(f))
    except Exception as e:
        logger.error(f"Error downloading NSE CSV: {e}")
        return []

def isin_to_symbol_nse(isin, nse_table=None):
    """Resolves ISIN to NSE Symbol."""
    if not nse_table:
        nse_table = load_nse_csv()
    if not nse_table: return None
    
    headers = nse_table[0].keys()
    isin_col = next((col for col in headers if "isin" in col.lower().replace(" ", "")), None)
    symbol_col = next((col for col in headers if col.lower().strip() in ["symbol", "tradingsymbol", "sc_symbol"]), None)
    
    if not symbol_col: # Fallback
         symbol_col = next((col for col in headers if "symbol" in col.lower()), None)

    if not isin_col or not symbol_col: return None

    for row in nse_table:
        if row.get(isin_col, "").strip() == isin:
            return row.get(symbol_col)
    return None

def search_scheme_code(query):
    # DEPRECATED: Use get_scheme_candidates logic instead
    return None

def get_scheme_candidates(query):
    """Returns top matches with scores."""
    try:
        url = f"https://api.mfapi.in/mf/search?q={query}"
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
             data = response.json()
             if not data: return []
             
             # Scoring Logic
             def get_score(item):
                 name = item["schemeName"]
                 # Base similarity
                 ratio = difflib.SequenceMatcher(None, query.lower(), name.lower()).ratio()
                 
                 # Heuristics
                 if "Direct" in name: ratio += 0.05
                 if "Growth" in name: ratio += 0.05
                 if "Regular" in name: ratio -= 0.05
                 if "IDCW" in name or "Dividend" in name: ratio -= 0.05
                 
                 # Strict Penalty for 'Bonus' unless query has it
                 if "Bonus" in name and "Bonus" not in query: ratio -= 0.2
                 
                 return ratio

             # Calculate all scores
             scored = []
             for item in data:
                 s = get_score(item)
                 scored.append({"schemeCode": str(item["schemeCode"]), "schemeName": item["schemeName"], "score": s})
             
             # Sort desc
             scored.sort(key=lambda x: x["score"], reverse=True)
             return scored[:5] # Return top 5
    except Exception as e:
        logger.warning(f"Search error for '{query}': {e}")
    return []


def validate_excel_against_scheme(excel_file, scheme_name: str, threshold: float = 0.4) -> dict:
    """
    Validates that the uploaded Excel file matches the selected scheme.
    
    Extracts fund/scheme name from the first rows of the Excel file and 
    compares it against the official scheme_name using fuzzy matching.
    
    Args:
        excel_file: The uploaded Excel file object
        scheme_name: The official scheme name from MFAPI
        threshold: Minimum similarity score (0-1) to consider a match
    
    Returns:
        dict with keys:
            - is_valid: bool
            - extracted_name: str (what was found in Excel, if any)
            - similarity_score: float
            - warning: str (if mismatch detected)
    """
    if not scheme_name:
        return {"is_valid": True, "extracted_name": None, "similarity_score": 1.0, "warning": None}
    
    try:
        # Read first 20 rows to find scheme name (before data header)
        excel_file.file.seek(0)
        df_header = pd.read_excel(excel_file.file, header=None, nrows=20)
        excel_file.file.seek(0)  # Reset for subsequent reads
        
        # Common fund house keywords to help identify scheme name rows
        fund_houses = ["HDFC", "SBI", "ICICI", "AXIS", "NIPPON", "KOTAK", "TATA", "ADITYA BIRLA", 
                      "UTI", "DSP", "FRANKLIN", "MIRAE", "MOTILAL", "PARAG PARIKH", "QUANT",
                      "INVESCO", "BANDHAN", "EDELWEISS", "CANARA", "SUNDARAM", "L&T", "IDFC"]
        
        # Keywords that indicate scheme name cells
        scheme_keywords = ["FUND", "SCHEME", "DIRECT", "GROWTH", "REGULAR", "PLAN", "IDCW"]
        
        extracted_candidates = []
        
        # Scan all cells in the first 20 rows
        for idx, row in df_header.iterrows():
            for cell in row:
                if pd.isna(cell):
                    continue
                    
                cell_str = str(cell).strip()
                
                # Skip very short or very long strings
                if len(cell_str) < 10 or len(cell_str) > 200:
                    continue
                
                cell_upper = cell_str.upper()
                
                # Check if this cell might contain a scheme name
                has_fund_house = any(fh in cell_upper for fh in fund_houses)
                has_scheme_keyword = any(kw in cell_upper for kw in scheme_keywords)
                
                if has_fund_house or has_scheme_keyword:
                    # Score based on similarity to the expected scheme name
                    ratio = difflib.SequenceMatcher(None, scheme_name.lower(), cell_str.lower()).ratio()
                    extracted_candidates.append({
                        "text": cell_str,
                        "score": ratio,
                        "row": idx
                    })
        
        # Sort by score descending
        extracted_candidates.sort(key=lambda x: x["score"], reverse=True)
        
        if not extracted_candidates:
            # No scheme name found in Excel - might be an unusual format
            # Allow upload but with a note
            return {
                "is_valid": True,
                "extracted_name": None,
                "similarity_score": 0.0,
                "warning": "Could not extract fund name from Excel. Please verify the file is correct."
            }
        
        # Take the best match
        best_match = extracted_candidates[0]
        extracted_name = best_match["text"]
        similarity_score = best_match["score"]
        
        # Check if it matches
        if similarity_score >= threshold:
            return {
                "is_valid": True,
                "extracted_name": extracted_name,
                "similarity_score": similarity_score,
                "warning": None
            }
        else:
            # Low match - potential mismatch
            return {
                "is_valid": False,
                "extracted_name": extracted_name,
                "similarity_score": similarity_score,
                "warning": f"Excel appears to be for '{extracted_name}' but you selected '{scheme_name}'. Please verify or upload the correct file."
            }
            
    except Exception as e:
        logger.warning(f"Excel validation error: {e}")
        # Don't block upload on validation errors - just warn
        return {
            "is_valid": True,
            "extracted_name": None,
            "similarity_score": 0.0,
            "warning": f"Could not validate Excel: {str(e)}"
        }


# --- Step-Up SIP Logic (State-Based) ---

def months_between(date1, date2):
    """Calculate months between two dates. Returns positive if date2 > date1."""
    if isinstance(date1, str):
        date1 = parse_date_from_str(date1).date()
    if isinstance(date2, str):
        date2 = parse_date_from_str(date2).date()
    return (date2.year - date1.year) * 12 + (date2.month - date1.month)


def apply_stepup_if_due(current_amount, last_stepup_date, today,
                        stepup_type, stepup_value, stepup_frequency):
    """
    Apply step-up ONCE per cycle if due. Never catch up missed periods.
    
    Returns: (new_amount, new_last_stepup_date)
    """
    if not stepup_value or stepup_value <= 0:
        return current_amount, last_stepup_date

    freq_map = {"Annual": 12, "Half-Yearly": 6, "Quarterly": 3}
    required_months = freq_map.get(stepup_frequency, 12)
    
    # Parse dates
    if isinstance(last_stepup_date, str):
        last_stepup_dt = parse_date_from_str(last_stepup_date).date()
    else:
        last_stepup_dt = last_stepup_date
        
    if isinstance(today, str):
        today_dt = parse_date_from_str(today).date()
    else:
        today_dt = today
    
    months_elapsed = months_between(last_stepup_dt, today_dt)
    
    if months_elapsed < required_months:
        return current_amount, last_stepup_date  # Not due yet
    
    # Apply step-up ONCE
    if stepup_type == "percentage":
        new_amount = current_amount * (1 + stepup_value / 100)
    else:  # fixed amount
        new_amount = current_amount + stepup_value
    
    # Round to 2 decimal places
    new_amount = round(new_amount, 2)
    
    return new_amount, format_date_for_api(today_dt)


# --- Main Service Class ---

class HoldingsService:
    @staticmethod
    def generate_installment_dates(start_date_str, sip_day, has_manual_amount=True):
        """
        Generates a list of installment dates from start_date up to Today.
        
        If has_manual_amount is True (user provided 'Till Upload' amount):
        - Past installments are marked ASSUMED_PAID (already covered)
        - Only current month's installment (if date has passed) is PENDING
        
        Returns a list of dicts: { "date": "DD-MM-YYYY", "status": "PENDING"|"ASSUMED_PAID" }
        """
        try:
            start_dt = parse_date_from_str(start_date_str).date()
            today = get_current_ist_time().date()
            current_month_start = today.replace(day=1)
            
            installments = []
            current_dt = start_dt
            
            # First installment (Start Date) - only if not in the future
            if current_dt <= today:
                installments.append(current_dt)
            
            # Subsequent installments - move to next month's sip_day
            next_month = current_dt + relativedelta(months=1)
            try:
                current_dt = next_month.replace(day=sip_day)
            except ValueError:
                current_dt = next_month + relativedelta(day=31)

            while current_dt <= today:
                installments.append(current_dt)
                
                next_month = current_dt.replace(day=1) + relativedelta(months=1)
                try:
                    current_dt = next_month.replace(day=sip_day)
                except ValueError:
                    current_dt = next_month + relativedelta(day=31)

            results = []
            for d in installments:
                # Determine status based on whether it's current month or past
                if has_manual_amount and d < current_month_start:
                    # Past month installments - covered by "Till Upload" amount
                    status = "ASSUMED_PAID"
                else:
                    # Current month or newer - needs user confirmation
                    status = "PENDING"
                
                results.append({
                    "date": format_date_for_api(d),
                    "status": status
                })
            
            return results
            
        except Exception as e:
            logger.error(f"Error generating installments: {e}")
            return []

    @staticmethod
    def _is_portfolio_stale(upload_date: datetime) -> bool:
        """
        Determines if a portfolio is stale based on SEBI's 10-day monthly disclosure rule.
        Rule: On the 11th of Month M, we expect an upload from Month M.
        """
        if not upload_date: return True
        
        now = datetime.utcnow() # Using UTC for consistency
        cutoff_day = 10
        
        if now.day > cutoff_day:
            # Past the 10th: Must have upload from CURRENT month
            return not (upload_date.month == now.month and upload_date.year == now.year)
        else:
            # Before the 10th: Upload from CURRENT OR PREVIOUS month is fine
            # Check if upload is from current month
            if upload_date.month == now.month and upload_date.year == now.year:
                return False
                
            # Check if upload is from previous month
            first_of_this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            last_month_end = first_of_this_month - timedelta(days=1)
            
            return not (upload_date.month == last_month_end.month and upload_date.year == last_month_end.year)

    @staticmethod
    def list_funds(user_id):
        cursor = holdings_collection.find({"user_id": user_id}, {"fund_name": 1, "invested_amount": 1, "invested_date": 1, "scheme_code": 1, "nickname": 1, "created_at": 1, "investment_type": 1})
        funds = []
        for doc in cursor:
            created_at = doc.get("created_at")
            is_stale = HoldingsService._is_portfolio_stale(created_at)
            
            funds.append({
                "id": str(doc["_id"]),
                "fund_name": doc.get("fund_name"),
                "invested_amount": doc.get("invested_amount"),
                "invested_date": doc.get("invested_date"),
                "scheme_code": doc.get("scheme_code"),
                "nickname": doc.get("nickname"),
                "is_stale": is_stale,
                "created_at": format_date_for_api(created_at) if created_at else None,
                "investment_type": doc.get("investment_type", "lumpsum")
            })
        return funds

    @staticmethod
    def get_holdings(fund_id_str, user_id):
        try:
            doc = holdings_collection.find_one({"_id": ObjectId(fund_id_str)})
            if doc and doc.get("user_id") == user_id:
                # Add stale status to single view as well if needed
                doc["is_stale"] = HoldingsService._is_portfolio_stale(doc.get("created_at"))
                return doc
            return None
        except:
            return None

    @staticmethod
    def delete_fund(fund_id_str, user_id):
        try:
            res = holdings_collection.delete_one({"_id": ObjectId(fund_id_str), "user_id": user_id})
            if res.deleted_count > 0:
                # Remove from user's uploads
                users_collection.update_one(
                    {"_id": ObjectId(user_id)},
                    {"$pull": {"uploads": {"holding_id": fund_id_str}}}
                )
                return True
            return False
        except:
            return False

    @staticmethod
    def update_fund_scheme(fund_id_str, user_id, new_scheme_code, new_scheme_name=None):
        try:
            update_data = {"scheme_code": new_scheme_code}
            # Optionally update nickname or metadata if needed, for now just code
            res = holdings_collection.update_one(
                {"_id": ObjectId(fund_id_str), "user_id": user_id},
                {"$set": update_data}
            )
            return res.modified_count > 0
        except Exception as e:
            logger.error(f"Update fund scheme failed: {e}")
            return False

    @staticmethod
    def process_and_save_holdings(
        fund_name, excel_file, user_id, scheme_code=None, 
        invested_amount=None, invested_date=None, nickname=None,
        investment_type="lumpsum", sip_amount=0.0, sip_day=None, manual_total_units=0.0,
        manual_invested_amount=0.0,
        # Step-Up SIP Config
        stepup_enabled=False, stepup_type="percentage", stepup_value=None, stepup_frequency="Annual",
        # Detailed SIP Mode
        sip_mode="simple", detailed_installments=None,
        # CAS Cost Value (includes stamp duty)
        cas_cost_value=None
    ):
        # 1. Read Excel
        try:
            df_raw = pd.read_excel(excel_file.file, header=None)
        except Exception as e:
            return {"error": f"Failed to read Excel: {str(e)}"}

        # 2. Find Header (Robust)
        header_idx = None
        
        # Scan first 50 rows only to find the header
        # We look for a row that contains ISIN and some form of name/description column
        for idx, row in df_raw.head(50).iterrows():
            row_str = row.astype(str).str.upper().tolist()
            
            # ISIN detection - be flexible
            has_isin = any(
                "ISIN" in x.strip() 
                for x in row_str if isinstance(x, str)
            )
            
            # Name detection - many possible headers
            name_indicators = [
                "NAME", "INSTRUMENT", "ISSUER", "SECURITY", "COMPANY", 
                "DESCRIPTION", "SCHEME", "STOCK", "SCRIP", "PARTICULARS"
            ]
            has_name = any(
                any(indicator in x.strip() for indicator in name_indicators)
                for x in row_str if isinstance(x, str)
            )
            
            # Weight detection - for additional confidence
            weight_indicators = ["%", "WEIGHT", "AUM", "ALLOCATION", "ASSET"]
            has_weight = any(
                any(indicator in x.strip() for indicator in weight_indicators)
                for x in row_str if isinstance(x, str)
            )
            
            # Best case: has all three
            if has_isin and has_name and has_weight:
                header_idx = idx
                break
            # Good case: has ISIN and name
            elif has_isin and has_name:
                header_idx = idx
                break
        
        if header_idx is None:
            # Fallback: Just look for ISIN + weight (name might be optional)
            for idx, row in df_raw.head(50).iterrows():
                row_str = row.astype(str).str.upper().tolist()
                has_isin = any("ISIN" in x for x in row_str if isinstance(x, str))
                has_weight = any(
                    any(ind in x for ind in ["%", "WEIGHT", "AUM"])
                    for x in row_str if isinstance(x, str)
                )
                if has_isin and has_weight:
                    header_idx = idx
                    break
        
        if header_idx is None:
            # Last resort: Just look for ISIN
            for idx, row in df_raw.head(50).iterrows():
                row_str = row.astype(str).str.upper().tolist()
                if any("ISIN" in x for x in row_str if isinstance(x, str)):
                    header_idx = idx
                    break
        
        if header_idx is None:
            return {"error": "Could not detect header row. Ensure file has 'ISIN' column. Optional: 'Name/Instrument' and 'Weight/% to AUM' columns."}

        excel_file.file.seek(0)
        df = pd.read_excel(excel_file.file, header=header_idx)

        # 3. Normalize Columns (ROBUST DETECTION)
        col_map = {}
        isin_found = False
        name_found = False
        weight_found = False
        
        for col in df.columns:
            c = str(col).strip().upper()
            
            # ISIN Detection (various formats)
            if not isin_found:
                if "ISIN" in c or c in ["ISIN", "ISIN CODE", "ISIN NO", "ISIN NUMBER"]:
                    col_map[col] = "ISIN"
                    isin_found = True
                    continue
            
            # Name Detection (flexible - many possible column names)
            if not name_found:
                name_keywords = ["INSTRUMENT", "ISSUER", "COMPANY", "SECURITY", "STOCK", "SCHEME", "FUND"]
                # Check if column contains NAME + any keyword, OR just is a name-like column
                if "NAME" in c:
                    # Has "NAME" - check if it's combined with a keyword or standalone
                    if any(kw in c for kw in name_keywords) or c in ["NAME", "SCHEME NAME", "FUND NAME", "SECURITY NAME", "COMPANY NAME"]:
                        col_map[col] = "Name"
                        name_found = True
                        continue
                # Also check for standalone keywords that likely mean name
                elif c in ["DESCRIPTION", "SCRIP", "SCRIPT", "PARTICULARS"]:
                    col_map[col] = "Name"
                    name_found = True
                    continue
                # Handle columns like "Name of the Instrument / Issuer"
                elif any(kw in c for kw in ["INSTRUMENT", "ISSUER"]) and ("NAME" in c or "OF THE" in c):
                    col_map[col] = "Name"
                    name_found = True
                    continue
            
            # Weight/Allocation Detection (very flexible - handles many formats)
            if not weight_found:
                # Check for percentage-based columns
                weight_keywords = ["AUM", "ASSET", "NAV", "WEIGHT", "ALLOCATION", "HOLDING", "PORTFOLIO"]
                
                if "%" in c:
                    # Has % symbol - likely a weight column
                    for kw in weight_keywords:
                        if kw in c:
                            col_map[col] = "Weight"
                            weight_found = True
                            break
                    # Also accept "% TO AUM", "% OF AUM", etc.
                    if not weight_found and ("TO" in c or "OF" in c):
                        col_map[col] = "Weight"
                        weight_found = True
                    # Last resort - any column with just "%" and looks like weight
                    if not weight_found and ("WEIGHT" in c or "ALLOC" in c):
                        col_map[col] = "Weight"
                        weight_found = True
                
                # Handle columns without % symbol but clearly weight-related
                if not weight_found:
                    if c in ["WEIGHT", "WEIGHTAGE", "ALLOCATION", "PORTFOLIO WEIGHT", "% TO AUM", "AUM %"]:
                        col_map[col] = "Weight"
                        weight_found = True
                    elif ("WEIGHT" in c or "ALLOC" in c) and "NET" not in c:  # Avoid "Net Asset" columns
                        col_map[col] = "Weight"
                        weight_found = True
        
        df = df.rename(columns=col_map)
        
        # Better error message showing what we found and what's missing
        missing = []
        if "ISIN" not in df.columns:
            missing.append("ISIN")
        if "Weight" not in df.columns:
            missing.append("Weight (% to AUM or similar)")
        
        if missing:
            return {"error": f"Missing required columns: {missing}. Found columns: {[str(c) for c in df.columns.tolist()]}"}
        
        # 4. Clean Data
        count_before_dropna = len(df)
        df = df.dropna(subset=["ISIN"])
        count_after_dropna = len(df)
        
        df["ISIN"] = df["ISIN"].astype(str).str.strip().str.upper()
        
        # Track invalid ISINs before filtering
        invalid_isin_mask = ~df["ISIN"].str.match(r'^[A-Z0-9]{12}$', na=False)
        invalid_isins = df[invalid_isin_mask][["ISIN", "Name"]].to_dict('records') if "Name" in df.columns else df[invalid_isin_mask]["ISIN"].tolist()
        
        df = df[df["ISIN"].str.match(r'^[A-Z0-9]{12}$', na=False)]
        count_after_isin_filter = len(df)
        
        # Track duplicates before removing
        duplicates = df[df.duplicated(subset=["ISIN"], keep="first")][["ISIN", "Name"]].to_dict('records') if "Name" in df.columns else []
        
        df = df.drop_duplicates(subset=["ISIN"], keep="first")
        count_after_dedup = len(df)
        
        # DEBUG LOGGING
        if DEBUG_HOLDINGS:
            logger.info(f"=== HOLDINGS DEBUG: {fund_name} ===")
            logger.info(f"  Rows after header parse: {count_before_dropna}")
            logger.info(f"  After dropna(ISIN): {count_after_dropna} (dropped {count_before_dropna - count_after_dropna})")
            logger.info(f"  After ISIN format filter: {count_after_isin_filter} (dropped {count_after_dropna - count_after_isin_filter})")
            if invalid_isins:
                logger.info(f"  Invalid ISINs removed: {invalid_isins[:10]}{'...' if len(invalid_isins) > 10 else ''}")
            logger.info(f"  After dedup: {count_after_dedup} (dropped {count_after_isin_filter - count_after_dedup} duplicates)")
            if duplicates:
                logger.info(f"  Duplicates removed: {duplicates[:5]}{'...' if len(duplicates) > 5 else ''}")
        
        def clean_weight(val):
            try:
                if pd.isna(val): return 0.0
                s = str(val).strip().replace("%", "")
                return float(s)
            except: return 0.0
            
        df["Weight"] = df["Weight"].apply(clean_weight)

        # 5. Resolve Tickers (NSE first, then FYERS BSE fallback)
        nse_source = load_nse_csv()
        holdings_list = []
        unresolved = []
        zero_weight_skipped = []

        resolved_nse = 0
        resolved_bse = 0
        bse_isin_map = None

        for _, row in df.iterrows():
            isin = row["ISIN"]
            name = row.get("Name", "Unknown")
            weight = float(row["Weight"])
            if weight <= 0:
                zero_weight_skipped.append(f"{name} ({isin})")
                continue
            
            ticker = isin_to_symbol_nse(isin, nse_table=nse_source)
            if ticker:
                holdings_list.append({"ISIN": isin, "Name": name, "Symbol": ticker, "Weight": weight})
                resolved_nse += 1
            else:
                if bse_isin_map is None:
                    bse_isin_map = load_fyers_bse_isin_map()

                bse_symbol = (bse_isin_map or {}).get(isin)
                if bse_symbol:
                    # Store fully-qualified FYERS symbol so downstream quotes work (e.g., BSE:SBICARD-A)
                    holdings_list.append({"ISIN": isin, "Name": name, "Symbol": bse_symbol, "Weight": weight})
                    resolved_bse += 1
                else:
                    unresolved.append(f"{name} ({isin})")
        
        # DEBUG LOGGING - Final Summary
        if DEBUG_HOLDINGS:
            logger.info(f"  === TICKER RESOLUTION ===")
            logger.info(f"  Resolved via NSE master: {resolved_nse}")
            logger.info(f"  Resolved via BSE fallback: {resolved_bse}")
            logger.info(f"  Total resolved: {len(holdings_list)}")
            logger.info(f"  Zero weight skipped: {len(zero_weight_skipped)}")
            if zero_weight_skipped:
                logger.info(f"    Skipped: {zero_weight_skipped[:5]}{'...' if len(zero_weight_skipped) > 5 else ''}")
            logger.info(f"  Unresolved (no NSE/BSE symbol): {len(unresolved)}")
            if unresolved:
                logger.info(f"    Unresolved: {unresolved[:10]}{'...' if len(unresolved) > 10 else ''}")
            logger.info(f"  === FINAL: {len(holdings_list)} holdings saved ===")
        
        if not holdings_list:
            return {"error": "No valid holdings resolved."}

        # 5.5 Auto-lookup Scheme Code if missing
        candidates = []
        if not scheme_code:
            logger.info(f"Scheme code not provided for '{fund_name}'. Attempting auto-lookup...")
            candidates = get_scheme_candidates(fund_name)
            
            if not candidates:
                return {"error": f"Could not find any schemes matching '{fund_name}'. Please verify the fund name."}

            if candidates:
                top = candidates[0]
                # improved auto-selection logic
                # If very high score > 0.9 or (gap between 1st and 2nd is large > 0.1)
                is_confident = False
                if len(candidates) == 1:
                    is_confident = top["score"] > 0.5
                else:
                    second = candidates[1]
                    gap = top["score"] - second["score"]
                    # Increased threshold to be more conservative and ask user more often
                    # Previously gap > 0.1, now 0.25.
                    if top["score"] > 0.9 or gap > 0.25:
                        is_confident = True
                
                if is_confident:
                    scheme_code = top["schemeCode"]
                    logger.info(f"Auto-selected scheme: {top['schemeName']} (Score: {top['score']:.2f})")
                else:
                    logger.info(f"Ambiguous match. Top: {top['schemeName']} ({top['score']:.2f}). Returning candidates.")
                    # Leave scheme_code as None
            else:
                logger.warning(f"Could not find scheme code for '{fund_name}'")

        # 6. Save to DB (Strict Schema)
        from models.db_schemas import HoldingsDocument, HoldingItem, SIPInstallment
        from datetime import datetime

        
        # Validated List
        validated_holdings = []
        for h in holdings_list:
             validated_holdings.append(HoldingItem(**h))

        
        # SIP Logic Check
        sip_installments = []
        final_invested_amount = invested_amount
        future_sip_units = 0.0 # Initially zero for a fresh upload
        
        if investment_type == "sip":
            if sip_mode == "detailed" and detailed_installments:
                # DETAILED MODE: Use pre-populated installments from CAS or manual entry
                # All detailed installments are already PAID with known units
                # CAS amounts ARE the invested amounts (stamp duty is implicit, units adjusted)
                total_detailed_invested = 0.0
                total_detailed_units = 0.0
                
                for inst_data in detailed_installments:
                    inst = SIPInstallment(
                        date=inst_data["date"],
                        amount=inst_data["amount"],
                        units=inst_data.get("units"),
                        nav=inst_data.get("nav"),
                        status="PAID",  # All detailed installments are confirmed
                        allocation_status="CONFIRMED" if inst_data.get("units") else "PENDING_NAV",
                        is_estimated=False  # From CAS/manual = confirmed data
                    )
                    sip_installments.append(inst)
                    
                    # Sum raw CAS amounts (stamp duty is implicit, already reflected in units)
                    total_detailed_invested += float(inst_data["amount"])
                    
                    if inst_data.get("units"):
                        total_detailed_units += float(inst_data["units"])
                
                # For detailed mode: 
                # - manual_invested_amount = 0 (all is in detailed installments)
                # - future_sip_units = total from detailed installments
                # - manual_total_units = total from detailed installments (for P&L calc)
                
                # Use CAS's exact cost_value if provided (most accurate - includes stamp duty)
                # Otherwise use sum of raw transaction amounts
                if cas_cost_value is not None and cas_cost_value > 0:
                    final_invested_amount = round(cas_cost_value, 2)
                else:
                    final_invested_amount = round(total_detailed_invested, 2)  # Calculated with stamp duty
                
                future_sip_units = total_detailed_units
                manual_total_units = total_detailed_units  # Override with actual units
                manual_invested_amount = 0.0  # All tracked via detailed installments
                
            else:
                # SIMPLE MODE: Generate Installments from dates (existing logic)
                has_manual = manual_invested_amount > 0
                dates_info = HoldingsService.generate_installment_dates(invested_date, sip_day, has_manual_amount=has_manual)
                
                # For SIP: invested_amount = manual (CAS) + future app-tracked
                # On initial upload, future_tracked = 0, so invested_amount = manual_invested_amount
                future_tracked_invested = 0.0
                
                for item in dates_info:
                    d_str = item["date"]
                    status = item["status"]  # ASSUMED_PAID for past, PENDING for current month
                    
                    inst = SIPInstallment(
                        date=d_str,
                        amount=sip_amount,
                        status=status
                    )
                    sip_installments.append(inst)
                
                # Total invested = CAS amount + app-tracked (0 on initial upload)
                final_invested_amount = manual_invested_amount + future_tracked_invested

        doc_data = {
            "fund_name": fund_name,
            "user_id": user_id,
            "scheme_code": scheme_code,
            "invested_amount": final_invested_amount,
            "invested_date": invested_date,
            "nickname": nickname,
            "holdings": validated_holdings,
            
            # SIP Fields
            "investment_type": investment_type,
            "sip_mode": sip_mode if investment_type == "sip" else "simple",
            "sip_amount": sip_amount,
            "sip_start_date": invested_date if investment_type == "sip" else None,
            "sip_frequency": "Monthly",
            "sip_day": sip_day,
            "manual_total_units": manual_total_units,
            "manual_invested_amount": manual_invested_amount if investment_type == "sip" else 0.0,
            "future_sip_units": future_sip_units,
            "sip_installments": sip_installments,
            
            # Step-Up SIP Config
            "stepup_enabled": stepup_enabled if investment_type == "sip" else False,
            "stepup_type": stepup_type if stepup_enabled else "percentage",
            "stepup_value": stepup_value if stepup_enabled else None,
            "stepup_frequency": stepup_frequency if stepup_enabled else "Annual",
            
            # Step-Up State (Source of Truth)
            "current_sip_amount": sip_amount if investment_type == "sip" else None,
            "last_stepup_applied_on": invested_date if (investment_type == "sip" and stepup_enabled) else None,
            
            "last_updated": True,
            "created_at": datetime.utcnow()
        }
        
        # Validate entire document
        # If this fails, it means we have bad internal data logic
        try:
             doc_model = HoldingsDocument(**doc_data)
        except Exception as e:
             return {"error": f"Schema Validation Failed: {e}"}

        # Upsert
        query = {
            "fund_name": fund_name,
            "user_id": user_id,
            # For SIP, uniqueness is just fund_name + user for now to allow updates.
            # But the logic below includes amount/date in query which separates different investments in same fund.
            # We should probably keep this behavior but be careful.
            "invested_date": invested_date, 
            "investment_type": investment_type
        }
        # If Lumpsum, also match amount to differentiate multiple lumpsums
        if investment_type == "lumpsum":
             query["invested_amount"] = invested_amount
        # If SIP, sip details differentiate? Just assume one SIP per Fund/Date for now for simplicity

        # Dump model to dict for Mongo
        holdings_collection.update_one(query, {"$set": doc_model.dict()}, upsert=True)
        
        # Fetch the ID
        saved_doc = holdings_collection.find_one(query)
        saved_id = str(saved_doc["_id"]) if saved_doc else None

        # Update User's Uploads List
        if saved_id:
             # Remove existing reference to this holding if any (to avoid duplicates/stale data)
             users_collection.update_one(
                 {"_id": ObjectId(user_id)},
                 {"$pull": {"uploads": {"holding_id": saved_id}}}
             )
             
             # Push new reference
             upload_entry = {
                 "holding_id": saved_id,
                 "fund_name": fund_name,
                 "invested_date": invested_date,
                 "uploaded_at": datetime.utcnow()
             }
             users_collection.update_one(
                 {"_id": ObjectId(user_id)},
                 {"$push": {"uploads": upload_entry}}
             )

        return {
            "message": f"Holdings saved for {fund_name}",
            "count": len(holdings_list),
            "unresolved_count": len(unresolved),
            "id": saved_id,
            "candidates": candidates if not scheme_code else None, # Return candidates if still ambiguous
            "requires_selection": True if (not scheme_code and candidates) else False
        }

    def handle_sip_action(self, fund_id, user_id, date_str, action):
        """
        Updates the status of a specific SIP installment.
        If PAID, calculates units based on NAV and adds to future_sip_units.
        """
        try:
            doc = holdings_collection.find_one({"_id": ObjectId(fund_id), "user_id": user_id})
            if not doc:
                return {"error": "Fund not found"}
            
            installments = doc.get("sip_installments", [])
            sip_amount = float(doc.get("sip_amount", 0) or 0)
            scheme_code = doc.get("scheme_code")
            
            updated = False
            for inst in installments:
                if inst["date"] == date_str:
                    old_status = inst.get("status")
                    if old_status == action: 
                         return {"message": "No change needed", "status": action}
                         
                    inst["status"] = action
                    updated = True
                    
                    if action == "PAID":
                        # User confirmed payment - invested_amount will be updated below
                        # Now check if NAV is available for unit allocation
                        from services.nav_service import nav_service  # Local import to avoid circular dep
                        from utils.date_utils import parse_date_from_str, get_current_ist_time
                        
                        # Get the next official NAV on or after the SIP date
                        nav_res = nav_service.get_next_nav_after_date(scheme_code, date_str)
                        
                        if nav_res:
                            nav = nav_res[0]
                            nav_date_used = nav_res[1] if len(nav_res) > 1 else None
                            
                            # Check if this NAV is actually from the SIP date or later
                            # (not from before, which would mean NAV API returned old data)
                            try:
                                sip_date = parse_date_from_str(date_str).date()
                                used_date = parse_date_from_str(nav_date_used).date() if nav_date_used else None
                                
                                if used_date and used_date >= sip_date:
                                    # NAV is available for this SIP date or later
                                    # Calculate units - marked as ESTIMATED (T+1 settlement)
                                    units = sip_amount / nav
                                    inst["units"] = units
                                    inst["nav"] = nav
                                    inst["nav_date"] = nav_date_used
                                    inst["allocation_status"] = "ESTIMATED"
                                    inst["is_estimated"] = True
                                else:
                                    # NAV is from before SIP date - units pending
                                    inst["units"] = None
                                    inst["nav"] = None
                                    inst["nav_date"] = None
                                    inst["allocation_status"] = "PENDING_NAV"
                                    inst["is_estimated"] = False
                            except:
                                # Date parsing failed - treat as pending
                                inst["units"] = None
                                inst["nav"] = None
                                inst["allocation_status"] = "PENDING_NAV"
                                inst["is_estimated"] = False
                        else:
                            # No NAV available at all - units pending
                            inst["units"] = None
                            inst["nav"] = None
                            inst["nav_date"] = None
                            inst["allocation_status"] = "PENDING_NAV"
                            inst["is_estimated"] = False
                            
                    elif action == "SKIPPED":
                        inst["units"] = None
                        inst["nav"] = None
                        inst["nav_date"] = None
                        inst["allocation_status"] = "PENDING_NAV"  # Not applicable but safe default
                    
                    break
            
            if not updated:
                return {"error": "Installment for date not found"}
            
            # Recalculate Totals
            # INVESTED AMOUNT: All PAID installments add to invested (money is gone)
            # UNITS: Only installments with allocated units (not None) count
            # ASSUMED_PAID does not add to invested_amount (already in manual)
            manual_invested = float(doc.get("manual_invested_amount", 0) or 0)
            total_tracked_invested = 0.0
            total_future_units = 0.0
            has_pending_nav = False  # Track if any installment is waiting for NAV
            
            for inst in installments:
                if inst["status"] == "PAID":
                    # Invested amount always includes confirmed SIPs
                    total_tracked_invested += float(inst.get("amount", 0))
                    
                    # Units only count if they're allocated (not None)
                    units_val = inst.get("units")
                    if units_val is not None:
                        total_future_units += float(units_val)
                    else:
                        has_pending_nav = True
            
            # Total invested = manual (CAS) + app-tracked (confirmed)
            total_invested = manual_invested + total_tracked_invested
            
            holdings_collection.update_one(
                {"_id": ObjectId(fund_id)},
                {
                    "$set": {
                        "sip_installments": installments,
                        "invested_amount": total_invested,
                        "future_sip_units": total_future_units,
                        "last_updated": True
                    }
                }
            )
            
            return {"message": "SIP Action Recorded", "status": action}
            
        except Exception as e:
            logger.error(f"Error handling SIP action: {e}")
            return {"error": str(e)}

holdings_service = HoldingsService()
