"""Feed adapter: OSV advisories for the packages our projects depend on, as ordered events.

OSV's query API omits withdrawn advisories, so the feed reads the public OSV bucket instead: the
full npm archive for a rebuild, and the modified-id index for incremental runs. A cursor in the graph
records the last modification seen.
"""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path
from typing import Iterable

import requests

from .advisory import Advisory, events_for
from .engine import Engine

BUCKET = "https://osv-vulnerabilities.storage.googleapis.com/npm"
CURSOR = "cursor:osv:npm"


def relevant_packages(engine: Engine) -> set[str]:
    return {r[0] for r in engine.q("MATCH (:Project)-[:DEPENDS_ON]->(v:PackageVersion) RETURN DISTINCT v.name")}


def _relevant(raw: dict, packages: set[str]) -> bool:
    return raw.get("id", "").startswith("GHSA-") and bool(Advisory(raw).packages() & packages)


def advisories_from_archive(source: str | Path | None, packages: set[str]) -> tuple[list[dict], str]:
    """Every GitHub advisory in the npm archive that touches one of the packages, and the archive's newest
    modification time (the cursor to continue from)."""
    if source is None or str(source).startswith("http"):
        data = requests.get(source or f"{BUCKET}/all.zip", timeout=600).content
        archive = zipfile.ZipFile(io.BytesIO(data))
    else:
        archive = zipfile.ZipFile(source)
    out, newest = [], ""
    for name in archive.namelist():
        raw = json.loads(archive.read(name))
        newest = max(newest, raw.get("modified") or "")
        if _relevant(raw, packages):
            out.append(raw)
    return out, newest


def ordered_events(advisories: Iterable[dict]) -> list[dict]:
    events = [e for raw in advisories for e in events_for(raw)]
    return sorted(events, key=lambda e: (e["at"], e["kind"] != "published", e["advisory"]["id"]))


def get_cursor(engine: Engine) -> str | None:
    rows = engine.q("MATCH (c:Cursor {id: $id}) RETURN c.modified", {"id": CURSOR})
    return rows[0][0] if rows else None


def set_cursor(engine: Engine, modified: str):
    engine.q("MERGE (c:Cursor:Node {id: $id}) SET c.modified = $m", {"id": CURSOR, "m": modified})


def changed_since(cursor: str, packages: set[str], session: requests.Session | None = None) -> tuple[list[dict], str]:
    """Advisories modified after the cursor that touch our packages, plus the new cursor."""
    s = session or requests.Session()
    index = s.get(f"{BUCKET}/modified_id.csv", timeout=120).text.splitlines()
    newest, fresh = cursor, []
    for line in index:  # newest first
        modified, _, osv_id = line.partition(",")
        if modified <= cursor:
            break
        newest = max(newest, modified)
        if osv_id.startswith("GHSA-"):
            fresh.append(osv_id)
    out = []
    for osv_id in fresh:
        r = s.get(f"{BUCKET}/{osv_id}.json", timeout=60)
        if r.ok and _relevant(r.json(), packages):
            out.append(r.json())
    return out, newest
