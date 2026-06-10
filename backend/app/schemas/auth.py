from pydantic import BaseModel, ConfigDict, EmailStr, Field
from typing import Optional

class UserRegister(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_.-]+$")
    email: Optional[EmailStr] = None
    password: str = Field(min_length=8, max_length=128)

class UserLogin(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=128)


class RefreshTokenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    refresh_token: str = Field(min_length=16)

class Token(BaseModel):
    model_config = ConfigDict(extra="forbid")

    access_token: str
    refresh_token: str
    token_type: str
    access_token_expires_in: int
    refresh_token_expires_in: int
    user_id: str
    username: str

class TokenData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: Optional[str] = None
