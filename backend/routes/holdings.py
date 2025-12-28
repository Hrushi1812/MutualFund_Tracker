from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from services.holdings_service import holdings_service, validate_excel_against_scheme
from services.nav_service import nav_service
from services.cas_service import cas_service
from services.auth_service import AuthService
from routes.auth import get_current_user

router = APIRouter(tags=["Holdings"])

@router.get("/funds/")
def view_funds(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    return {"funds_available": holdings_service.list_funds(user_id)}

@router.delete("/funds/{fund_id}")
def remove_fund(fund_id: str, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    success = holdings_service.delete_fund(fund_id, user_id)
    if success:
        return {"message": f"Deleted fund {fund_id}"}
    return {"error": "Fund not found"}, 404

@router.post("/upload-holdings/")
async def upload(
    fund_name: str = Form(..., min_length=1),
    scheme_code: str = Form(None),
    scheme_name: str = Form(None),  # Official scheme name for validation
    file: UploadFile = File(...),
    invested_amount: str = Form(None), # Optional for SIP (derived) or Lumpsum
    invested_date: str = Form(...), # DD-MM-YYYY (Start Date for SIP)
    nickname: str = Form(None),
    skip_validation: str = Form("false"),  # Allow bypassing Excel validation
    # SIP Fields
    investment_type: str = Form("lumpsum"), # lumpsum, sip
    sip_amount: str = Form(None),
    sip_day: str = Form(None),
    total_units: str = Form(None),
    total_invested_amount: str = Form(None),  # CAS Invested Amount
    # Step-Up SIP Fields
    stepup_enabled: str = Form("false"),  # "true" or "false"
    stepup_type: str = Form("percentage"),  # "percentage" or "amount"
    stepup_value: str = Form(None),  # e.g., "10" for 10% or "500" for ₹500
    stepup_frequency: str = Form("Annual"),  # "Annual", "Half-Yearly", "Quarterly"
    # Detailed SIP Mode Fields
    sip_mode: str = Form("simple"),  # "simple" or "detailed"
    detailed_installments: str = Form(None),  # JSON array: [{ date, amount, units }]
    cas_cost_value: str = Form(None),  # CAS's Total Cost Value (includes stamp duty)
    current_user: dict = Depends(get_current_user)
):
    user_id = str(current_user["_id"])
    skip_validation_bool = skip_validation.lower() == "true"
    
    # 1. Validate File Type
    if not file.filename.lower().endswith(('.xls', '.xlsx')):
        raise HTTPException(400, "Invalid file format. Please upload an Excel file (.xls, .xlsx).")

    # 1.5 Validate Excel matches selected scheme (if scheme_name provided)
    validation_result = None
    if scheme_name and not skip_validation_bool:
        validation_result = validate_excel_against_scheme(file, scheme_name)
        
        # If validation failed and user hasn't acknowledged, return for confirmation
        if validation_result and not validation_result.get("is_valid", True):
            return {
                "validation_required": True,
                "validation_warning": validation_result.get("warning"),
                "extracted_fund_name": validation_result.get("extracted_name"),
                "expected_scheme_name": scheme_name,
                "similarity_score": validation_result.get("similarity_score", 0)
            }

    # 2. Validate Amount
    amount_float = 0.0
    if investment_type == "lumpsum":
        if not invested_amount or not invested_amount.strip():
            raise HTTPException(422, "Invested amount is required for Lumpsum.")
        try:
            amount_float = float(invested_amount)
            if amount_float <= 0: raise ValueError
        except:
             raise HTTPException(422, "Invested amount must be a positive number.")
             
    # 3. Validate SIP Fields
    sip_amount_float = 0.0
    sip_day_int = None
    manual_total_units_float = 0.0
    
    if investment_type == "sip":
        if not sip_amount or not sip_amount.strip():
             raise HTTPException(422, "SIP Amount is required.")
        try:
            sip_amount_float = float(sip_amount)
            if sip_amount_float <= 0: raise ValueError
        except:
             raise HTTPException(422, "SIP Amount must be positive.")
             
        if not sip_day or not sip_day.strip():
             raise HTTPException(422, "SIP Day is required.")
        try:
            sip_day_int = int(sip_day)
            if not (1 <= sip_day_int <= 31): raise ValueError
        except:
             raise HTTPException(422, "SIP Day must be between 1 and 31.")
        
        # Total Units (Optional but recommended)
        if total_units and total_units.strip():
             try:
                 manual_total_units_float = float(total_units)
             except:
                 pass # Ignore invalid units, default 0

        # Total Invested Amount from CAS (Mandatory for correct P&L)
        manual_invested_amount_float = 0.0
        if total_invested_amount and total_invested_amount.strip():
            try:
                manual_invested_amount_float = float(total_invested_amount)
            except:
                pass  # Ignore invalid, default 0

    # 4. Validate Date
    if not invested_date or not invested_date.strip():
        raise HTTPException(422, "Invested date is required.")
        
    # strict DD-MM-YYYY check
    import re
    if not re.match(r"^\d{2}-\d{2}-\d{4}$", invested_date):
            raise HTTPException(422, "Invalid date format. Use DD-MM-YYYY.")
    
    # 5. Parse Step-Up Fields (only for SIP)
    stepup_enabled_bool = False
    stepup_value_float = None
    stepup_type_str = "percentage"
    stepup_frequency_str = "Annual"
    
    if investment_type == "sip":
        stepup_enabled_bool = stepup_enabled.lower() == "true"
        
        if stepup_enabled_bool:
            stepup_type_str = stepup_type if stepup_type in ["percentage", "amount"] else "percentage"
            stepup_frequency_str = stepup_frequency if stepup_frequency in ["Annual", "Half-Yearly", "Quarterly"] else "Annual"
            
            if stepup_value and stepup_value.strip():
                try:
                    stepup_value_float = float(stepup_value)
                    if stepup_value_float <= 0:
                        raise HTTPException(422, "Step-up value must be positive.")
                except ValueError:
                    raise HTTPException(422, "Step-up value must be a valid number.")
            else:
                raise HTTPException(422, "Step-up value is required when step-up is enabled.")
    
    # 6. Parse Detailed Installments (for detailed SIP mode)
    import json
    parsed_detailed_installments = None
    sip_mode_str = "simple"
    
    if investment_type == "sip":
        sip_mode_str = sip_mode if sip_mode in ["simple", "detailed"] else "simple"
        
        if sip_mode_str == "detailed" and detailed_installments:
            try:
                parsed_detailed_installments = json.loads(detailed_installments)
                if not isinstance(parsed_detailed_installments, list):
                    raise ValueError("Must be a list")
                
                # Validate each installment
                for inst in parsed_detailed_installments:
                    if "date" not in inst or "amount" not in inst or "units" not in inst:
                        raise ValueError("Each installment must have date, amount, and units")
                    
                    # Ensure numeric values
                    inst["amount"] = float(inst["amount"])
                    inst["units"] = float(inst["units"])
                    inst["status"] = "PAID"  # Detailed installments are already paid
                    
            except json.JSONDecodeError:
                raise HTTPException(422, "Invalid detailed_installments format. Must be valid JSON.")
            except ValueError as e:
                raise HTTPException(422, f"Invalid detailed_installments: {str(e)}")
    
    # Parse CAS cost value (for detailed mode)
    cas_cost_value_float = None
    if cas_cost_value and cas_cost_value.strip():
        try:
            cas_cost_value_float = float(cas_cost_value)
        except:
            pass
    
    # Process
    manual_invested_for_service = manual_invested_amount_float if investment_type == "sip" else 0.0
    save_result = holdings_service.process_and_save_holdings(
        fund_name, file, user_id, scheme_code, amount_float, invested_date, nickname,
        investment_type, sip_amount_float, sip_day_int, manual_total_units_float, manual_invested_for_service,
        stepup_enabled=stepup_enabled_bool,
        stepup_type=stepup_type_str,
        stepup_value=stepup_value_float,
        stepup_frequency=stepup_frequency_str,
        sip_mode=sip_mode_str,
        detailed_installments=parsed_detailed_installments,
        cas_cost_value=cas_cost_value_float
    )
    
    if "error" in save_result:
         raise HTTPException(400, save_result["error"]) 

    analysis = None
        
    if save_result.get("id"):
        analysis = nav_service.calculate_pnl(save_result["id"], user_id, amount_float, invested_date)

    return {
        "upload_status": save_result,
        "analysis": analysis,
        "scheme_code_used": scheme_code
    }
from pydantic import BaseModel

class SchemeUpdate(BaseModel):
    scheme_code: str

@router.patch("/funds/{fund_id}/scheme")
def update_scheme(
    fund_id: str, 
    payload: SchemeUpdate,
    current_user: dict = Depends(get_current_user)
):
    user_id = str(current_user["_id"])
    success = holdings_service.update_fund_scheme(fund_id, user_id, payload.scheme_code)
    
    if not success:
         raise HTTPException(404, "Fund not found or update failed.")
         
    # Re-trigger analysis since we now have the correct code
    # We might need to fetch the doc again to get investment details
    # But NavService.calculate_pnl handles fetching doc by ID.
    
    # We intentionally pass None for investment/date to use stored values
    analysis = nav_service.calculate_pnl(fund_id, user_id)
    
    return {
        "message": "Scheme updated successfully",
        "analysis": analysis
    }

from models.db_schemas import SIPAction

@router.post("/funds/{fund_id}/sip-action")
def sip_action(
    fund_id: str,
    payload: SIPAction,
    current_user: dict = Depends(get_current_user)
):
    user_id = str(current_user["_id"])
    result = holdings_service.handle_sip_action(fund_id, user_id, payload.date, payload.action)
    
    if "error" in result:
        raise HTTPException(400, result["error"])
        
    return result


# ============================================================
# CAS PARSING ENDPOINT (for Detailed SIP Mode)
# ============================================================

@router.post("/parse-cas/")
async def parse_cas(
    file: UploadFile = File(...),
    password: str = Form(...),
    scheme_filter: str = Form(None),  # Optional: filter by scheme name
    current_user: dict = Depends(get_current_user)
):
    """
    Parse a CAS PDF and return list of schemes with transactions.
    
    For detailed SIP mode - allows users to import full transaction history
    for accurate XIRR calculation.
    
    Returns:
        - investor_info: Name, email, PAN, statement period
        - schemes: List of schemes with transaction counts
        - transactions: If scheme_filter provided, returns transactions for that scheme
    """
    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(400, "Invalid file format. Please upload a CAS PDF file.")
    
    if not password or not password.strip():
        raise HTTPException(422, "Password is required. Try PAN + DOB (DDMMYYYY) or the one you set.")
    
    try:
        # Read file bytes
        file_bytes = await file.read()
        
        # Parse CAS
        cas_data = cas_service.parse_cas_pdf(file_bytes, password.strip())
        
        # Extract investor info
        investor_info = cas_service.get_investor_info(cas_data)
        
        # Extract schemes
        schemes = cas_service.extract_schemes(cas_data)
        
        # If scheme filter provided, extract transactions for that scheme
        transactions_data = None
        if scheme_filter:
            transactions_data = cas_service.extract_transactions_for_scheme(
                cas_data, 
                scheme_filter=scheme_filter
            )
        
        return {
            "success": True,
            "investor_info": investor_info,
            "schemes": schemes,
            "transactions": transactions_data.get("transactions", []) if transactions_data else [],
            "cost_value": transactions_data.get("cost_value") if transactions_data else None,
            "scheme_filter": scheme_filter
        }
        
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Failed to parse CAS: {str(e)}")


@router.post("/parse-cas/transactions/")
async def get_cas_transactions(
    file: UploadFile = File(...),
    password: str = Form(...),
    scheme_name: str = Form(None),
    isin: str = Form(None),
    current_user: dict = Depends(get_current_user)
):
    """
    Parse CAS and return transactions for a specific scheme.
    
    Either scheme_name or isin should be provided.
    Returns transactions in format ready for detailed SIP import.
    """
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(400, "Invalid file format. Please upload a CAS PDF file.")
    
    if not password or not password.strip():
        raise HTTPException(422, "Password is required.")
    
    if not scheme_name and not isin:
        raise HTTPException(422, "Either scheme_name or isin is required.")
    
    try:
        file_bytes = await file.read()
        cas_data = cas_service.parse_cas_pdf(file_bytes, password.strip())
        
        # Extract transactions with valuation data
        result = cas_service.extract_transactions_for_scheme(
            cas_data,
            scheme_filter=scheme_name,
            isin_filter=isin
        )
        
        transactions = result.get("transactions", [])
        if not transactions:
            raise HTTPException(404, "No transactions found for the specified scheme.")
        
        # Calculate summary from raw transaction amounts
        total_raw_amount = sum(t["amount"] for t in transactions)
        total_units = sum(t["units"] for t in transactions)
        
        # Use cost_value from CAS if available (includes stamp duty)
        # Otherwise fall back to sum of raw amounts
        cost_value = result.get("cost_value") or total_raw_amount
        
        response = {
            "success": True,
            "scheme_name": scheme_name,
            "isin": isin,
            "transactions": transactions,
            "summary": {
                "total_installments": len(transactions),
                "total_invested": round(cost_value, 2),  # Uses CAS's Total Cost Value
                "total_raw_invested": round(total_raw_amount, 2),  # Sum of raw amounts
                "total_units": round(total_units, 4),
                "close_units": result.get("close_units"),  # From CAS valuation
                "nav": result.get("nav"),
                "market_value": result.get("market_value")
            },
            "missing_current_month": result.get("missing_current_month", False),
            "pending_installment": result.get("pending_installment")
        }
        
        return response
        
    except ValueError as e:
        raise HTTPException(400, str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to extract transactions: {str(e)}")

