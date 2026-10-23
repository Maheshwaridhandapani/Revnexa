"""User management service for Revnexa."""
from __future__ import annotations

import sqlite3
from typing import Optional

from ..auth import get_password_hash, verify_password
from ..database import get_connection


def create_user(username: str, email: str, password: str, role: str = "viewer") -> dict:
    """Create a new user account."""
    hashed_password = get_password_hash(password)
    
    with get_connection() as conn:
        try:
            cursor = conn.execute(
                """
                INSERT INTO users (username, email, hashed_password, role)
                VALUES (?, ?, ?, ?)
                """,
                (username, email, hashed_password, role)
            )
            user_id = cursor.lastrowid
            conn.commit()
            
            # Return user without password
            user = conn.execute(
                "SELECT id, username, email, role, is_active, created_at FROM users WHERE id = ?",
                (user_id,)
            ).fetchone()
            return dict(user)
        except sqlite3.IntegrityError as e:
            if "username" in str(e):
                raise ValueError("Username already exists")
            elif "email" in str(e):
                raise ValueError("Email already exists")
            raise


def authenticate_user(username: str, password: str) -> Optional[dict]:
    """Authenticate a user by username and password."""
    with get_connection() as conn:
        user = conn.execute(
            """
            SELECT id, username, email, hashed_password, role, is_active
            FROM users WHERE username = ?
            """,
            (username,)
        ).fetchone()
        
        if not user:
            return None
        
        user_dict = dict(user)
        
        if not user_dict["is_active"]:
            return None
        
        if not verify_password(password, user_dict["hashed_password"]):
            return None
        
        # Return user without password
        del user_dict["hashed_password"]
        return user_dict


def get_user_by_id(user_id: int) -> Optional[dict]:
    """Get a user by ID."""
    with get_connection() as conn:
        user = conn.execute(
            """
            SELECT id, username, email, role, is_active, created_at
            FROM users WHERE id = ?
            """,
            (user_id,)
        ).fetchone()
        
        if not user:
            return None
        return dict(user)


def get_user_by_username(username: str) -> Optional[dict]:
    """Get a user by username."""
    with get_connection() as conn:
        user = conn.execute(
            """
            SELECT id, username, email, role, is_active, created_at
            FROM users WHERE username = ?
            """,
            (username,)
        ).fetchone()
        
        if not user:
            return None
        return dict(user)


def initialize_admin_user(username: str, email: str, password: str) -> dict:
    """Initialize the first admin user. Only works if no users exist."""
    with get_connection() as conn:
        # Check if any users exist
        existing = conn.execute("SELECT COUNT(*) as count FROM users").fetchone()
        if existing["count"] > 0:
            raise ValueError("Users already exist. Cannot initialize admin user.")
        
        return create_user(username, email, password, role="admin")
