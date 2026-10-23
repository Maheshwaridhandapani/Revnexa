from __future__ import annotations

from collections.abc import Iterator

from ..database import get_connection, init_db
from ..config import DB_PATH


def ensure_db() -> None:
    init_db(DB_PATH)


def db_conn() -> Iterator:
    ensure_db()
    with get_connection() as conn:
        yield conn
