from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from db import users_collection
from core.config import settings
from models.schemas import TokenData, UserCreate
from core.logging import get_logger

logger = get_logger("AuthService")

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

class AuthService:
    @staticmethod
    def verify_password(plain_password, hashed_password):
        return pwd_context.verify(plain_password, hashed_password)

    @staticmethod
    def get_password_hash(password):
        return pwd_context.hash(password)

    @staticmethod
    def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        
        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        return encoded_jwt

    @staticmethod
    def get_user(username: str):
        return users_collection.find_one({"username": username})

    @staticmethod
    def validate_password_strength(password: str):
        import re
        if len(password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
        if not re.search(r"[A-Z]", password):
            raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", password):
            raise HTTPException(status_code=400, detail="Password must contain at least one lowercase letter")
        if not re.search(r"\d", password):
            raise HTTPException(status_code=400, detail="Password must contain at least one number")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
            raise HTTPException(status_code=400, detail="Password must contain at least one special character")

    @staticmethod
    def create_user(user: UserCreate):
        # Validate Password
        AuthService.validate_password_strength(user.password)

        # Check username uniqueness
        if AuthService.get_user(user.username):
            logger.warning(f"Registration failed: Username '{user.username}' already exists.")
            raise HTTPException(status_code=400, detail="Username already exists")
        
        # Check email uniqueness
        if AuthService.get_user_by_email(user.email):
            logger.warning(f"Registration failed: Email '{user.email}' already exists.")
            raise HTTPException(status_code=400, detail="Email already exists")
        
        from models.db_schemas import UserDocument
        
        hashed_password = AuthService.get_password_hash(user.password)
        
        # Create strict document
        user_doc = UserDocument(
            username=user.username,
            email=user.email,
            hashed_password=hashed_password,
            created_at=datetime.utcnow()
        )
        
        users_collection.insert_one(user_doc.dict())
        logger.info(f"New user registered: {user.username}")
        return user_doc.dict()

    @staticmethod
    def authenticate_user(username, password):
        user = AuthService.get_user(username)
        if not user:
            logger.warning(f"Login failed: Username '{username}' not found.")
            return None
        if not AuthService.verify_password(password, user["hashed_password"]):
            logger.warning(f"Login failed: Invalid password for '{username}'.")
            return None
        logger.info(f"User logged in: {username}")
        return user

    @staticmethod
    def get_user_by_email(email: str):
        """Look up user by email address."""
        return users_collection.find_one({"email": email})

    @staticmethod
    def create_password_reset_token(email: str) -> str:
        """Generate a JWT token for password reset with 15-min expiry."""
        expire = datetime.utcnow() + timedelta(minutes=15)
        to_encode = {
            "sub": email,
            "purpose": "password_reset",
            "exp": expire
        }
        encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        return encoded_jwt

    @staticmethod
    def reset_password(token: str, new_password: str) -> bool:
        """Validate reset token and update user password."""
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            email = payload.get("sub")
            purpose = payload.get("purpose")
            
            if purpose != "password_reset" or not email:
                logger.warning("Password reset failed: Invalid token purpose or missing email.")
                raise HTTPException(status_code=400, detail="Invalid reset token")
            
            user = AuthService.get_user_by_email(email)
            if not user:
                logger.warning(f"Password reset failed: User with email '{email}' not found.")
                raise HTTPException(status_code=404, detail="User not found")
            
            # Validate new password strength
            AuthService.validate_password_strength(new_password)
            
            # Update password in database
            hashed_password = AuthService.get_password_hash(new_password)
            users_collection.update_one(
                {"email": email},
                {"$set": {"hashed_password": hashed_password}}
            )
            
            logger.info(f"Password reset successful for user: {user['username']}")
            return True
            
        except JWTError:
            logger.warning("Password reset failed: Token expired or invalid.")
            raise HTTPException(status_code=400, detail="Invalid or expired reset token")

auth_service = AuthService()

