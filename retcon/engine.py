"""The Retcon engine: the only module that writes the graph.

Every belief (Exposure, Judgment) and every Decision is held only while at least one of its Supports
holds, and a Support holds only while all of its premises are held. Retractions propagate forward
from the retracted node until nothing changes. Nothing is ever deleted.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from falkordb import FalkorDB

from . import config, semver
from .advisory import Advisory
from .lockfile import read as read_lockfile

ECOSYSTEM = "npm"
SYSTEM_AGENT = "agent:retcon"
BELIEF_LABELS = ("Exposure", "Judgment", "Decision", "Plan")
URGENCY_BY_RANK = {4: "P0", 3: "P1", 2: "P2", 1: "P3"}


class UnsupportedWrite(ValueError):
    """Raised when something tries to write a belief or decision without naming its support."""


@dataclass
class DecisionState:
    id: str
    status: str
    urgency: str | None
    target: str | None
    evidence: tuple[str, ...]

    def as_dict(self):
        return {"status": self.status, "urgency": self.urgency, "target": self.target,
                "evidence": list(self.evidence)}


@dataclass
class DecisionChange:
    decision: str
    change: str  # new | escalate | updated | downgrade | cancel | unchanged
    before: dict | None
    after: dict


@dataclass
class EventResult:
    event: str
    kind: str
    skipped: bool = False
    waves: list[list[str]] = field(default_factory=list)
    changes: list[DecisionChange] = field(default_factory=list)

    def outcome_of(self, decision_id: str) -> str | None:
        for c in self.changes:
            if c.decision == decision_id:
                return c.change
        return None


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def exposure_id(project: str, name: str, version: str) -> str:
    return f"exposure:{project}:{name}@{version}"


def decision_id(project: str, name: str) -> str:
    return f"decision:{project}:{name}"


def urgency_rank(urgency: str | None) -> int:
    return {"P0": 0, "P1": 1, "P2": 2, "P3": 3}.get(urgency or "", 9)


class Engine:
    def __init__(self, graph_name: str | None = None, db: FalkorDB | None = None, triage=None, auditor=None):
        self.triage, self.auditor = triage, auditor
        self.db = db or FalkorDB(**config.falkordb_settings())
        self.graph_name = graph_name or config.env("RETCON_GRAPH", "retcon")
        self.g = self.db.select_graph(self.graph_name)
        self._ensure_indexes()

    # ------------------------------------------------------------------ plumbing

    def q(self, cypher: str, params: dict | None = None) -> list[list]:
        return self.g.query(cypher, params or {}).result_set

    def _ensure_indexes(self):
        existing = {(row[0], tuple(row[1])) for row in self.q("CALL db.indexes() YIELD label, properties")}
        for label in ("Project", "PackageVersion", "Advisory", "Exposure", "Judgment", "Decision", "Plan",
                      "Support", "Event", "Retraction", "Agent", "Action", "Belief", "Node"):
            if (label, ("id",)) not in existing:
                self.q(f"CREATE INDEX FOR (n:{label}) ON (n.id)")

    def delete_graph(self):
        self.g.delete()

    def is_empty(self) -> bool:
        return self.q("MATCH (n) RETURN count(n)")[0][0] == 0

    # ------------------------------------------------------------------ projects

    def add_project(self, project: str, repo: str, snapshot_sha: str, snapshot_date: str, lockfile: dict,
                    lockfile_path: str = "package-lock.json"):
        """Record a project and every package version its lockfile resolves (facts, not beliefs)."""
        self.q("""MERGE (p:Project:Node {id: $id})
                  SET p.repo = $repo, p.snapshot_sha = $sha, p.snapshot_date = $date, p.lockfile_path = $path""",
               {"id": project, "repo": repo, "sha": snapshot_sha, "date": snapshot_date, "path": lockfile_path})
        rows = [{"vid": f"pv:{ECOSYSTEM}/{d.name}@{d.version}", "name": d.name, "version": d.version,
                 "direct": d.direct, "dev": d.dev, "paths": [" > ".join(p) for p in d.paths[:3]]}
                for d in read_lockfile(lockfile)]
        for i in range(0, len(rows), 500):
            self.q("""MATCH (p:Project {id: $project})
                      UNWIND $rows AS r
                      MERGE (v:PackageVersion:Node {id: r.vid})
                      SET v.ecosystem = $eco, v.name = r.name, v.version = r.version
                      MERGE (p)-[d:DEPENDS_ON]->(v)
                      SET d.direct = r.direct, d.dev = r.dev, d.paths = r.paths""",
                   {"project": project, "rows": rows[i:i + 500], "eco": ECOSYSTEM})
        self._ensure_agent(SYSTEM_AGENT, "Retcon")

    def _ensure_agent(self, agent_id: str, name: str):
        self.q("MERGE (a:Agent:Node {id: $id}) SET a.name = $name", {"id": agent_id, "name": name})

    # ------------------------------------------------------------------ writes with support

    def write_support(self, support_id: str, kind: str, premises: list[str], supports: str, by: str,
                      props: dict | None = None, at: str | None = None):
        """Record one reason for a belief or decision. A support with no premises is rejected."""
        if not premises:
            raise UnsupportedWrite(f"support {support_id} for {supports} names no premises")
        at = at or now()
        held = self.q("""MATCH (p:Node) WHERE p.id IN $premises AND p.status = 'retracted'
                         RETURN count(p)""", {"premises": premises})[0][0] == 0
        found = self.q("MATCH (p:Node) WHERE p.id IN $premises RETURN count(p)", {"premises": premises})[0][0]
        if found != len(set(premises)):
            raise UnsupportedWrite(f"support {support_id} names premises that do not exist")
        self.q("""MATCH (t:Node {id: $target}), (a:Agent {id: $by})
                  MERGE (s:Support:Node {id: $id})
                  ON CREATE SET s.created_at = $at, s.kind = $kind
                  SET s += $props,
                      s.held_at = CASE WHEN $status = 'held' AND coalesce(s.status, '') <> 'held'
                                       THEN $at ELSE s.held_at END,
                      s.status = $status
                  MERGE (s)-[:SUPPORTS]->(t)
                  MERGE (a)-[:WROTE]->(s)
                  WITH s
                  UNWIND $premises AS pid
                  MATCH (p:Node {id: pid})
                  MERGE (s)-[:PREMISE]->(p)""",
               {"id": support_id, "target": supports, "by": by, "at": at, "kind": kind,
                "status": "held" if held else "retracted", "props": props or {}, "premises": premises})

    def write_belief(self, label: str, node_id: str, props: dict, supports: list[dict], by: str,
                     at: str | None = None, links: list[tuple[str, str]] = ()):
        """Write an Exposure, Judgment or Decision together with at least one support.

        Each support is {"id", "kind", "premises": [...], "props": {...}}.
        """
        if label not in BELIEF_LABELS:
            raise ValueError(f"unknown belief label {label}")
        if not supports:
            raise UnsupportedWrite(f"{label} {node_id} written without any support")
        at = at or now()
        self.q(f"""MERGE (n:{label}:Belief:Node {{id: $id}})
                   ON CREATE SET n.created_at = $at, n.status = 'retracted'
                   SET n += $props""", {"id": node_id, "at": at, "props": props})
        for rel, target in links:
            self.q(f"MATCH (n:Node {{id: $id}}), (t:Node {{id: $t}}) MERGE (n)-[:{rel}]->(t)",
                   {"id": node_id, "t": target})
        for s in supports:
            self.write_support(s["id"], s["kind"], s["premises"], node_id, by, s.get("props"), at)
        # A belief is held while any support holds, unless a person corrected it.
        self.q("""MATCH (n:Node {id: $id}) WHERE coalesce(n.corrected, false) = false
                  OPTIONAL MATCH (n)<-[:SUPPORTS]-(s:Support {status: 'held'})
                  WITH n, count(s) AS held
                  SET n.status = CASE WHEN held > 0 THEN 'held' ELSE n.status END,
                      n.held_at = CASE WHEN held > 0 AND n.status <> 'held' THEN $at ELSE n.held_at END""",
               {"id": node_id, "at": at})

    # ------------------------------------------------------------------ events

    def process_event(self, event: dict) -> EventResult:
        adv = Advisory(event["advisory"])
        kind, at = event["kind"], event["at"]
        event_id = f"event:{kind}:{adv.id}"
        if self.q("MATCH (e:Event {id: $id}) RETURN count(e)", {"id": event_id})[0][0]:
            return EventResult(event_id, kind, skipped=True)
        before = self._decision_states()
        if kind == "published":
            result = self._publish(adv, at, event_id)
        elif kind == "withdrawn":
            result = self._withdraw(adv, at, event_id)
        else:
            raise ValueError(f"unknown event kind {kind}")
        self._recompute_decisions()
        result.changes = self._diff(before, self._decision_states(), retraction=(kind == "withdrawn"))
        if result.waves:
            result.changes += self._touched_but_unchanged(result, before)
        self._record_event(event_id, kind, adv, at, result)
        return result

    def _publish(self, adv: Advisory, at: str, event_id: str) -> EventResult:
        evidence = self._evidence_key(adv)
        self.q("""MERGE (a:Advisory:Node {id: $id})
                  ON CREATE SET a.status = 'held', a.held_at = $at
                  SET a.summary = $summary, a.details = $details, a.severity = $severity, a.rank = $rank,
                      a.aliases = $aliases, a.published = $published, a.evidence = $evidence,
                      a.duplicate = $duplicate, a.url = $url""",
               {"id": adv.id, "at": at, "summary": adv.summary, "details": adv.details[:4000],
                "severity": adv.severity, "rank": adv.rank, "aliases": adv.aliases, "published": adv.published,
                "evidence": evidence, "duplicate": adv.is_duplicate,
                "url": f"https://github.com/advisories/{adv.id}"})
        duplicate_of, self._pending_duplicate = getattr(self, "_pending_duplicate", None), None
        if duplicate_of:
            self.q("MATCH (a:Advisory {id: $a}), (b:Advisory {id: $b}) MERGE (a)-[:DUPLICATE_OF]->(b)",
                   {"a": adv.id, "b": duplicate_of})
        elif evidence != adv.id:
            self.q("MATCH (a:Advisory {id: $a}), (b:Advisory {id: $b}) MERGE (a)-[:ALIAS_OF]->(b)",
                   {"a": adv.id, "b": evidence})
        rows = self.q("""MATCH (p:Project)-[d:DEPENDS_ON]->(v:PackageVersion)
                         WHERE v.ecosystem = $eco AND v.name IN $names
                         RETURN p.id, v.id, v.name, v.version, d.direct""",
                      {"eco": ECOSYSTEM, "names": sorted(adv.packages(ECOSYSTEM))})
        judge = []
        for project, vid, name, version, direct in rows:
            fix = adv.fix_for(ECOSYSTEM, name, version)
            if fix is None:
                continue
            eid = exposure_id(project, name, version)
            self.write_belief("Exposure", eid, {"project": project, "package": name, "version": version},
                              [{"id": f"support:affects:{adv.id}:{eid}", "kind": "affects",
                                "premises": [adv.id], "props": {"fix": fix}}],
                              by=SYSTEM_AGENT, at=at, links=[("OF", vid), ("IN", project)])
            did = decision_id(project, name)
            self.write_belief("Decision", did, {"project": project, "package": name, "action": "upgrade"},
                              [{"id": f"support:resolves:{eid}", "kind": "resolves", "premises": [eid]}],
                              by=SYSTEM_AGENT, at=at, links=[("IN", project)])
            if self.triage and self.triage.wants(adv.rank, bool(direct), project):
                judge.append((project, name, version, eid, did))
        for project, name, version, eid, did in judge:
            self._triage(adv, project, name, version, eid, did, at)
        return EventResult(event_id, "published")

    def _triage(self, adv: Advisory, project: str, name: str, version: str, eid: str, did: str, at: str):
        judgment = self.triage.judge(project, name, version, adv.raw)
        if judgment is None:
            return
        self._ensure_agent(self.triage.agent_id, self.triage.name)
        jid = f"judgment:triage:{project}:{name}@{version}:{adv.id}"
        self.write_belief("Judgment", jid,
                          {"project": project, "package": name, "version": version, "advisory": adv.id,
                           "verdict": judgment["verdict"], "rationale": judgment["rationale"],
                           "evidence": json.dumps(judgment["evidence"]), "usages": judgment["usages"]},
                          [{"id": f"support:judged:{jid}", "kind": "judged", "premises": [adv.id, eid]}],
                          by=self.triage.agent_id, at=at, links=[("ADJUSTS", did)])

    def _evidence_key(self, adv: Advisory) -> str:
        """Aliased advisories are one piece of evidence: reuse the key of an already known alias."""
        names = [adv.id, *adv.aliases]
        rows = self.q("""MATCH (a:Advisory) WHERE a.id <> $id AND
                           (a.id IN $names OR any(x IN a.aliases WHERE x IN $names))
                         RETURN a.evidence LIMIT 1""", {"id": adv.id, "names": names})
        if rows:
            return rows[0][0]
        if adv.is_duplicate:
            # "Duplicate Advisory: <original summary>": the original is the same evidence.
            original = adv.summary.split(":", 1)[1].strip().lower()
            rows = self.q("""MATCH (a:Advisory) WHERE a.id <> $id AND toLower(a.summary) = $summary
                               AND NOT coalesce(a.duplicate, false)
                             RETURN a.id, a.evidence LIMIT 1""", {"id": adv.id, "summary": original})
            if rows:
                self._pending_duplicate = rows[0][0]
                return rows[0][1]
        return adv.id

    def _withdraw(self, adv: Advisory, at: str, event_id: str) -> EventResult:
        exists = self.q("MATCH (a:Advisory {id: $id}) RETURN a.status", {"id": adv.id})
        if not exists:
            # Withdrawn before we ever believed it: record it as already retracted, nothing depends on it.
            self._publish(adv, at, event_id)
        result = EventResult(event_id, "withdrawn")
        self.q("""MATCH (a:Advisory {id: $id}) SET a.withdrawn = $at""", {"id": adv.id, "at": at})
        rid = f"retraction:{event_id}"
        result.waves = self.retract([adv.id], at, retraction_id=rid, trigger=event_id, reason=adv.summary)
        if self.auditor:
            self._audit(adv, rid)
        return result

    def _audit(self, adv: Advisory, rid: str):
        dup = self.q("MATCH (:Advisory {id: $id})-[:DUPLICATE_OF]->(o:Advisory) RETURN o.id", {"id": adv.id})
        audit = self.auditor.audit(adv.raw, dup[0][0] if dup else None)
        if audit is None:
            return
        self._ensure_agent(self.auditor.agent_id, self.auditor.name)
        self.q("""MATCH (r:Retraction {id: $rid}), (a:Agent {id: $agent})
                  SET r.classification = $cls, r.rationale = $why, r.original = $orig
                  MERGE (a)-[:WROTE]->(r)""",
               {"rid": rid, "agent": self.auditor.agent_id, "cls": audit["classification"],
                "why": audit["rationale"], "orig": audit["original"]})
        if audit["original"] and audit["original"] != adv.id:
            self.q("""MATCH (a:Advisory {id: $a}), (o:Advisory {id: $o}) WHERE NOT (a)-[:DUPLICATE_OF]->(o)
                      MERGE (a)-[:DUPLICATE_OF]->(o)""", {"a": adv.id, "o": audit["original"]})

    # ------------------------------------------------------------------ truth maintenance

    def retract(self, node_ids: list[str], at: str, retraction_id: str, trigger: str, reason: str,
                by: str = SYSTEM_AGENT) -> list[list[str]]:
        """Retract the given nodes and propagate forward until nothing changes. Returns the waves."""
        self.q("""MERGE (r:Retraction:Node {id: $id})
                  SET r.at = $at, r.reason = $reason, r.trigger = $trigger, r.by = $by""",
               {"id": retraction_id, "at": at, "reason": reason, "trigger": trigger, "by": by})
        if trigger.startswith("event:"):
            self.q("""MATCH (r:Retraction {id: $rid}) MERGE (e:Event:Node {id: $eid}) MERGE (e)-[:TRIGGERED]->(r)""",
                   {"rid": retraction_id, "eid": trigger})
        first = [row[0] for row in self.q(
            """MATCH (n:Node) WHERE n.id IN $ids AND coalesce(n.status, 'held') = 'held'
               SET n.status = 'retracted', n.retracted_at = $at RETURN n.id""", {"ids": node_ids, "at": at})]
        waves = [first] if first else []
        self._link_wave(retraction_id, first, 0)
        while True:
            supports = [row[0] for row in self.q(
                """MATCH (s:Support {status: 'held'})-[:PREMISE]->(p:Node {status: 'retracted'})
                   WITH DISTINCT s SET s.status = 'retracted', s.retracted_at = $at RETURN s.id""", {"at": at})]
            beliefs = [row[0] for row in self.q(
                """MATCH (b:Belief {status: 'held'})
                   OPTIONAL MATCH (b)<-[:SUPPORTS]-(s:Support {status: 'held'})
                   WITH b, count(s) AS held WHERE held = 0
                   SET b.status = 'retracted', b.retracted_at = $at RETURN b.id""", {"at": at})]
            wave = supports + beliefs
            if not wave:
                return waves
            self._link_wave(retraction_id, wave, len(waves))
            waves.append(wave)

    def _link_wave(self, retraction_id: str, ids: list[str], wave: int):
        if ids:
            self.q("""MATCH (r:Retraction {id: $rid}) UNWIND $ids AS nid MATCH (n:Node {id: nid})
                      MERGE (r)-[x:RETRACTED]->(n) SET x.wave = $wave""",
                   {"rid": retraction_id, "ids": ids, "wave": wave})

    # ------------------------------------------------------------------ decisions

    def _recompute_decisions(self):
        """Urgency, evidence and target version of each held decision, from the support that still holds."""
        rows = self.q("""MATCH (d:Decision {status: 'held'})<-[:SUPPORTS]-(:Support {status: 'held'})
                               -[:PREMISE]->(e:Exposure {status: 'held'})<-[:SUPPORTS]-(s:Support {status: 'held'})
                               -[:PREMISE]->(a:Advisory {status: 'held'})
                         RETURN d.id, collect(DISTINCT [a.evidence, a.rank, s.fix, a.id])""")
        # A held Triage judgment moves its advisory's weight by one level for this decision:
        # exploitable here raises it, not reachable here lowers it. The decision takes the highest result.
        adjust = {(did, aid): {"exploitable": 1, "not_reachable": -1}.get(verdict, 0)
                  for did, aid, verdict in self.q("""MATCH (j:Judgment {status: 'held'})-[:ADJUSTS]->(d:Decision)
                                                     RETURN d.id, j.advisory, j.verdict""")}
        updates = []
        for did, items in rows:
            evidence = sorted({e for e, _, _, _ in items})
            top = max(max(1, min(4, rank + adjust.get((did, aid), 0))) for _, rank, _, aid in items)
            # A linked duplicate or alias is the same evidence as its original: the original's ranges decide.
            fixes = [fix for e, _, fix, aid in items if e == aid] or [fix for _, _, fix, _ in items]
            updates.append({"id": did, "urgency": URGENCY_BY_RANK[top], "target": semver.max_version(fixes),
                            "evidence": evidence})
        if updates:
            self.q("""UNWIND $rows AS r MATCH (d:Decision {id: r.id})
                      SET d.urgency = r.urgency, d.target = r.target, d.evidence = r.evidence""", {"rows": updates})

    def _decision_states(self) -> dict[str, DecisionState]:
        return {row[0]: DecisionState(row[0], row[1], row[2], row[3], tuple(row[4] or ()))
                for row in self.q("MATCH (d:Decision) RETURN d.id, d.status, d.urgency, d.target, d.evidence")}

    def _diff(self, before: dict[str, DecisionState], after: dict[str, DecisionState],
              retraction: bool) -> list[DecisionChange]:
        changes = []
        for did, new in sorted(after.items()):
            old = before.get(did)
            if old is None or (old.status == "retracted" and new.status == "held"):
                if new.status == "held":
                    changes.append(DecisionChange(did, "new", old.as_dict() if old else None, new.as_dict()))
                continue
            if old.status == "held" and new.status == "retracted":
                change = "cancel"
            elif old.status == "retracted":
                continue
            elif urgency_rank(new.urgency) > urgency_rank(old.urgency):
                change = "downgrade"
            elif urgency_rank(new.urgency) < urgency_rank(old.urgency):
                change = "escalate"
            elif (old.evidence, old.target) != (new.evidence, new.target):
                change = "unchanged" if retraction else "updated"
            else:
                continue
            changes.append(DecisionChange(did, change, old.as_dict(), new.as_dict()))
        return changes

    def _touched_but_unchanged(self, result: EventResult, before: dict[str, DecisionState]) -> list[DecisionChange]:
        """Decisions downstream of a retracted support whose state did not change at all."""
        retracted = [n for wave in result.waves for n in wave if n.startswith("support:")]
        rows = self.q("""MATCH (s:Support)-[:SUPPORTS]->(:Exposure)<-[:PREMISE]-(:Support)-[:SUPPORTS]->(d:Decision)
                         WHERE s.id IN $ids AND d.status = 'held' RETURN DISTINCT d.id""", {"ids": retracted})
        changed = {c.decision for c in result.changes}
        return [DecisionChange(r[0], "unchanged", before[r[0]].as_dict(), before[r[0]].as_dict())
                for r in rows if r[0] not in changed and r[0] in before]

    # ------------------------------------------------------------------ corrections

    def correct(self, node_id: str, reason: str, by: str = "person:admin", at: str | None = None) -> EventResult:
        """A person says a belief (or an advisory) is wrong: retract it and everything resting only on it."""
        node = self.node(node_id)
        if node is None:
            raise KeyError(node_id)
        if node["kind"] not in ("Advisory", "Exposure", "Judgment"):
            raise ValueError(f"only advisories, exposures and judgments can be corrected, not {node['kind']}")
        at = at or now()
        n = self.q("MATCH (e:Event {kind: 'correction'}) RETURN count(e)")[0][0] + 1
        event_id = f"event:correction:{n}"
        self.q("MERGE (p:Agent:Node {id: $id}) SET p.name = $name, p.person = true", {"id": by, "name": by.split(":")[-1]})
        before = self._decision_states()
        self.q("MATCH (n:Node {id: $id}) SET n.corrected = true, n.corrected_reason = $r", {"id": node_id, "r": reason})
        result = EventResult(event_id, "correction")
        result.waves = self.retract([node_id], at, retraction_id=f"retraction:{event_id}", trigger=event_id,
                                    reason=reason, by=by)
        self.q("MATCH (a:Agent {id: $by}), (r:Retraction {id: $rid}) MERGE (a)-[:WROTE]->(r)",
               {"by": by, "rid": f"retraction:{event_id}"})
        self._recompute_decisions()
        result.changes = self._diff(before, self._decision_states(), retraction=True)
        if result.waves:
            result.changes += self._touched_but_unchanged(result, before)
        seq = (self.q("MATCH (e:Event) RETURN max(e.seq)")[0][0] or 0) + 1
        changes = [{"decision": c.decision, "change": c.change, "before": c.before, "after": c.after}
                   for c in result.changes]
        self.q("""MERGE (e:Event:Node {id: $id})
                  SET e.seq = $seq, e.kind = 'correction', e.at = $at, e.processed_at = $at, e.target = $target,
                      e.reason = $reason, e.by = $by, e.changes = $changes, e.waves = $waves""",
               {"id": event_id, "seq": seq, "at": at, "target": node_id, "reason": reason, "by": by,
                "changes": json.dumps(changes), "waves": json.dumps(result.waves)})
        self._record_changes(event_id, at, result)
        return result

    def what_if(self, node_id: str, reason: str = "what if this were wrong?") -> EventResult:
        """Simulate a correction on a copy of the graph; the live graph is never written."""
        scratch = f"{self.graph_name}__whatif_{uuid.uuid4().hex[:8]}"
        self.db.connection.execute_command("GRAPH.COPY", self.graph_name, scratch)
        try:
            return Engine(graph_name=scratch, db=self.db).correct(node_id, reason, by="person:what-if")
        finally:
            self.db.select_graph(scratch).delete()

    def _record_changes(self, event_id: str, at: str, result: EventResult):
        for c in result.changes:
            self.q("""MATCH (e:Event {id: $e}), (d:Decision {id: $d})
                      MERGE (e)-[x:CHANGED]->(d)
                      SET x.change = $change, x.at = $at, x.before = $before, x.after = $after,
                          x.evidence_before = $eb, x.evidence_after = $ea""",
                   {"e": event_id, "d": c.decision, "change": c.change, "at": at,
                    "before": (c.before or {}).get("urgency") if c.before and c.before.get("status") == "held" else None,
                    "after": c.after.get("urgency") if c.after.get("status") == "held" else None,
                    "eb": len((c.before or {}).get("evidence") or []) if c.before and c.before.get("status") == "held" else 0,
                    "ea": len(c.after.get("evidence") or []) if c.after.get("status") == "held" else 0})

    def _record_event(self, event_id: str, kind: str, adv: Advisory, at: str, result: EventResult):
        changes = [{"decision": c.decision, "change": c.change, "before": c.before, "after": c.after}
                   for c in result.changes]
        seq = (self.q("MATCH (e:Event) RETURN max(e.seq)")[0][0] or 0) + 1
        self.q("""MERGE (e:Event:Node {id: $id})
                  SET e.seq = $seq, e.kind = $kind, e.advisory = $adv, e.at = $at, e.processed_at = $processed,
                      e.changes = $changes, e.waves = $waves""",
               {"id": event_id, "seq": seq, "kind": kind, "adv": adv.id, "at": at, "processed": now(),
                "changes": json.dumps(changes), "waves": json.dumps(result.waves)})
        self.q("MATCH (e:Event {id: $e}), (a:Advisory {id: $a}) MERGE (e)-[:ABOUT]->(a)", {"e": event_id, "a": adv.id})
        self._record_changes(event_id, at, result)

    def history(self, decision: str) -> list[dict]:
        """Every event that changed a decision, oldest first."""
        rows = self.q("""MATCH (e:Event)-[x:CHANGED]->(d:Decision {id: $id})
                         RETURN e.id, e.kind, e.advisory, x.at, x.change, x.before, x.after,
                                x.evidence_before, x.evidence_after
                         ORDER BY x.at, e.id""", {"id": decision})
        return [{"event": r[0], "kind": r[1], "advisory": r[2], "at": r[3], "change": r[4], "before": r[5],
                 "after": r[6], "evidence_before": r[7], "evidence_after": r[8]} for r in rows]

    def record_action(self, decision: str, kind: str, url: str, at: str, plan: str | None = None):
        """Record a real change made on GitHub because of a decision (and the plan that chose it)."""
        seq = self.q("MATCH (a:Action) RETURN count(a)")[0][0] + 1
        aid = f"action:{seq}:{decision}"
        self.q("""MATCH (d:Decision {id: $d})
                  CREATE (a:Action:Node {id: $id, kind: $kind, url: $url, at: $at, plan: $plan})
                  CREATE (d)-[:CAUSED]->(a)""",
               {"d": decision, "id": aid, "kind": kind, "url": url, "at": at, "plan": plan})
        if plan:
            self.q("MATCH (p:Plan {id: $p}), (a:Action {id: $a}) MERGE (p)-[:CAUSED]->(a)", {"p": plan, "a": aid})

    def write_plan(self, decision: str, action: str, rationale: str, point: str, allowed: list[str], agent,
                   premises: list[str], at: str | None = None) -> str:
        """Record an agent's choice of action as a Plan resting on what it saw; earlier plans are superseded."""
        at = at or now()
        self._ensure_agent(agent.agent_id, getattr(agent, "name", None) or agent.by)
        n = self.q("MATCH (p:Plan)-[:FOR]->(:Decision {id: $d}) RETURN count(p)", {"d": decision})[0][0] + 1
        pid = f"plan:{decision.removeprefix('decision:')}:{n}"
        self.q("""MATCH (p:Plan {status: 'held'})-[:FOR]->(:Decision {id: $d})
                  SET p.status = 'superseded', p.superseded_at = $at""", {"d": decision, "at": at})
        project = self.q("MATCH (d:Decision {id: $d}) RETURN d.project", {"d": decision})[0][0]
        self.write_belief("Plan", pid, {"project": project, "decision": decision, "action": action,
                                        "rationale": rationale, "point": point, "allowed": allowed, "seq": n},
                          [{"id": f"support:planned:{pid}", "kind": "planned", "premises": premises}],
                          by=agent.agent_id, at=at, links=[("FOR", decision)])
        self.q("""MATCH (p:Plan {id: $p}) SET p.status = 'held'
                  WITH p MATCH (d:Decision {id: $d}) SET d.plan_id = $p""", {"p": pid, "d": decision})
        return pid

    def plans(self, decision: str) -> list[dict]:
        rows = self.q("""MATCH (p:Plan)-[:FOR]->(:Decision {id: $d})
                         OPTIONAL MATCH (a:Agent)-[:WROTE]->(:Support)-[:SUPPORTS]->(p)
                         OPTIONAL MATCH (p)-[:CAUSED]->(x:Action)
                         RETURN p.id, p.action, p.rationale, p.point, p.status, p.created_at, a.name, collect(x.url),
                                p.seq AS seq
                         ORDER BY seq""", {"d": decision})
        return [{"id": r[0], "action": r[1], "rationale": r[2], "point": r[3], "status": r[4], "at": r[5],
                 "by": r[6], "actions": [u for u in r[7] if u]} for r in rows]

    def actions(self, decision: str) -> list[dict]:
        rows = self.q("""MATCH (:Decision {id: $d})-[:CAUSED]->(a:Action) RETURN a.kind, a.url, a.at ORDER BY a.at, a.id""",
                      {"d": decision})
        return [{"kind": r[0], "url": r[1], "at": r[2]} for r in rows]

    # ------------------------------------------------------------------ reads

    def decisions(self, project: str | None = None) -> list[dict]:
        rows = self.q("""MATCH (d:Decision) WHERE $project IS NULL OR d.project = $project
                         RETURN d.id, d.project, d.package, d.status, d.urgency, d.target, d.evidence, d.pr_url,
                                d.acted_mode
                         ORDER BY d.project, d.package""", {"project": project})
        return [{"id": r[0], "project": r[1], "package": r[2], "status": r[3], "urgency": r[4],
                 "target": r[5], "evidence": r[6] or [], "pr_url": r[7], "mode": r[8]} for r in rows]

    def node(self, node_id: str) -> dict | None:
        rows = self.q("MATCH (n:Node {id: $id}) RETURN labels(n), properties(n)", {"id": node_id})
        if not rows:
            return None
        labels, props = rows[0]
        kind = next((label for label in labels if label not in ("Node", "Belief")), labels[0])
        return {"kind": kind, **props}

    def why(self, node_id: str, depth: int = 6) -> dict | None:
        """The chain of support behind a node, including support that was retracted and why."""
        node = self.node(node_id)
        if node is None:
            return None
        node.pop("details", None)
        retractions = self.q("""MATCH (r:Retraction)-[x:RETRACTED]->(n:Node {id: $id})
                                RETURN r.id, r.at, r.reason, r.trigger, x.wave, r.classification, r.rationale,
                                       r.original, r.by""", {"id": node_id})
        node["retracted_by"] = [{"id": r[0], "at": r[1], "reason": r[2], "trigger": r[3], "wave": r[4],
                                 "classification": r[5], "rationale": r[6], "original": r[7], "by": r[8]}
                                for r in retractions]
        if node["kind"] == "Decision":
            node["history"] = self.history(node_id)
            node["actions"] = self.actions(node_id)
            node["plans"] = self.plans(node_id)
            node["judgments"] = [self.why(r[0], 1) for r in self.q(
                "MATCH (j:Judgment)-[:ADJUSTS]->(:Decision {id: $id}) RETURN j.id ORDER BY j.id", {"id": node_id})]
        if node["kind"] == "Judgment":
            repo = self.q("MATCH (p:Project {id: $p}) RETURN p.repo", {"p": node.get("project")})
            node["repo"] = repo[0][0] if repo else None
        if node["kind"] == "Exposure":
            dep = self.q("""MATCH (e:Exposure {id: $id})-[:OF]->(v:PackageVersion)<-[d:DEPENDS_ON]-(p:Project)
                            WHERE p.id = e.project RETURN d.direct, d.paths, d.dev""", {"id": node_id})
            if dep:
                node["direct"], node["paths"], node["dev"] = dep[0]
        if depth == 0:
            return node
        supports = self.q("""MATCH (n:Node {id: $id})<-[:SUPPORTS]-(s:Support)
                             OPTIONAL MATCH (a:Agent)-[:WROTE]->(s)
                             OPTIONAL MATCH (s)-[:PREMISE]->(p:Node)
                             RETURN s.id, properties(s), a.name, collect(p.id) ORDER BY s.id""", {"id": node_id})
        node["supports"] = []
        for sid, props, author, premises in supports:
            props = dict(props)
            props.pop("id", None)
            node["supports"].append({"id": sid, **props, "by": author,
                                     "premises": [self.why(p, depth - 1) for p in premises]})
        return node
