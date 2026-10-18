"""HTTP API over the engine. Read endpoints are public; writes need the admin passphrase."""

from __future__ import annotations

import json

from fastapi import FastAPI, HTTPException

from .engine import Engine

app = FastAPI(title="Retcon")
_engine: Engine | None = None


def engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = Engine()
    return _engine


@app.get("/api/health")
def health():
    return {"ok": True, "graph": engine().graph_name}


@app.get("/api/projects")
def projects():
    rows = engine().q("""MATCH (p:Project)
                         OPTIONAL MATCH (d:Decision {project: p.id, status: 'held'})
                         RETURN p.id, p.repo, p.snapshot_sha, p.snapshot_date, count(d) ORDER BY p.id""")
    return [{"id": r[0], "repo": r[1], "snapshot_sha": r[2], "snapshot_date": r[3], "open_decisions": r[4]}
            for r in rows]


@app.get("/api/decisions")
def decisions(project: str | None = None):
    return engine().decisions(project)


@app.get("/api/why")
def why(id: str):
    tree = engine().why(id)
    if tree is None:
        raise HTTPException(404, f"no node {id}")
    return tree


@app.get("/api/events")
def events(limit: int = 200):
    rows = engine().q("""MATCH (e:Event) OPTIONAL MATCH (e)-[:ABOUT]->(a:Advisory)
                         RETURN e.id, e.kind, e.at, e.advisory, a.summary, a.severity, e.changes
                         ORDER BY e.at DESC LIMIT $limit""", {"limit": limit})
    return [{"id": r[0], "kind": r[1], "at": r[2], "advisory": r[3], "summary": r[4], "severity": r[5],
             "changes": json.loads(r[6] or "[]")} for r in rows]
