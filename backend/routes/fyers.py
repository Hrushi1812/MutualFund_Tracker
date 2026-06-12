"""
Fyers API Routes - OAuth callback and token management
"""
from fastapi import APIRouter, Query, HTTPException, Depends
from fastapi.responses import HTMLResponse
from services.fyers_service import fyers_service
from routes.auth import get_current_user
from core.logging import get_logger

logger = get_logger("FyersRoutes")

router = APIRouter(prefix="/api/fyers", tags=["fyers"])


@router.get("/auth-url")
def get_auth_url(current_user: dict = Depends(get_current_user)):
    """
    Get the Fyers OAuth authorization URL.
    User should visit this URL in browser to authorize.
    """
    if not fyers_service.secret_key:
        raise HTTPException(status_code=500, detail="FYERS_SECRET_KEY not configured")
    
    url = fyers_service.get_auth_url()
    return {
        "auth_url": url,
        "instructions": "Visit this URL in your browser, login with Fyers credentials, and you'll be redirected back with an auth_code"
    }


@router.get("/callback")
def fyers_callback(
    auth_code: str = Query(None, alias="auth_code"),
    code: str = Query(None),  # Fyers sometimes uses 'code' instead
    s: str = Query(None),     # Status
):
    """
    OAuth callback endpoint. Fyers redirects here after user authorization.
    Exchanges auth_code for access_token.
    """
    # Fyers may send code as 'auth_code' or 'code'
    final_code = auth_code or code
    
    if not final_code:
        return HTMLResponse(content="""
            <html>
            <head><title>Fyers Auth Failed</title></head>
            <body>
                <h2>❌ Authorization Failed</h2>
                <p>No auth_code received. Please try again.</p>
                <a href="/api/fyers/auth-url">Get Auth URL</a>
            </body>
            </html>
        """, status_code=400)
    
    success = fyers_service.generate_token(final_code)
    
    if success:
        return HTMLResponse(content="""
            <html>
            <head><title>Fyers Auth Success</title></head>
            <body>
                <h2>✅ Authorization Successful!</h2>
                <p>Fyers API is now connected. You can close this window.</p>
                <p>Token is valid for ~24 hours.</p>
            </body>
            </html>
        """)
    else:
        return HTMLResponse(content="""
            <html>
            <head><title>Fyers Auth Failed</title></head>
            <body>
                <h2>❌ Token Generation Failed</h2>
                <p>Could not exchange auth_code for token. Please try again.</p>
                <a href="/api/fyers/auth-url">Get Auth URL</a>
            </body>
            </html>
        """, status_code=400)


@router.get("/status")
def get_fyers_status(validate: bool = False, current_user: dict = Depends(get_current_user)):
    """
    Check if Fyers API is authenticated.
    
    Args:
        validate: If True, performs a live API call to verify token is actually valid
                  (not just cached). Useful on app startup.
    """
    is_auth = fyers_service.is_authenticated()
    
    # Optional live validation - makes a lightweight API call
    live_valid = None
    if validate and is_auth:
        live_valid = fyers_service.validate_token_live()
        if not live_valid:
            is_auth = False  # Token is cached but actually invalid/revoked
    
    return {
        "authenticated": is_auth,
        "configured": bool(fyers_service.app_id and fyers_service.secret_key),
        "token_expiry": fyers_service._token_expiry.isoformat() if fyers_service._token_expiry else None,
        "live_validated": live_valid,
        "message": "Ready" if is_auth else "Not authenticated. Connect Fyers to get live stock data."
    }


@router.get("/disconnect")
def disconnect_fyers(current_user: dict = Depends(get_current_user)):
    """
    Clear the Fyers token (logout).
    User can still use the app with delayed/cached data.
    """
    fyers_service.clear_token()
    return {"success": True, "message": "Fyers disconnected. Live data unavailable."}


@router.get("/test-quote")
def test_quote(symbol: str = "RELIANCE", current_user: dict = Depends(get_current_user)):
    """Test fetching a live quote."""
    if not fyers_service.is_authenticated():
        raise HTTPException(status_code=401, detail="Fyers not authenticated")
    
    quotes = fyers_service.get_quotes([symbol])
    if symbol.upper() in quotes:
        return {"symbol": symbol, "data": quotes[symbol.upper()]}
    return {"symbol": symbol, "data": None, "error": "Quote not found"}
