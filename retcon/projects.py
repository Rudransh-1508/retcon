"""The projects Retcon watches: snapshot copies of real open-source repositories."""

from __future__ import annotations

import json
from dataclasses import dataclass


@dataclass(frozen=True)
class ProjectSpec:
    id: str
    repo: str
    snapshot_sha: str  # commit of the upstream project the copy was taken from
    snapshot_date: str
    lockfile_path: str
    upstream: str


PROJECTS = (
    ProjectSpec("gladys", "Rudransh-1508/retcon-target-gladys", "7eb0b2acaa14dd8b38dd8e095642381c9491d457",
                "2022-12-18", "server/package-lock.json", "GladysAssistant/Gladys"),
    ProjectSpec("wiredoor", "Rudransh-1508/retcon-target-wiredoor", "e80904fed7a69cc7d4aa34f9c24ce4eba7803f76",
                "2025-07-17", "package-lock.json", "wiredoor/wiredoor"),
)


def load(engine, github) -> None:
    """Record every project with the lockfile read from its snapshot commit on GitHub."""
    for p in PROJECTS:
        lock = json.loads(github.read_file(p.repo, p.lockfile_path, github.default_branch(p.repo)))
        engine.add_project(p.id, p.repo, p.snapshot_sha, p.snapshot_date, lock, p.lockfile_path)
        engine.q("MATCH (x:Project {id: $id}) SET x.upstream = $u", {"id": p.id, "u": p.upstream})
