"""With and without the reasons: how three ways of handling the same real withdrawals compare.

For every withdrawal in the graph, take each decision that was held at that moment and rested on the withdrawn
advisory. What should happen to it is a fact, not Retcon's opinion: it should be cancelled only if no other
advisory behind it still stands (published by then and not withdrawn). Three strategies are scored against that:

- **Retcon**: what the engine actually did, read from the event's recorded changes.
- **Undo without reasons**: a memory that only knows "this work was done because of that advisory" cancels every
  decision linked to it, the way a naive cleanup would.
- **Ignore withdrawals**: a memory with no notion of withdrawal keeps everything.

It also counts the agents' own beliefs (Triage judgments, Planner plans) that the retraction took back: a memory
that stores conclusions without their reasons would have kept them.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

from .engine import Engine

PR_OPENS = {"open_pr", "reopen"}
PR_CLOSES = {"close", "move_to_report"}


@dataclass
class Case:
    event: str
    advisory: str
    at: str
    decision: str
    should_cancel: bool
    retcon_cancelled: bool
    retcon_change: str
    others_still_standing: int
    had_open_pr: bool


@dataclass
class Report:
    withdrawals: int = 0
    withdrawals_touching_work: int = 0
    cases: list[Case] = field(default_factory=list)
    beliefs_taken_back: dict = field(default_factory=dict)

    def score(self, cancels) -> dict:
        wrong_cancel = [c for c in self.cases if cancels(c) and not c.should_cancel]
        stale = [c for c in self.cases if not cancels(c) and c.should_cancel]
        return {"correct": len(self.cases) - len(wrong_cancel) - len(stale), "decisions": len(self.cases),
                "wrongly_cancelled": len(wrong_cancel), "stale_kept": len(stale),
                "open_prs_wrongly_closed": sum(c.had_open_pr for c in wrong_cancel),
                "open_prs_left_stale": sum(c.had_open_pr for c in stale)}

    def summary(self) -> dict:
        return {
            "withdrawals": self.withdrawals,
            "withdrawals_touching_held_work": self.withdrawals_touching_work,
            "retcon": self.score(lambda c: c.retcon_cancelled),
            "undo_without_reasons": self.score(lambda c: True),
            "ignore_withdrawals": self.score(lambda c: False),
            "agent_beliefs_taken_back": self.beliefs_taken_back,
        }


def _held_before(history: list[dict], event: str, at: str) -> bool:
    """Was the decision held just before this event? Its last change before the event decides."""
    earlier = [h for h in history if (h["at"], h["event"]) < (at, event)]
    return bool(earlier) and earlier[-1]["change"] != "cancel"


def _pr_open_at(actions: list[dict], at: str) -> bool:
    state = False
    for a in actions:
        if a["at"] is None or a["at"] >= at:
            break
        if a["kind"] in PR_OPENS:
            state = True
        elif a["kind"] in PR_CLOSES:
            state = False
    return state


def evaluate(engine: Engine) -> Report:
    report = Report()
    withdrawals = engine.q("""MATCH (e:Event {kind: 'withdrawn'})-[:ABOUT]->(a:Advisory)
                              RETURN e.id, a.id, e.at ORDER BY e.at, e.id""")
    report.withdrawals = len(withdrawals)
    histories: dict[str, list[dict]] = {}
    for event, advisory, at in withdrawals:
        rows = engine.q("""MATCH (a:Advisory {id: $a})<-[:PREMISE]-(:Support {kind: 'affects'})-[:SUPPORTS]->(x:Exposure)
                                 <-[:PREMISE]-(:Support {kind: 'resolves'})-[:SUPPORTS]->(d:Decision)
                           RETURN DISTINCT d.id""", {"a": advisory})
        touched = False
        for (decision,) in rows:
            history = histories.setdefault(decision, engine.history(decision))
            if not _held_before(history, event, at):
                continue
            touched = True
            others = engine.q("""MATCH (d:Decision {id: $d})<-[:SUPPORTS]-(:Support {kind: 'resolves'})-[:PREMISE]->(x:Exposure)
                                       <-[:SUPPORTS]-(:Support {kind: 'affects'})-[:PREMISE]->(b:Advisory)
                                 WHERE b.id <> $a AND b.published <= $at AND (b.withdrawn IS NULL OR b.withdrawn > $at)
                                 RETURN count(DISTINCT b)""", {"d": decision, "a": advisory, "at": at})[0][0]
            change = engine.q("MATCH (:Event {id: $e})-[x:CHANGED]->(:Decision {id: $d}) RETURN x.change",
                              {"e": event, "d": decision})
            change = change[0][0] if change else "none"
            report.cases.append(Case(event, advisory, at, decision, should_cancel=others == 0,
                                     retcon_cancelled=change == "cancel", retcon_change=change,
                                     others_still_standing=others,
                                     had_open_pr=_pr_open_at(engine.actions(decision), at)))
        report.withdrawals_touching_work += touched
    taken = engine.q("""MATCH (:Event {kind: 'withdrawn'})-[:TRIGGERED]->(:Retraction)-[r:RETRACTED]->(n)
                        WHERE n:Judgment OR n:Plan
                        RETURN CASE WHEN n:Judgment THEN 'triage_judgments' ELSE 'planner_plans' END, count(DISTINCT n)""")
    report.beliefs_taken_back = {kind: count for kind, count in taken}
    return report


def as_markdown(summary: dict, source: str) -> str:
    def row(name, s):
        return (f"| {name} | {s['correct']} / {s['decisions']} | {s['wrongly_cancelled']} | {s['stale_kept']} | "
                f"{s['open_prs_wrongly_closed']} | {s['open_prs_left_stale']} |")
    b = summary["agent_beliefs_taken_back"]
    return "\n".join([
        f"Source: {source}. {summary['withdrawals']} real withdrawals, {summary['withdrawals_touching_held_work']} of them "
        "touching a held decision.",
        "",
        "| Strategy | Decisions handled correctly | Wrongly cancelled | Stale, kept with no support | Open PRs wrongly closed | Open PRs left stale |",
        "|---|---|---|---|---|---|",
        row("**Retcon** (follows the reasons)", summary["retcon"]),
        row("Undo without reasons", summary["undo_without_reasons"]),
        row("Ignore withdrawals", summary["ignore_withdrawals"]),
        "",
        f"Agent beliefs taken back with their evidence: {b.get('triage_judgments', 0)} Triage judgments and "
        f"{b.get('planner_plans', 0)} Planner plans. A memory that stores conclusions without reasons keeps them.",
    ])


def report_dict(report: Report) -> dict:
    return {"summary": report.summary(), "cases": [asdict(c) for c in report.cases]}
