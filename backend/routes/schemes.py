from fastapi import APIRouter, Query, Depends
from services.holdings_service import get_scheme_candidates
from routes.auth import get_current_user

router = APIRouter(prefix="/schemes", tags=["Schemes"])


@router.get("/search")
async def search_schemes(
    q: str = Query(..., min_length=2, description="Search query for scheme name"),
    current_user: dict = Depends(get_current_user)
):
    """
    Search for mutual fund schemes by name.
    Returns top 5 matching Growth schemes (excludes IDCW, Dividend, Bonus plans).
    """
    if not q or len(q.strip()) < 2:
        return {"schemes": []}
    
    candidates = get_scheme_candidates(q.strip())
    
    # Filter to only Growth plans (exclude IDCW, Dividend, Bonus)
    growth_only = [
        c for c in candidates 
        if not any(excl in c["schemeName"].upper() for excl in ["IDCW", "DIVIDEND", "BONUS"])
    ]
    
    return {"schemes": growth_only[:5]}

