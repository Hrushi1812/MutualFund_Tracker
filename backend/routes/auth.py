from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta
import os

from models.schemas import UserCreate, Token, UserLogin, ForgotPasswordRequest, ResetPasswordRequest
from services.auth_service import auth_service, oauth2_scheme, settings
from services.email_service import email_service
from jose import JWTError, jwt
from core.logging import get_logger

logger = get_logger("AuthRoutes")

router = APIRouter(tags=["Authentication"])

# Frontend URL for password reset link (configurable for dev/prod)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

@router.post("/register", response_model=dict)
def register(user: UserCreate):
    auth_service.create_user(user)
    return {"message": "User created successfully"}

@router.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    user = auth_service.authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = auth_service.create_access_token(
        data={"sub": user["username"]}
    )
    return {"access_token": access_token, "token_type": "bearer"}

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = auth_service.get_user(username)
    if user is None:
        raise credentials_exception
    return user

@router.post("/forgot-password", response_model=dict)
def forgot_password(request: ForgotPasswordRequest):
    """
    Request a password reset link.
    Uses email_service to send emails (Mailgun in prod, console in dev).
    """
    user = auth_service.get_user_by_email(request.email)
    
    # Always return success to prevent email enumeration attacks
    if not user:
        logger.info(f"Password reset requested for unknown email: {request.email}")
        return {"message": "If an account with that email exists, a reset link has been sent."}
    
    # Generate reset token and URL
    reset_token = auth_service.create_password_reset_token(request.email)
    reset_url = f"{FRONTEND_URL}/reset-password?token={reset_token}"
    
    # Send email via email service (handles both dev and prod)
    email_service.send_password_reset_email(request.email, reset_url)
    
    return {"message": "If an account with that email exists, a reset link has been sent."}

@router.post("/reset-password", response_model=dict)
def reset_password(request: ResetPasswordRequest):
    """Reset password using a valid reset token."""
    auth_service.reset_password(request.token, request.new_password)
    return {"message": "Password reset successfully. You can now log in with your new password."}

