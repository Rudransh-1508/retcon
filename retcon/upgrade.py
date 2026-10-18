"""Upgrade builder: the file changes that carry out one Decision.

Direct dependencies get their version bumped in package.json; vulnerable transitive versions get an npm
override scoped to that exact version. The lockfile is regenerated without installing or running scripts.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from .semver import NO_FIX


@dataclass
class PlanItem:
    version: str
    fix: str
    direct: bool


@dataclass
class Upgrade:
    files: dict[str, str]
    notes: list[str] = field(default_factory=list)
    lockfile_regenerated: bool = False


def _dump(original: str, data: dict) -> str:
    indent = re.match(r"\{\s*\n(\s+)", original)
    text = json.dumps(data, indent=len(indent[1]) if indent else 2, ensure_ascii=False)
    return text + ("\n" if original.endswith("\n") else "")


def _bump(spec: str, fix: str) -> str:
    prefix = spec[0] if spec[:1] in "^~" else ""
    return f"{prefix}{fix}"


def build(package_json: str, lockfile: str, package_json_path: str, lockfile_path: str, name: str,
          plan: list[PlanItem], regenerate: bool = True) -> Upgrade:
    pkg = json.loads(package_json)
    notes: list[str] = []
    overrides = dict(pkg.get("overrides") or {})
    for item in plan:
        if item.fix == NO_FIX:
            notes.append(f"{name}@{item.version} has no fixed release yet; nothing to change for it.")
            continue
        if item.direct:
            for section in ("dependencies", "devDependencies", "optionalDependencies"):
                if name in pkg.get(section, {}):
                    pkg[section][name] = _bump(pkg[section][name], item.fix)
        else:
            overrides[f"{name}@{item.version}"] = item.fix
    if overrides:
        pkg["overrides"] = overrides
    new_package_json = _dump(package_json, pkg)
    files = {package_json_path: new_package_json}
    result = Upgrade(files, notes)
    if regenerate and new_package_json != package_json:
        lock = _regenerate(new_package_json, lockfile)
        if lock is None:
            notes.append("The lockfile could not be regenerated automatically; run `npm install` to refresh it.")
        else:
            files[lockfile_path] = lock
            result.lockfile_regenerated = True
    return result


def _regenerate(package_json: str, lockfile: str) -> str | None:
    if not shutil.which("npm"):
        return None
    with tempfile.TemporaryDirectory() as tmp:
        Path(tmp, "package.json").write_text(package_json)
        Path(tmp, "package-lock.json").write_text(lockfile)
        for extra in ([], ["--legacy-peer-deps"]):
            proc = subprocess.run(
                ["npm", "install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund", *extra],
                cwd=tmp, capture_output=True, text=True, timeout=600)
            if proc.returncode == 0:
                return Path(tmp, "package-lock.json").read_text()
    return None
