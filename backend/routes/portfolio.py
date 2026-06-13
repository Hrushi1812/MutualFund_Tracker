from fastapi import APIRouter, Depends, HTTPException
from models.schemas import PortfolioAnalysisRequest
from services.nav_service import nav_service
from routes.auth import get_current_user

router = APIRouter(tags=["Portfolio"])

@router.post("/analyze-portfolio")
def analyze_portfolio(
    request: PortfolioAnalysisRequest,
    current_user: dict = Depends(get_current_user)
):
    user_id = str(current_user["_id"])
    return nav_service.calculate_pnl(
        request.fund_id, 
        user_id, 
        request.investment_amount, 
        request.investment_date
    )
