"""The Triage agent: judges whether an exposure is exploitable in this project, from the project's code.

It locates where the project uses the affected package (and any API the advisory names), asks the LLM
for a verdict on that evidence, and returns a Judgment that rests on the advisory and the exposure.
Judgments are only made for HIGH and CRITICAL advisories on direct dependencies, where code evidence
exists in the project itself.
"""

from __future__ import annotations

import json
import logging
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .llm import LLM, LLMError

log = logging.getLogger(__name__)

VERDICTS = ("exploitable", "not_reachable", "unknown")
SOURCE_SUFFIXES = (".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx")
SKIP_DIRS = {"node_modules", ".git", "dist", "build", "coverage", "vendor"}

SYSTEM = """You are the Triage agent of Retcon. Given a security advisory and the places where a project uses the
affected package, decide whether the vulnerability is exploitable in this project.
Verdicts: "exploitable" (the vulnerable behaviour is reachable with attacker-influenced input in this code),
"not_reachable" (the code never uses the vulnerable behaviour, or only with trusted constant input),
"unknown" (the evidence is not enough). Be conservative: prefer "unknown" over guessing.
Cite only files and lines from the evidence. Never use the em dash character.
Reply with JSON: {"verdict": "...", "rationale": "one or two sentences", "evidence": [{"file": "...", "line": 1}]}"""


@dataclass
class Usage:
    file: str
    line: int
    text: str


class CodeSearch:
    """Usages of a package in a local checkout of a project."""

    def __init__(self, root: Path, subdir: str = ""):
        self.root, self.base = Path(root), Path(root) / subdir

    def usages(self, package: str, apis: list[str], limit: int = 25) -> list[Usage]:
        imports = re.compile(r"""(require\(\s*['"]{0}(/[^'"]*)?['"]\s*\)|from\s+['"]{0}(/[^'"]*)?['"]|import\s+['"]{0}['"])"""
                             .format(re.escape(package)))
        found: list[Usage] = []
        files_using: list[Path] = []
        for path in sorted(self.base.rglob("*")):
            if not path.is_file() or path.suffix not in SOURCE_SUFFIXES or SKIP_DIRS & set(path.parts):
                continue
            try:
                lines = path.read_text(errors="ignore").splitlines()
            except OSError:
                continue
            hit = False
            for i, line in enumerate(lines, 1):
                if imports.search(line):
                    found.append(Usage(str(path.relative_to(self.root)), i, line.strip()[:200]))
                    hit = True
            if hit:
                files_using.append(path)
        api_names = [a.split(".")[-1] for a in apis if a]
        for path in files_using:
            for i, line in enumerate(path.read_text(errors="ignore").splitlines(), 1):
                if any(re.search(rf"\b{re.escape(name)}\s*\(", line) for name in api_names):
                    found.append(Usage(str(path.relative_to(self.root)), i, line.strip()[:200]))
        unique = {(u.file, u.line): u for u in found}
        return list(unique.values())[:limit]


def mentioned_apis(advisory: dict) -> list[str]:
    """Identifiers the advisory names, such as `jwt.verify()` or `secretOrPublicKey`."""
    text = f"{advisory.get('summary', '')}\n{advisory.get('details', '')}"
    spans = re.findall(r"`([A-Za-z_$][\w$.]*)\(?\)?`", text)
    calls = re.findall(r"\b([a-z][\w$]*\.[a-z][\w$]*)\(", text)
    return sorted({s.rstrip("()") for s in spans + calls})[:12]


def clone(repo: str, dest: Path) -> Path:
    """Shallow clone (or reuse) a public target repository."""
    if not (dest / ".git").exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "clone", "--depth", "1", "-q", f"https://github.com/{repo}.git", str(dest)], check=True)
    return dest


class TriageAgent:
    agent_id = "agent:triage"
    name = "Triage"

    def __init__(self, llm: LLM, code: dict[str, CodeSearch], min_rank: int = 3):
        self.llm, self.code, self.min_rank = llm, code, min_rank

    def wants(self, rank: int, direct: bool, project: str) -> bool:
        return rank >= self.min_rank and direct and project in self.code

    def judge(self, project: str, package: str, version: str, advisory: dict) -> dict | None:
        apis = mentioned_apis(advisory)
        usages = self.code[project].usages(package, apis)
        facts = {"package": package, "version": version, "advisory": {
            "id": advisory["id"], "summary": advisory.get("summary"), "details": (advisory.get("details") or "")[:2500]},
            "apis_named_by_advisory": apis,
            "usages_in_project": [u.__dict__ for u in usages] or "no import of this package was found"}
        try:
            out = self.llm.json(SYSTEM, json.dumps(facts, indent=1), max_tokens=700)
        except LLMError as e:
            log.warning("Triage skipped %s %s: %s", project, advisory["id"], e)
            return None
        verdict = out.get("verdict") if out.get("verdict") in VERDICTS else "unknown"
        cited = [e for e in out.get("evidence") or [] if isinstance(e, dict)
                 and any(u.file == e.get("file") and u.line == e.get("line") for u in usages)]
        return {"verdict": verdict, "rationale": str(out.get("rationale", "")).replace("\u2014", "-")[:600],
                "evidence": cited or [{"file": u.file, "line": u.line} for u in usages[:3]],
                "usages": len(usages)}
