"""HTTP API over the engine. Read endpoints are public; writes need the admin passphrase."""

from __future__ import annotations

import hmac
import json

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from . import config
from .engine import Engine, EventResult

from contextlib import asynccontextmanager

from .mcp_server import build as build_mcp

# Remote MCP endpoint: read tools only, stateless, so it works on serverless functions.
mcp = build_mcp(allow_correct=False)
mcp_app = mcp.streamable_http_app(streamable_http_path="/mcp", stateless_http=True, json_response=True)


@asynccontextmanager
async def lifespan(_):
    async with mcp.session_manager.run():
        yield


app = FastAPI(title="Retcon", lifespan=lifespan)
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
    return engine().events(limit)


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


@app.get("/api/graph")
def graph(project: str):
    """A project's beliefs: advisories, exposures, judgments and decisions, with supports as edges."""
    e = engine()
    nodes = {}
    for nid, kind, status, label, extra in e.q(
            """MATCH (n:Belief {project: $p})
               RETURN n.id, labels(n), n.status, coalesce(n.package, n.id),
                      CASE WHEN n:Decision THEN n.urgency WHEN n:Judgment THEN n.verdict ELSE n.version END""",
            {"p": project}):
        kind = next(k for k in kind if k not in ("Node", "Belief"))
        nodes[nid] = {"id": nid, "kind": kind, "status": status, "label": label, "extra": extra}
    edges = []
    for sid, sstatus, premise, pkind, pstatus, plabel, psev, target in e.q(
            """MATCH (s:Support)-[:SUPPORTS]->(t:Belief {project: $p}), (s)-[:PREMISE]->(pr:Node)
               RETURN s.id, s.status, pr.id, labels(pr), pr.status, coalesce(pr.package, pr.id), pr.severity, t.id""",
            {"p": project}):
        if premise not in nodes:
            pkind = next(k for k in pkind if k not in ("Node", "Belief"))
            nodes[premise] = {"id": premise, "kind": pkind, "status": pstatus, "label": plabel, "extra": psev}
        edges.append({"id": f"{sid}>{premise}", "support": sid, "source": premise, "target": target, "status": sstatus})
    for jid, did in e.q("MATCH (j:Judgment {project: $p})-[:ADJUSTS]->(d:Decision) RETURN j.id, d.id", {"p": project}):
        edges.append({"id": f"adjusts:{jid}", "support": None, "source": jid, "target": did, "status": "held",
                      "kind": "adjusts"})
    return {"nodes": list(nodes.values()), "edges": edges}


@app.get("/api/event")
def event(id: str):
    rows = engine().q("MATCH (e:Event {id: $id}) RETURN e.kind, e.at, e.advisory, e.target, e.waves, e.changes",
                      {"id": id})
    if not rows:
        raise HTTPException(404, f"no event {id}")
    kind, at, advisory, target, waves, changes = rows[0]
    return {"id": id, "kind": kind, "at": at, "advisory": advisory, "target": target,
            "waves": json.loads(waves or "[]"), "changes": json.loads(changes or "[]")}


# Mounted last so every API route above takes precedence; the MCP app answers at /mcp.
app.mount("/", mcp_app)
