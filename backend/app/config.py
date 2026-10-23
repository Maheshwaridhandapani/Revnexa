"""Revnexa configuration — AI provider is optional via env vars."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
EXPORTS_DIR = ROOT / "exports"
DB_PATH = Path(os.getenv("REVNEXA_DB_PATH", str(ROOT / "backend" / "revnexa.db")))

INITIAL_FILE = DATA_DIR / "01_initial.json"
UPDATE_FILE = DATA_DIR / "02_update.json"

# Optional LLM — never hardcoded. Deterministic mode is the default.
LLM_API_KEY = os.getenv("REVNEXA_LLM_API_KEY") or os.getenv("OPENAI_API_KEY")
LLM_BASE_URL = os.getenv("REVNEXA_LLM_BASE_URL", "https://api.openai.com/v1")
LLM_MODEL = os.getenv("REVNEXA_LLM_MODEL", "gpt-4o-mini")
AI_MODE = "hybrid_llm" if LLM_API_KEY else "deterministic"

BRIEF_DATE = "2026-08-21"
BRIEF_TZ = "Asia/Kolkata"

ROUTES = [
    "Sales Coaching",
    "Deal Next Steps",
    "Customer Follow-up",
    "Internal/Vendor Notes",
    "Human Decision Required",
    "Do Not Contact",
    "No Action Required",
]

VERIFICATION_STATUSES = [
    "Supported by transcript",
    "Partially supported",
    "Unsupported",
    "Ambiguous",
    "Needs human review",
    "Stale — source changed",
]

GATE_STATUSES = ["Verified", "Needs Review", "Invalid Evidence", "Stale"]

# Authentication Configuration
SECRET_KEY = os.getenv("REVNEXA_SECRET_KEY")
if not SECRET_KEY:
    raise ValueError(
        "REVNEXA_SECRET_KEY environment variable must be set. "
        "Generate a secure random key using: python -c 'import secrets; print(secrets.token_urlsafe(32))'"
    )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("REVNEXA_TOKEN_EXPIRE_MINUTES", "480"))  # 8 hours default
