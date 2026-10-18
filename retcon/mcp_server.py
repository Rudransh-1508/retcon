"""MCP server: Retcon's memory as tools any agent can call.

Read tools (why, what_if, decisions, timeline) are safe for anyone; what_if writes nothing. The correct tool
writes and is registered only for the local stdio server when the admin passphrase is configured.
Run locally with: python -m retcon.mcp_server
"""

from __future__ import annotations

from . import config
from .engine import Engine

UI = config.env("RETCON_PUBLIC_URL", "https://retcon-kappa.vercel.app")
KEEP = ("id", "kind", "status", "package", "version", "project", "urgency", "target", "severity", "summary",
        "verdict", "rationale", "action", "point", "url", "withdrawn", "corrected_reason")


def _compact(node: dict, depth: int = 4) -> dict:
    out = {k: (v[:160] if isinstance(v, str) else v) for k, v in node.items() if k in KEEP and v not in (None, "")}
    if node.get("retracted_by"):
        r = node["retracted_by"][0]
        out["retracted"] = {"at": r["at"], "reason": (r.get("rationale") or r.get("reason") or "")[:200],
                            "classification": r.get("classification")}
    if depth and node.get("supports"):
        out["because"] = [{"kind": s["kind"], "status": s["status"], "by": s.get("by"),
                           "premises": [_compact(p, depth - 1) for p in s["premises"]]} for s in node["supports"]]
    for key in ("judgments",):
        if node.get(key):
            out[key] = [_compact(j, 0) for j in node[key]]
    if node.get("plans"):
        out["plans"] = [{k: p[k] for k in ("action", "point", "status", "by", "rationale", "actions")} for p in node["plans"]]
    if node.get("history"):
        out["history"] = [{k: h[k] for k in ("at", "kind", "advisory", "change", "before", "after")}
                          for h in node["history"]][-12:]
    return out


class Tools:
    """The tool functions, over one engine. Tests call these directly."""

    def __init__(self, engine: Engine | None = None):
        self._engine = engine

    @property
    def engine(self) -> Engine:
        if self._engine is None:
            self._engine = Engine()
        return self._engine

    def why(self, id: str) -> dict:
        """Why Retcon believes or decided something: the chain of support behind a decision, exposure, judgment,
        plan or advisory, including support that was retracted and why, the agents' plans, and the history."""
        tree = self.engine.why(id)
        if tree is None:
            return {"error": f"no node {id}", "hint": "use decisions() to find decision ids"}
        return {"node": _compact(tree), "ui": f"{UI}/?why={id}"}

    def what_if(self, id: str) -> dict:
        """Simulate that an advisory, exposure or judgment is wrong. Runs on a temporary copy of the graph and
        writes nothing. Returns which decisions would be cancelled, downgraded or left unchanged."""
        try:
            r = self.engine.what_if(id)
        except (KeyError, ValueError) as e:
            return {"error": str(e)}
        return {"simulated": True, "writes": "none", "waves": len(r.waves),
                "retracted": [n for w in r.waves for n in w if not n.startswith("support:")],
                "decisions": [{"decision": c.decision, "outcome": c.change, "urgency_before": (c.before or {}).get("urgency"),
                               "urgency_after": c.after.get("urgency") if c.after.get("status") == "held" else None}
                              for c in r.changes]}

    def decisions(self, project: str | None = None, urgency: str | None = None, include_cancelled: bool = False) -> dict:
        """Upgrade decisions Retcon holds, most urgent first, with their pull request links. Filter by project
        (gladys, wiredoor) and urgency (P0 to P3)."""
        rows = [d for d in self.engine.decisions(project)
                if (include_cancelled or d["status"] == "held") and (not urgency or d["urgency"] == urgency)]
        rank = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
        rows.sort(key=lambda d: (d["status"] != "held", rank.get(d["urgency"] or "", 9), d["project"], d["package"]))
        return {"count": len(rows), "decisions": [
            {"id": d["id"], "project": d["project"], "package": d["package"], "status": d["status"],
             "urgency": d["urgency"] if d["status"] == "held" else None, "target": d["target"],
             "advisories": len(d["evidence"]), "pull_request": d["pr_url"], "why": f"{UI}/?why={d['id']}"}
            for d in rows]}

    def timeline(self, limit: int = 20, only_retractions: bool = False) -> dict:
        """Recent advisory events and corrections, newest first, with what each changed and the Auditor's
        explanation for withdrawals."""
        events = self.engine.events(max(1, min(limit, 100)) * (4 if only_retractions else 1))
        if only_retractions:
            events = [e for e in events if e["kind"] != "published"][:limit]
        return {"events": [{k: e[k] for k in ("at", "kind", "advisory", "summary", "target", "reason",
                                              "classification", "rationale") if e.get(k)}
                           | {"changes": [{"decision": c["decision"], "change": c["change"]} for c in e["changes"]]}
                           for e in events]}

    def correct(self, id: str, reason: str) -> dict:
        """Retract an advisory, exposure or judgment for real, with a reason. Everything resting only on it is
        retracted too; GitHub catches up on the worker's next run. This writes."""
        if not reason.strip():
            return {"error": "a correction needs a reason"}
        try:
            r = self.engine.correct(id, reason.strip(), by="person:admin-via-mcp")
        except (KeyError, ValueError) as e:
            return {"error": str(e)}
        return {"corrected": id, "decisions": [{"decision": c.decision, "outcome": c.change} for c in r.changes]}


READ_TOOLS = ("why", "what_if", "decisions", "timeline")


def build(engine: Engine | None = None, allow_correct: bool = False):
    from mcp.server.mcpserver import MCPServer
    tools = Tools(engine)
    server = MCPServer(
        name="retcon", title="Retcon",
        instructions=("Retcon is provenance-tracked memory for security advisories and the dependency upgrades they "
                      "justify in two real projects (gladys, wiredoor). Every belief records what supports it. Use "
                      "decisions() to see what to upgrade, why(id) to see the evidence and agent reasoning behind any "
                      "decision, what_if(id) to test what would change if an advisory or judgment were wrong, and "
                      "timeline() for what happened recently."))
    for name in READ_TOOLS:
        server.add_tool(getattr(tools, name), name=name)
    if allow_correct and config.env("RETCON_ADMIN_PASSPHRASE"):
        server.add_tool(tools.correct, name="correct")
    return server


if __name__ == "__main__":
    build(allow_correct=True).run("stdio")
