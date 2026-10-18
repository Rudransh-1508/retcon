"""The worker: load projects, read the advisory feed, apply events in order, and reconcile GitHub.

A project is only acted on for events at or after its snapshot date; earlier advisories count as
known at the snapshot. With a pause, events are spaced out so the replay can be watched live.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

from . import feed, projects
from .actions import Reconciler
from .engine import Engine

log = logging.getLogger("retcon.worker")
SIGNIFICANT = {"new", "cancel", "downgrade", "escalate"}


@dataclass
class RunReport:
    rebuilt: bool = False
    events: int = 0
    skipped: int = 0
    actions: list = field(default_factory=list)


def run(engine: Engine, reconciler: Reconciler | None, github, archive=None, pause: float = 0.0,
        changed_since=feed.changed_since) -> RunReport:
    report = RunReport()
    if not engine.q("MATCH (p:Project) RETURN count(p)")[0][0]:
        projects.load(engine, github)
    snapshots = {r[0]: r[1] for r in engine.q("MATCH (p:Project) RETURN p.id, p.snapshot_date")}
    packages = feed.relevant_packages(engine)
    cursor = feed.get_cursor(engine)
    if cursor is None:
        report.rebuilt = True
        advisories, cursor_after = feed.advisories_from_archive(archive, packages)
    else:
        advisories, cursor_after = changed_since(cursor, packages)
    events = feed.ordered_events(advisories)
    log.info("%d advisories, %d events (rebuild=%s)", len(advisories), len(events), report.rebuilt)
    for event in events:
        result = engine.process_event(event)
        if result.skipped:
            report.skipped += 1
            continue
        report.events += 1
        significant = [c for c in result.changes if c.change in SIGNIFICANT or event["kind"] == "withdrawn"]
        if reconciler is None or not significant:
            continue
        day = event["at"][:10]
        touched = {c.decision.split(":")[1] for c in significant}
        live = [p for p in sorted(touched) if snapshots.get(p, "9999") <= day]
        for project in live:
            report.actions += reconciler.reconcile(project, report=False)
        if live and pause:
            time.sleep(pause)
    if reconciler is not None:
        report.actions += reconciler.reconcile()
    feed.set_cursor(engine, cursor_after)
    return report


RESET_NOTE = ("**Retcon reset.** History is being replayed from scratch; this item is archived and a fresh one "
              "will follow if it is still needed.")


def reset(engine: Engine, github, repos) -> list[tuple[str, int]]:
    """Archive every Retcon item (close it and neutralise its marker), delete Retcon branches, wipe the graph."""
    archived = []
    for repo in repos:
        for item in github.retcon_items(repo):
            body = item.body.replace("<!-- retcon:", "<!-- retcon-archived:")
            if item.state == "open":
                github.comment(repo, item.number, RESET_NOTE)
            github.update(repo, item.number, body=body, state="closed")
            archived.append((repo, item.number))
        github.delete_branches(repo, "retcon/")
    engine.delete_graph()
    return archived
