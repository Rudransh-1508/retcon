"""The Fixer agent: writes the prose of Retcon's pull requests and comments.

Facts (title, advisory table, trail link, marker) stay deterministic; the Fixer adds a short explanation
for maintainers. If the LLM fails, the template text stands alone.
"""

from __future__ import annotations

import json
import logging

from .llm import LLM, LLMError
from .text import TemplateWriter, held_advisories, retracted_advisories

log = logging.getLogger(__name__)

SYSTEM = """You are the Fixer agent of Retcon, a system that turns security advisories into dependency upgrades
and revises them when advisories are withdrawn. You write for the maintainers of an open-source project.
Rules: use only the facts in the input; never invent CVEs, versions, or exploit details; plain, calm language;
no marketing; no emojis; never use the em dash character; at most the number of sentences asked for.
Answer with a JSON object only."""


class FixerWriter(TemplateWriter):
    def __init__(self, llm: LLM):
        self.llm = llm

    def _ask(self, task: str, facts: dict, field: str) -> str | None:
        try:
            out = self.llm.json(SYSTEM, f"{task}\nReply as {{\"{field}\": \"...\"}}.\n\nFacts:\n"
                                        + json.dumps(facts, indent=1, default=str)[:6000])
            text = str(out.get(field, "")).strip().replace("—", "-")
            return text or None
        except LLMError as e:
            log.warning("Fixer fell back to templates: %s", e)
            return None

    @staticmethod
    def _facts(ctx: dict) -> dict:
        d = ctx["decision"]
        return {"project": d["project"], "package": d["package"], "status": d["status"], "urgency": d.get("urgency"),
                "target_version": d.get("target"),
                "advisories_still_holding": [{k: a[k] for k in ("id", "severity", "summary", "version", "fix")}
                                             for a in held_advisories(ctx)],
                "advisories_withdrawn": [{k: a[k] for k in ("id", "summary", "withdrawn")}
                                         for a in retracted_advisories(ctx)],
                "recent_changes": ctx.get("new_history", [])}

    def pr(self, ctx: dict) -> tuple[str, str]:
        title, body = super().pr(ctx)
        if ctx["decision"]["status"] != "held":
            return title, body
        summary = self._ask("Write 2 to 3 sentences explaining to the maintainers what risk this upgrade removes "
                            "and why its urgency is what it is.", self._facts(ctx), "summary")
        if summary:
            lead, rest = body.split("\n", 1)
            body = f"{lead}\n\n{summary}\n{rest}"
        return title, body

    def comment(self, change: str, ctx: dict, last: tuple | None) -> str:
        base = super().comment(change, ctx, last)
        facts = {**self._facts(ctx), "change": change, "previous_urgency": last[1] if last else None}
        why = self._ask("In 1 to 2 sentences, explain to the maintainers what changed for this upgrade and what, "
                        "if anything, they should do now.", facts, "explanation")
        if not why:
            return base
        head, tail = base.split("\n\nTrail:", 1) if "\n\nTrail:" in base else (base, "")
        return f"{head}\n\n{why}" + (f"\n\nTrail:{tail}" if tail else "")
