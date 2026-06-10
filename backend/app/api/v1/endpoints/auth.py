from datetime import timedelta
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Request
from jose import JWTError
from sqlalchemy.orm import Session
import uuid

from app.api.v1.deps import get_db
from app.core import security
from app.core.config import settings
from app.core.rate_limit import limiter
from app.models.podcast import User
from app.schemas.auth import RefreshTokenRequest, Token, UserRegister, UserLogin

router = APIRouter()

@router.post("/register", response_model=Token)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def register(
    request: Request,
    user_in: UserRegister,
    db: Session = Depends(get_db),
) -> Any:
    """
    Create new user.
    """
    # Validation: Email uniqueness if provided
    if user_in.email:
        email_exists = db.query(User).filter(User.email == user_in.email).first()
        if email_exists:
            raise HTTPException(status_code=400, detail="Email already registered.")

    user = db.query(User).filter(User.username == user_in.username).first()
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this username already exists in the system.",
        )
    
    user = User(
        id=str(uuid.uuid4()),
        username=user_in.username,
        email=user_in.email,
        hashed_password=security.get_password_hash(user_in.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    refresh_token_expires = timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": security.create_access_token(
            user.id, expires_delta=access_token_expires
        ),
        "refresh_token": security.create_refresh_token(
            user.id, expires_delta=refresh_token_expires
        ),
        "token_type": "bearer",
        "access_token_expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "refresh_token_expires_in": settings.REFRESH_TOKEN_EXPIRE_MINUTES * 60,
        "user_id": user.id,
        "username": user.username
    }

@router.post("/login", response_model=Token)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def login_access_token(
    request: Request,
    user_in: UserLogin,
    db: Session = Depends(get_db),
) -> Any:
    """
    OAuth2 compatible token login, retrieve an access token for future requests
    """
    user = db.query(User).filter(User.username == user_in.username).first()
    if not user or not security.verify_password(user_in.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    refresh_token_expires = timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": security.create_access_token(
            user.id, expires_delta=access_token_expires
        ),
        "refresh_token": security.create_refresh_token(
            user.id, expires_delta=refresh_token_expires
        ),
        "token_type": "bearer",
        "access_token_expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "refresh_token_expires_in": settings.REFRESH_TOKEN_EXPIRE_MINUTES * 60,
        "user_id": user.id,
        "username": user.username
    }


@router.post("/refresh", response_model=Token)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def refresh_access_token(
    request: Request,
    payload: RefreshTokenRequest,
    db: Session = Depends(get_db),
) -> Any:
    try:
        decoded = security.decode_token(payload.refresh_token, expected_type="refresh")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = decoded.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    refresh_token_expires = timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)

    return {
        "access_token": security.create_access_token(
            user.id, expires_delta=access_token_expires
        ),
        "refresh_token": security.create_refresh_token(
            user.id, expires_delta=refresh_token_expires
        ),
        "token_type": "bearer",
        "access_token_expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "refresh_token_expires_in": settings.REFRESH_TOKEN_EXPIRE_MINUTES * 60,
        "user_id": user.id,
        "username": user.username,
    }
