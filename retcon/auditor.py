"""The Auditor agent: interprets each withdrawal and explains the retraction it caused.

The classification explains; it never decides. Outcomes come from the graph alone.
"""

from __future__ import annotations

import json
import logging
import re

from .llm import LLM, LLMError

log = logging.getLogger(__name__)

CLASSES = ("real_retraction", "duplicate", "alias", "scope_change")

SYSTEM = """You are the Auditor agent of Retcon. A security advisory was withdrawn by its publisher. From its text,
classify why: "real_retraction" (the claimed vulnerability is not real or has no security impact),
"duplicate" (another advisory already describes the same flaw), "alias" (same flaw under another identifier),
"scope_change" (the flaw is real but sits in a different package or version range than claimed).
If the text names the advisory it duplicates or defers to, give its GHSA id as "original", else null.
Write a one or two sentence rationale for maintainers, using only the given text. Never use the em dash character.
Reply with JSON: {"classification": "...", "original": "GHSA-..." or null, "rationale": "..."}"""


def withdrawal_reason(advisory: dict) -> str:
    details = advisory.get("details") or ""
    m = re.search(r"withdrawn because ([^\n]+)", details, re.I)
    return m.group(1).strip() if m else ""


class AuditorAgent:
    agent_id = "agent:auditor"
    name = "Auditor"

    def __init__(self, llm: LLM):
        self.llm = llm

    def audit(self, advisory: dict, duplicate_of: str | None) -> dict | None:
        facts = {"id": advisory["id"], "summary": advisory.get("summary"),
                 "stated_reason": withdrawal_reason(advisory), "details": (advisory.get("details") or "")[:2500],
                 "linked_original_by_summary": duplicate_of}
        try:
            out = self.llm.json(SYSTEM, json.dumps(facts, indent=1), max_tokens=500)
        except LLMError as e:
            log.warning("Auditor skipped %s: %s", advisory["id"], e)
            return None
        cls = out.get("classification") if out.get("classification") in CLASSES else (
            "duplicate" if duplicate_of else "real_retraction")
        original = out.get("original")
        if not (isinstance(original, str) and re.fullmatch(r"GHSA(-[23456789cfghjmpqrvwx]{4}){3}", original)):
            original = duplicate_of
        return {"classification": cls, "original": original,
                "rationale": str(out.get("rationale", "")).replace("\u2014", "-")[:500]}
