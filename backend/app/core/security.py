from datetime import datetime, timedelta, timezone
from typing import Any, Union
from jose import jwt, JWTError
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

ALGORITHM = "HS256"

def _create_token(
    subject: Union[str, Any],
    token_type: str,
    expires_delta: timedelta | None = None,
) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        default_minutes = settings.ACCESS_TOKEN_EXPIRE_MINUTES if token_type == "access" else settings.REFRESH_TOKEN_EXPIRE_MINUTES
        expire = datetime.now(timezone.utc) + timedelta(minutes=default_minutes)
    to_encode = {"exp": expire, "sub": str(subject), "typ": token_type}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_access_token(subject: Union[str, Any], expires_delta: timedelta | None = None) -> str:
    return _create_token(subject=subject, token_type="access", expires_delta=expires_delta)


def create_refresh_token(subject: Union[str, Any], expires_delta: timedelta | None = None) -> str:
    return _create_token(subject=subject, token_type="refresh", expires_delta=expires_delta)


def decode_token(token: str, expected_type: str | None = None) -> dict[str, Any]:
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    token_type = payload.get("typ")
    if expected_type and token_type != expected_type:
        raise JWTError("Invalid token type")
    return payload


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)
