from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List

# --- Auth Schemas ---
class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8)

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8)

# --- Application Schemas ---
from datetime import datetime

class FundBase(BaseModel):
    fund_name: str = Field(..., min_length=1)
    scheme_code: Optional[str] = None
    invested_amount: Optional[float] = Field(None, gt=0)
    invested_date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$") # YYYY-MM-DD
    nickname: Optional[str] = None

class PortfolioAnalysisRequest(BaseModel):
    fund_id: str
    investment_amount: Optional[float] = Field(None, gt=0)
    investment_date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$") # YYYY-MM-DD
