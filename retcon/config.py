"""Configuration from the environment (and a local .env file during development)."""

from __future__ import annotations

import os
import re
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

TARGET_REPOS = ("Rudransh-1508/retcon-target-gladys", "Rudransh-1508/retcon-target-wiredoor")


def env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    return value if value else default


def falkordb_settings() -> dict:
    host = env("FALKORDB_HOST")
    if not host:
        return {"host": "localhost", "port": int(env("RETCON_LOCAL_FALKORDB_PORT", "6390"))}
    return {
        "host": host,
        "port": int(env("FALKORDB_PORT", "6379")),
        "username": env("FALKORDB_USERNAME"),
        "password": env("FALKORDB_PASSWORD"),
    }


def groq_keys() -> list[str]:
    """Keys from GROQ_API_KEY_1..N and GROQ_API_KEYS, split on commas, de-duplicated, malformed ones skipped."""
    raw = [v for k, v in sorted(os.environ.items()) if re.fullmatch(r"GROQ_API_KEY(S|_\d+)?", k) and v]
    keys: list[str] = []
    for value in raw:
        for part in re.split(r"[,\s;]+", value.strip().strip("\"'[]")):
            if part.startswith("gsk_") and len(part) >= 50 and part not in keys:
                keys.append(part)
    return keys
