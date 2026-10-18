"""The Planner agent: decides what to do on GitHub at each decision point.

The rules of memory (what holds, what is retracted) stay deterministic. The Planner only chooses among the
actions allowed in the situation, and its choice is recorded as a Plan belief resting on the decision and the
advisories it relied on, so a later retraction retracts the plan too and the Planner plans again.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from .llm import LLM, LLMError

log = logging.getLogger(__name__)

OPEN_PR, REPORT, KEEP_PR, REOPEN_PR, MOVE_TO_REPORT = "open_pr", "report", "keep_pr", "reopen_pr", "move_to_report"

ACTION_MEANING = {
    OPEN_PR: "open a pull request with the upgrade now",
    REPORT: "list it in the project's lower-priority report issue instead of a pull request",
    KEEP_PR: "keep the existing pull request open",
    REOPEN_PR: "reopen the existing pull request",
    MOVE_TO_REPORT: "close the pull request and track the upgrade in the report issue instead",
}


@dataclass
class Situation:
    """A decision point: what changed, what exists on GitHub, and what Retcon may do."""
    decision: dict
    change: str            # new | escalate | downgrade | replan | reheld
    github: str            # none | report | pr_open | pr_closed
    allowed: list[str]
    facts: dict


@dataclass
class Choice:
    action: str
    rationale: str
    by: str
    agent_id: str


def situation(d: dict, acted_mode: str | None, change: str, facts: dict) -> Situation | None:
    """The allowed actions at a decision point, or None when there is nothing to decide."""
    held = d["status"] == "held"
    has_pr = d.get("pr_number") is not None
    github = ("pr_open" if acted_mode == "pr" else "pr_closed") if has_pr else (acted_mode or "none")
    if github == "closed":
        github = "none"
    if held and github in ("none", "report"):
        return Situation(d, change, github, [OPEN_PR, REPORT], facts)
    if held and github == "pr_closed":
        return Situation(d, change, github, [REOPEN_PR, REPORT], facts)
    if held and github == "pr_open" and change in ("downgrade", "replan"):
        return Situation(d, change, github, [KEEP_PR, MOVE_TO_REPORT], facts)
    return None


class DefaultPlanner:
    """The policy without an LLM: P0 and P1 get pull requests, cancelled work is closed, downgrades keep their PR."""
    agent_id, name = "agent:policy", "Policy"

    def choose(self, s: Situation) -> Choice:
        urgent = s.decision.get("urgency") in ("P0", "P1")
        pick = {
            (OPEN_PR, REPORT): OPEN_PR if urgent else REPORT,
            (REOPEN_PR, REPORT): REOPEN_PR,
            (KEEP_PR, MOVE_TO_REPORT): KEEP_PR,
        }[tuple(s.allowed)]
        return Choice(pick, "Default policy: P0 and P1 get pull requests; a downgrade keeps its pull request.",
                      self.name, self.agent_id)


SYSTEM = """You are the Planner agent of Retcon. Retcon keeps a provenance graph of security advisories, the
dependency upgrades they justify, and the GitHub work it has done. A decision point has been reached. Choose
exactly one of the allowed actions for this upgrade, as a careful maintainer would.
Consider: urgency (P0 most urgent), how many advisories still hold, Triage judgments about exploitability in this
project, whether the upgrade crosses a major version (risk of breaking the project), and what already exists on
GitHub. Prefer not to disturb maintainers with low-value pull requests; Never use the em dash character.
Reply with JSON: {"action": "<one of the allowed actions>", "rationale": "one or two sentences citing the facts"}"""


class PlannerAgent:
    agent_id, name = "agent:planner", "Planner"

    def __init__(self, llm: LLM, fallback: DefaultPlanner | None = None):
        self.llm, self.fallback = llm, fallback or DefaultPlanner()

    def choose(self, s: Situation) -> Choice:
        prompt = {"decision_point": s.change, "github_now": s.github,
                  "allowed_actions": {a: ACTION_MEANING[a] for a in s.allowed}, "facts": s.facts}
        try:
            out = self.llm.json(SYSTEM, json.dumps(prompt, indent=1, default=str)[:7000], max_tokens=500)
        except LLMError as e:
            log.warning("Planner fell back to the default policy: %s", e)
            return self.fallback.choose(s)
        action = out.get("action")
        if action not in s.allowed:
            log.warning("Planner chose %r, not allowed in %s; using the default policy", action, s.allowed)
            return self.fallback.choose(s)
        return Choice(action, str(out.get("rationale", "")).replace("\u2014", "-")[:500], self.name, self.agent_id)
