"""Pydantic schemas for Revnexa API."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, EmailStr, Field


class RouteCorrection(BaseModel):
    routes: list[str] = Field(min_length=1)
    note: str | None = None
    review_status: str = "approved"


class ReviewAction(BaseModel):
    action: str
    note: str | None = None


class ImportRequest(BaseModel):
    shuffle_order: bool = False


class AssistantQuery(BaseModel):
    question: str
    confirm_route_change: bool = False
    source_record_id: int | None = None
    routes: list[str] | None = None


# Authentication Schemas
class UserBase(BaseModel):
    username: str
    email: EmailStr


class UserCreate(UserBase):
    password: str
    role: str = "viewer"


class UserResponse(UserBase):
    id: int
    role: str
    is_active: bool
    
    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
