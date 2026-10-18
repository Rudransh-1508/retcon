"""HTTP API over the engine. Read endpoints are public; writes need the admin passphrase."""

from __future__ import annotations

import hmac
import json

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from . import config
from .engine import Engine, EventResult

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
                         OPTIONAL MATCH (e)-[:TRIGGERED]->(r:Retraction)
                         RETURN e.id, e.kind, e.at, e.advisory, a.summary, a.severity, e.changes, e.target, e.reason,
                                e.by, r.classification, r.rationale
                         ORDER BY e.at DESC, e.seq DESC LIMIT $limit""", {"limit": limit})
    return [{"id": r[0], "kind": r[1], "at": r[2], "advisory": r[3], "summary": r[4], "severity": r[5],
             "changes": json.loads(r[6] or "[]"), "target": r[7], "reason": r[8], "by": r[9],
             "classification": r[10], "rationale": r[11]} for r in rows]


def _result(r: EventResult) -> dict:
    return {"event": r.event, "waves": r.waves,
            "changes": [{"decision": c.decision, "change": c.change, "before": c.before, "after": c.after}
                        for c in r.changes]}


@app.get("/api/whatif")
def what_if(id: str):
    """Simulate retracting a node on a copy of the graph. Nothing is written."""
    try:
        return _result(engine().what_if(id))
    except KeyError:
        raise HTTPException(404, f"no node {id}")
    except ValueError as e:
        raise HTTPException(400, str(e))


class Correction(BaseModel):
    id: str
    reason: str


@app.post("/api/correct")
def correct(body: Correction, x_retcon_passphrase: str = Header(default="")):
    """Retract a belief for real. GitHub catches up on the worker's next run."""
    expected = config.env("RETCON_ADMIN_PASSPHRASE") or ""
    if not expected or not hmac.compare_digest(x_retcon_passphrase.encode(), expected.encode()):
        raise HTTPException(403, "admin passphrase required")
    if not body.reason.strip():
        raise HTTPException(400, "a correction needs a reason")
    try:
        return _result(engine().correct(body.id, body.reason.strip(), by="person:admin"))
    except KeyError:
        raise HTTPException(404, f"no node {body.id}")
    except ValueError as e:
        raise HTTPException(400, str(e))
