"""LLM port backed by Groq: a pool of keys, rotation on rate limits, backoff, and a fallback model."""

from __future__ import annotations

import json
import time
from typing import Protocol

import requests

from . import config

PRIMARY = "openai/gpt-oss-120b"
FALLBACK = "openai/gpt-oss-20b"


class LLMError(RuntimeError):
    pass


class LLM(Protocol):
    def json(self, system: str, user: str, max_tokens: int = 800) -> dict: ...


class GroqLLM:
    def __init__(self, keys: list[str] | None = None, models: tuple[str, ...] = (PRIMARY, FALLBACK),
                 max_wait: float = 60.0):
        self.keys = keys if keys is not None else config.groq_keys()
        if not self.keys:
            raise LLMError("no valid Groq API keys configured")
        self.models, self.max_wait = models, max_wait
        self._next = 0
        self._dead: set[str] = set()

    def _key(self) -> str:
        live = [k for k in self.keys if k not in self._dead]
        if not live:
            raise LLMError("every Groq key was rejected")
        key = live[self._next % len(live)]
        self._next += 1
        return key

    def json(self, system: str, user: str, max_tokens: int = 800) -> dict:
        deadline = time.monotonic() + self.max_wait
        last_error = "no attempt"
        for model in self.models:
            attempt = 0
            while time.monotonic() < deadline:
                key = self._key()
                try:
                    r = requests.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers={"Authorization": f"Bearer {key}"},
                        json={"model": model, "temperature": 0.2, "max_completion_tokens": max_tokens,
                              "response_format": {"type": "json_object"},
                              "messages": [{"role": "system", "content": system},
                                           {"role": "user", "content": user}]},
                        timeout=60)
                except requests.RequestException as e:
                    last_error = str(e)
                    attempt += 1
                    time.sleep(min(2 ** attempt, 8))
                    continue
                if r.status_code == 401:
                    self._dead.add(key)
                    continue
                if r.status_code == 429 or r.status_code >= 500:
                    last_error = f"{r.status_code} {r.text[:200]}"
                    attempt += 1
                    if attempt > 2 * len(self.keys):
                        break  # this model is saturated on every key: try the fallback model
                    time.sleep(min(float(r.headers.get("retry-after", 0) or 0) or 0.5 * attempt, 8))
                    continue
                if r.status_code != 200:
                    last_error = f"{r.status_code} {r.text[:200]}"
                    break
                try:
                    return json.loads(r.json()["choices"][0]["message"]["content"])
                except (KeyError, ValueError) as e:
                    last_error = f"bad JSON from {model}: {e}"
                    attempt += 1
                    if attempt > 2:
                        break
        raise LLMError(last_error)
