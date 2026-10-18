"""Advisories in OSV format and the events derived from them."""

from __future__ import annotations

from dataclasses import dataclass

from . import semver

SEVERITY_RANK = {"CRITICAL": 4, "HIGH": 3, "MODERATE": 2, "MEDIUM": 2, "LOW": 1}


@dataclass(frozen=True)
class Advisory:
    raw: dict

    @property
    def id(self) -> str:
        return self.raw["id"]

    @property
    def aliases(self) -> list[str]:
        return sorted(set(self.raw.get("aliases") or []))

    @property
    def summary(self) -> str:
        return self.raw.get("summary") or ""

    @property
    def details(self) -> str:
        return self.raw.get("details") or ""

    @property
    def severity(self) -> str:
        return (self.raw.get("database_specific", {}).get("severity") or "LOW").upper()

    @property
    def rank(self) -> int:
        return SEVERITY_RANK.get(self.severity, 1)

    @property
    def published(self) -> str:
        return self.raw.get("published") or self.raw.get("modified")

    @property
    def withdrawn(self) -> str | None:
        return self.raw.get("withdrawn")

    @property
    def is_duplicate(self) -> bool:
        return self.summary.lower().startswith("duplicate advisory")

    def fix_for(self, ecosystem: str, name: str, version: str) -> str | None:
        """Fixed version (or semver.NO_FIX) if this advisory affects the package version, else None."""
        fixes = []
        for affected in self.raw.get("affected", []):
            pkg = affected.get("package", {})
            if pkg.get("ecosystem") == ecosystem and pkg.get("name") == name:
                fix = semver.affected_fix(affected.get("ranges", []), version)
                if fix is not None:
                    fixes.append(fix)
        return semver.max_version(fixes)

    def packages(self, ecosystem: str = "npm") -> set[str]:
        return {a["package"]["name"] for a in self.raw.get("affected", [])
                if a.get("package", {}).get("ecosystem") == ecosystem}


def events_for(advisory: dict) -> list[dict]:
    """The published and (if any) withdrawn events of one advisory, in time order."""
    adv = Advisory(advisory)
    events = [{"kind": "published", "at": adv.published, "advisory": advisory}]
    if adv.withdrawn:
        events.append({"kind": "withdrawn", "at": adv.withdrawn, "advisory": advisory})
    return events
