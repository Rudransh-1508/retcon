"""npm-style semantic versions and OSV SEMVER range checks."""

from __future__ import annotations

import re
from functools import total_ordering

_VERSION = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$")


@total_ordering
class Version:
    __slots__ = ("major", "minor", "patch", "pre", "raw")

    def __init__(self, raw: str):
        m = _VERSION.match(raw.strip())
        if not m:
            raise ValueError(f"not a semantic version: {raw!r}")
        self.raw = raw
        self.major, self.minor, self.patch = int(m[1]), int(m[2]), int(m[3])
        self.pre = tuple(int(p) if p.isdigit() else p for p in m[4].split(".")) if m[4] else ()

    def _key(self):
        # A release sorts after all of its prereleases; numeric identifiers sort before alphanumeric ones.
        pre = tuple((0, p, "") if isinstance(p, int) else (1, 0, p) for p in self.pre)
        return (self.major, self.minor, self.patch, 0 if self.pre else 1, pre)

    def __eq__(self, other):
        return self._key() == other._key()

    def __lt__(self, other):
        return self._key() < other._key()

    def __hash__(self):
        return hash(self._key())

    def __str__(self):
        return self.raw


def parse(raw: str) -> Version | None:
    try:
        return Version(raw)
    except ValueError:
        return None


NO_FIX = "none"


def affected_fix(ranges: list[dict], version: str) -> str | None:
    """Return the fixed version if `version` falls in one of the OSV SEMVER ranges.

    Returns NO_FIX when the version is affected but no fix exists, and None when it is not affected.
    """
    v = parse(version)
    if v is None:
        return None
    for r in ranges:
        if r.get("type") != "SEMVER":
            continue
        introduced = None
        for event in r.get("events", []):
            if "introduced" in event:
                introduced = event["introduced"]
            elif introduced is not None and "fixed" in event:
                if _at_least(v, introduced) and v < Version(event["fixed"]):
                    return event["fixed"]
                introduced = None
            elif introduced is not None and "last_affected" in event:
                if _at_least(v, introduced) and v <= Version(event["last_affected"]):
                    return NO_FIX
                introduced = None
        if introduced is not None and _at_least(v, introduced):
            return NO_FIX
    return None


def _at_least(v: Version, introduced: str) -> bool:
    return introduced == "0" or v >= Version(introduced)


def max_version(versions: list[str]) -> str | None:
    """Highest of the given versions; NO_FIX wins because nothing resolves it."""
    if not versions:
        return None
    if NO_FIX in versions:
        return NO_FIX
    return str(max(Version(x) for x in versions))
