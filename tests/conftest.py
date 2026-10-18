import json
import uuid
from pathlib import Path

import pytest
from falkordb import FalkorDB

from retcon.engine import Engine

FIXTURES = Path(__file__).parent / "fixtures"
LOCAL = {"host": "localhost", "port": 6390}  # tests never touch FalkorDB Cloud

PROJECTS = {
    "wiredoor": ("Rudransh-1508/retcon-target-wiredoor", "e80904fed7a69cc7d4aa34f9c24ce4eba7803f76", "2025-07-17",
                 "package-lock.json"),
    "gladys": ("Rudransh-1508/retcon-target-gladys", "7eb0b2acaa14dd8b38dd8e095642381c9491d457", "2022-12-18",
               "server/package-lock.json"),
}


def advisory(ghsa: str) -> dict:
    return json.loads((FIXTURES / "advisories" / f"{ghsa}.json").read_text())


def published(ghsa: str) -> dict:
    a = advisory(ghsa)
    return {"kind": "published", "at": a["published"], "advisory": a}


def withdrawn(ghsa: str) -> dict:
    a = advisory(ghsa)
    return {"kind": "withdrawn", "at": a["withdrawn"], "advisory": a}


@pytest.fixture
def engine():
    eng = Engine(graph_name=f"test_{uuid.uuid4().hex[:10]}", db=FalkorDB(**LOCAL))
    yield eng
    eng.delete_graph()


def add(engine: Engine, project: str):
    repo, sha, date, path = PROJECTS[project]
    lock = json.loads((FIXTURES / "lockfiles" / f"{project}.package-lock.json").read_text())
    engine.add_project(project, repo, sha, date, lock, path)
