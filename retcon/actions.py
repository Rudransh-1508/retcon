"""Carry Decisions out as real GitHub Actions, and keep them in line with what the graph now believes.

Reconciling compares each Decision with what was last done for it on GitHub and makes the smallest
change: open, update, relabel and comment, close, or nothing. P0 and P1 decisions get their own pull
request; P2 and P3 decisions are listed in one report issue per project until they escalate. A
decision that already has a pull request keeps it while it holds, even after a downgrade.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Callable

from . import config, text
from .engine import Engine, now, urgency_rank
from .github import GitHubPort
from .planner import KEEP_PR, MOVE_TO_REPORT, OPEN_PR, REOPEN_PR, REPORT, DefaultPlanner, situation
from .upgrade import UpgradeItem, Upgrade, build

PR_URGENCIES = ("P0", "P1")


def marker(decision_id: str) -> str:
    return f"<!-- retcon:decision={decision_id} -->"


def report_marker(project: str) -> str:
    return f"<!-- retcon:report={project} -->"


Builder = Callable[[str, str, str, str, str, list[UpgradeItem]], Upgrade]


def default_builder(package_json, lockfile, package_json_path, lockfile_path, name, plan):
    return build(package_json, lockfile, package_json_path, lockfile_path, name, plan, regenerate=True)


@dataclass
class Done:
    decision: str
    kind: str  # open_pr | reopen | update | relabel | comment | close | push | report | relink
    url: str


class Reconciler:
    def __init__(self, engine: Engine, github: GitHubPort, builder: Builder = default_builder,
                 writer: text.Writer | None = None, planner=None):
        self.engine, self.gh, self.builder = engine, github, builder
        self.writer = writer or text.TemplateWriter()
        self.planner = planner or DefaultPlanner()
        self._plan_id: str | None = None
        self._files: dict[tuple[str, str], str] = {}

    # ------------------------------------------------------------------ public

    def reconcile(self, project: str | None = None, report: bool = True) -> list[Done]:
        """Bring GitHub in line with the graph. With report=False, report issues are left for a later pass."""
        done: list[Done] = []
        projects = [project] if project else [r[0] for r in self.engine.q("MATCH (p:Project) RETURN p.id")]
        for pid in projects:
            for d in self._decisions(pid):
                actions, dirty = self._reconcile_decision(d)
                done += actions
                if dirty:
                    self.engine.q("MATCH (p:Project {id: $p}) SET p.report_dirty = true", {"p": pid})
            if report and self.engine.q("MATCH (p:Project {id: $p}) RETURN coalesce(p.report_dirty, false)",
                                        {"p": pid})[0][0]:
                done += self._update_report(pid)
                self.engine.q("MATCH (p:Project {id: $p}) SET p.report_dirty = false", {"p": pid})
        return done

    # ------------------------------------------------------------------ per decision

    def _decisions(self, project: str) -> list[dict]:
        rows = self.engine.q("""MATCH (d:Decision {project: $p})-[:IN]->(p:Project)
                                RETURN properties(d), p.repo, p.lockfile_path ORDER BY d.package""", {"p": project})
        return [{**props, "repo": repo, "lockfile_path": path} for props, repo, path in rows]

    def _reconcile_decision(self, d: dict) -> tuple[list[Done], bool]:
        held = d["status"] == "held"
        acted = d.get("acted_mode")  # None | pr | report | closed
        evidence = sorted(d.get("evidence") or []) if held else []
        state = (d["status"], d.get("urgency") if held else None, d.get("target") if held else None, evidence)
        last = (d.get("acted_status"), d.get("acted_urgency"), d.get("acted_target"),
                sorted(json.loads(d.get("acted_evidence") or "[]")))
        if acted is None and d.get("pr_number") is None:
            item = self.gh.find_by_marker(d["repo"], marker(d["id"]))
            if item is not None:  # graph was rebuilt: re-link instead of opening a duplicate
                self._remember_pr(d, item.number, item.url, "pr" if item.state == "open" else "closed")
                d.update(pr_number=item.number, pr_url=item.url, acted_mode="pr" if item.state == "open" else "closed")
                acted = d["acted_mode"]
        plan_retracted = held and acted == "pr" and self._plan_status(d) == "retracted"
        if state == last and acted is not None and not plan_retracted:
            return [], False
        if not held and acted in (None, "report", "closed"):
            self._mark(d, state, "closed" if acted in ("report", "closed") else None)
            return [], acted == "report"

        point = self._decision_point(d, acted, last, plan_retracted)
        s = situation(d, acted, point, {}) if point else None
        if s is None and not held and acted == "pr":  # Cancel: always close, no agent decides this
            done = self._close(d, self._context(d))
            self._mark(d, state, "closed")
            return done, False
        if s is None:  # nothing to decide: keep what exists in line with the graph
            if acted == "report":
                self._mark(d, state, "report")
                return [], True
            done = self._update(d, self._context(d), last) if acted == "pr" else []
            self._mark(d, state, acted)
            return done, False

        ctx = self._context(d)
        s.facts = self._facts(d, ctx, last)
        choice = self.planner.choose(s)
        plan_id = self.engine.write_plan(d["id"], choice.action, choice.rationale, point, s.allowed, choice,
                                         premises=self._plan_premises(d, ctx), at=self._event_time(d))
        ctx["plan"] = {"id": plan_id, "action": choice.action, "rationale": choice.rationale, "by": choice.by}
        self._plan_id = plan_id
        done: list[Done] = []
        mode = acted
        if choice.action == OPEN_PR:
            done += self._reopen(d, ctx) if d.get("pr_number") is not None else [self._open_pr(d, ctx)]
            mode = "pr"
        elif choice.action == REOPEN_PR:
            done += self._reopen(d, ctx)
            mode = "pr"
        elif choice.action == REPORT:
            mode = "report"
        elif choice.action == MOVE_TO_REPORT:
            done += self._close(d, ctx, "move_to_report", last)
            mode = "report"
        elif choice.action == KEEP_PR:
            done += self._update(d, ctx, last)
            mode = "pr"
        self._plan_id = None
        self._mark(d, state, mode)
        return done, mode == "report" or acted == "report"

    def _decision_point(self, d: dict, acted: str | None, last: tuple, plan_retracted: bool) -> str | None:
        held = d["status"] == "held"
        if acted is None:
            return "new" if held else None
        if acted == "report":
            return "escalate" if held and urgency_rank(d.get("urgency")) < urgency_rank(last[1]) else None
        if acted == "closed":
            return "reheld" if held else None
        if not held:
            return None  # a Cancel is not a decision point: cancelled work is always closed
        if last[1] and urgency_rank(d.get("urgency")) > urgency_rank(last[1]):
            return "downgrade"
        return "replan" if plan_retracted else None

    def _event_time(self, d: dict) -> str:
        """When, in the history, this decision last changed: plans and actions are dated to the event they answer."""
        rows = self.engine.q("MATCH (e:Event)-[:CHANGED]->(:Decision {id: $id}) RETURN max(e.at)", {"id": d["id"]})
        return rows[0][0] if rows and rows[0][0] else now()

    def _plan_status(self, d: dict) -> str | None:
        rows = self.engine.q("MATCH (p:Plan {id: $id}) RETURN p.status", {"id": d.get("plan_id") or ""})
        return rows[0][0] if rows else None

    def _plan_premises(self, d: dict, ctx: dict) -> list[str]:
        """A plan rests on the decision and the advisories it saw, or, for cancelled work, on the event that cancelled it."""
        if d["status"] == "held":
            held = [a["id"] for a in text.held_advisories(ctx)][:25]
            return [d["id"], *held]
        rows = self.engine.q("""MATCH (e:Event)-[:CHANGED]->(:Decision {id: $id}) RETURN e.id ORDER BY e.seq DESC LIMIT 1""",
                             {"id": d["id"]})
        return [rows[0][0]] if rows else [d["id"]]

    def _facts(self, d: dict, ctx: dict, last: tuple) -> dict:
        items = self._upgrade_items(d) if d["status"] == "held" else []
        target = d.get("target")
        majors = {v.version.split(".")[0] for v in items}
        major_bump = bool(target and target != "none" and any(m != target.split(".")[0] for m in majors))
        judgments = [{"advisory": j.get("advisory"), "verdict": j.get("verdict"), "status": j.get("status"),
                      "rationale": j.get("rationale")} for j in ctx["why"].get("judgments", [])]
        return {"project": d["project"], "package": d["package"], "status": d["status"],
                "urgency_now": d.get("urgency") if d["status"] == "held" else None, "urgency_before": last[1],
                "installed_versions": sorted({v.version for v in items}),
                "direct_dependency": any(v.direct for v in items), "target_version": target,
                "crosses_major_version": major_bump,
                "advisories_still_holding": [{k: a[k] for k in ("id", "severity", "summary")}
                                             for a in text.held_advisories(ctx)][:15],
                "advisories_withdrawn": [{k: a[k] for k in ("id", "summary")} for a in text.retracted_advisories(ctx)][:10],
                "triage_judgments": judgments, "recent_changes": ctx.get("new_history", [])[-8:]}

    def _context(self, d: dict) -> dict:
        why = self.engine.why(d["id"])
        return {"decision": d, "why": why, "advisories": self._advisories(d["id"]),
                "history": why.get("history", []), "new_history": self._new_history(d),
                "ui": f"{config.env('RETCON_PUBLIC_URL', 'https://retcon-kappa.vercel.app')}/?why={d['id']}",
                "marker": marker(d["id"])}

    def _new_history(self, d: dict) -> list[dict]:
        acted_seq = d.get("acted_seq") or 0
        rows = self.engine.q("""MATCH (e:Event)-[x:CHANGED]->(:Decision {id: $id}) WHERE coalesce(e.seq, 0) > $seq
                                OPTIONAL MATCH (e)-[:TRIGGERED]->(r:Retraction)
                                RETURN e.kind, e.advisory, x.change, x.before, x.after, x.at, r.classification,
                                       r.rationale, e.target, e.reason, e.by ORDER BY e.seq""",
                             {"id": d["id"], "seq": acted_seq})
        return [{"kind": r[0], "advisory": r[1], "change": r[2], "before": r[3], "after": r[4], "at": r[5],
                 "classification": r[6], "rationale": r[7], "target": r[8], "reason": r[9], "by": r[10]}
                for r in rows]

    def _advisories(self, decision_id: str) -> list[dict]:
        rows = self.engine.q("""MATCH (:Decision {id: $id})<-[:SUPPORTS]-(:Support)-[:PREMISE]->(e:Exposure)
                                      <-[:SUPPORTS]-(s:Support)-[:PREMISE]->(a:Advisory)
                                RETURN DISTINCT a.id, a.summary, a.severity, a.status, a.url, a.withdrawn,
                                       e.version, s.fix, a.evidence
                                ORDER BY a.status, a.id""", {"id": decision_id})
        return [{"id": r[0], "summary": r[1], "severity": r[2], "status": r[3], "url": r[4], "withdrawn": r[5],
                 "version": r[6], "fix": r[7], "evidence": r[8]} for r in rows]

    def _upgrade_items(self, d: dict) -> list[UpgradeItem]:
        rows = self.engine.q("""MATCH (dec:Decision {id: $id})<-[:SUPPORTS]-(:Support {status: 'held'})
                                      -[:PREMISE]->(e:Exposure {status: 'held'})<-[:SUPPORTS]-(s:Support {status: 'held'})
                                      -[:PREMISE]->(:Advisory {status: 'held'})
                                MATCH (e)-[:OF]->(v:PackageVersion)<-[dep:DEPENDS_ON]-(:Project {id: dec.project})
                                RETURN e.version, collect(s.fix), dep.direct""", {"id": d["id"]})
        from .semver import max_version
        return [UpgradeItem(version=r[0], fix=max_version(r[1]), direct=bool(r[2])) for r in rows]

    def _upgrade(self, d: dict) -> Upgrade:
        lock_path = d["lockfile_path"]
        pkg_path = lock_path.rsplit("/", 1)[0] + "/package.json" if "/" in lock_path else "package.json"
        branch = self.gh.default_branch(d["repo"])
        for path in (pkg_path, lock_path):
            if (d["repo"], path) not in self._files:
                self._files[(d["repo"], path)] = self.gh.read_file(d["repo"], path, branch)
        return self.builder(self._files[(d["repo"], pkg_path)], self._files[(d["repo"], lock_path)],
                            pkg_path, lock_path, d["package"], self._upgrade_items(d))

    # ------------------------------------------------------------------ actions

    def _labels(self, d: dict) -> list[str]:
        return ["retcon", d["urgency"]] if d["status"] == "held" else ["retcon", "cancelled"]

    def _open_pr(self, d: dict, ctx: dict) -> Done:
        upgrade = self._upgrade(d)
        ctx["upgrade_notes"] = upgrade.notes
        title, body = self.writer.pr(ctx)
        branch = f"retcon/{d['package'].replace('@', '').replace('/', '-')}"
        item = self.gh.open_pr(d["repo"], branch, title, body, self._labels(d), upgrade.files,
                               f"Upgrade {d['package']} (Retcon {d['urgency']})")
        self._remember_pr(d, item.number, item.url, "pr")
        d.update(pr_number=item.number, pr_url=item.url)
        self.engine.record_action(d["id"], "open_pr", item.url, self._event_time(d), plan=self._plan_id)
        return Done(d["id"], "open_pr", item.url)

    def _update(self, d: dict, ctx: dict, last: tuple) -> list[Done]:
        done = []
        repo, number = d["repo"], d["pr_number"]
        if d.get("target") != last[2] and last[2] is not None:
            upgrade = self._upgrade(d)
            ctx["upgrade_notes"] = upgrade.notes
            self.gh.push_files(repo, f"retcon/{d['package'].replace('@', '').replace('/', '-')}", upgrade.files,
                               f"Retarget {d['package']} to {d['target']} (Retcon)")
            done.append(Done(d["id"], "push", d["pr_url"]))
        title, body = self.writer.pr(ctx)
        self.gh.update(repo, number, title=title, body=body, labels=self._labels(d))
        done.append(Done(d["id"], "update", d["pr_url"]))
        change = None
        if last[1] and urgency_rank(d["urgency"]) > urgency_rank(last[1]):
            change = "downgrade"
        elif last[1] and urgency_rank(d["urgency"]) < urgency_rank(last[1]):
            change = "escalate"
        elif sorted(d.get("evidence") or []) != last[3] and len(d.get("evidence") or []) < len(last[3]):
            change = "unchanged"
        if change:
            url = self.gh.comment(repo, number, self.writer.comment(change, ctx, last))
            self.engine.record_action(d["id"], f"comment:{change}", url, self._event_time(d), plan=self._plan_id)
            done.append(Done(d["id"], "comment", url))
        return done

    def _close(self, d: dict, ctx: dict, why: str = "cancel", last: tuple | None = None) -> list[Done]:
        repo, number = d["repo"], d["pr_number"]
        url = self.gh.comment(repo, number, self.writer.comment(why, ctx, last))
        title, body = self.writer.pr(ctx)
        self.gh.update(repo, number, title=title, body=body, labels=self._labels(d), state="closed")
        self.engine.record_action(d["id"], "close" if why == "cancel" else why, url, self._event_time(d), plan=self._plan_id)
        return [Done(d["id"], "comment", url), Done(d["id"], "close", d["pr_url"])]

    def _reopen(self, d: dict, ctx: dict) -> list[Done]:
        repo, number = d["repo"], d["pr_number"]
        title, body = self.writer.pr(ctx)
        self.gh.update(repo, number, title=title, body=body, labels=self._labels(d), state="open")
        url = self.gh.comment(repo, number, self.writer.comment("reopen", ctx, None))
        self.engine.record_action(d["id"], "reopen", url, self._event_time(d), plan=self._plan_id)
        return [Done(d["id"], "reopen", d["pr_url"]), Done(d["id"], "comment", url)]

    def _update_report(self, project: str) -> list[Done]:
        rows = self.engine.q("""MATCH (d:Decision {project: $p})-[:IN]->(p:Project)
                                WHERE d.acted_mode = 'report' OR (d.acted_mode = 'closed' AND coalesce(d.reported, false))
                                RETURN properties(d), p.repo ORDER BY d.urgency, d.package""", {"p": project})
        if not rows:
            return []
        repo = rows[0][1]
        decisions = [r[0] for r in rows]
        title, body = self.writer.report(project, decisions, report_marker(project),
                                         config.env("RETCON_PUBLIC_URL", "https://retcon-kappa.vercel.app"))
        number = self.engine.q("MATCH (p:Project {id: $p}) RETURN p.report_number", {"p": project})[0][0]
        if number is None:
            existing = self.gh.find_by_marker(repo, report_marker(project))
            number = existing.number if existing else None
        if number is None:
            item = self.gh.open_issue(repo, title, body, ["retcon"])
        else:
            item = self.gh.update(repo, number, title=title, body=body, state="open")
        self.engine.q("MATCH (p:Project {id: $p}) SET p.report_number = $n, p.report_url = $u",
                      {"p": project, "n": item.number, "u": item.url})
        return [Done(f"report:{project}", "report", item.url)]

    # ------------------------------------------------------------------ bookkeeping

    def _remember_pr(self, d: dict, number: int, url: str, mode: str):
        self.engine.q("MATCH (d:Decision {id: $id}) SET d.pr_number = $n, d.pr_url = $u, d.acted_mode = $m",
                      {"id": d["id"], "n": number, "u": url, "m": mode})

    def _mark(self, d: dict, state: tuple, mode: str | None):
        seq = self.engine.q("MATCH (e:Event) RETURN max(e.seq)")[0][0] or 0
        self.engine.q("""MATCH (d:Decision {id: $id})
                         SET d.reported = coalesce(d.reported, false) OR $m = 'report', d.acted_status = $s, d.acted_urgency = $u, d.acted_target = $t, d.acted_evidence = $e,
                             d.acted_mode = $m, d.acted_at = $at, d.acted_seq = $seq""",
                      {"id": d["id"], "s": state[0], "u": state[1], "t": state[2], "e": json.dumps(state[3]),
                       "m": mode, "at": now(), "seq": seq})
