"""Command line entry points: python -m retcon.cli <command>."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .engine import Engine

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "tests" / "fixtures"

PROJECTS = {
    "wiredoor": ("Rudransh-1508/retcon-target-wiredoor", "e80904fed7a69cc7d4aa34f9c24ce4eba7803f76", "2025-07-17",
                 "package-lock.json"),
    "gladys": ("Rudransh-1508/retcon-target-gladys", "7eb0b2acaa14dd8b38dd8e095642381c9491d457", "2022-12-18",
               "server/package-lock.json"),
}


def seed_fixtures(engine: Engine):
    """Load both projects and replay the fixture advisories in time order (skeleton data)."""
    from .advisory import events_for
    for project, (repo, sha, date, path) in PROJECTS.items():
        lock = json.loads((FIXTURES / "lockfiles" / f"{project}.package-lock.json").read_text())
        engine.add_project(project, repo, sha, date, lock, path)
    events = []
    for f in sorted((FIXTURES / "advisories").glob("*.json")):
        events += events_for(json.loads(f.read_text()))
    for event in sorted(events, key=lambda e: e["at"]):
        r = engine.process_event(event)
        print(event["at"][:10], event["kind"], event["advisory"]["id"], [(c.decision, c.change) for c in r.changes])


def reconciler(engine: Engine):
    """Reconciler wired to real GitHub, with the Groq Fixer when keys are configured."""
    from . import config
    from .actions import Reconciler
    from .fixer import FixerWriter
    from .github import RealGitHub
    from .llm import GroqLLM
    writer = FixerWriter(GroqLLM()) if config.groq_keys() else None
    return Reconciler(engine, RealGitHub(), writer=writer)


def main():
    parser = argparse.ArgumentParser(prog="retcon")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("seed-fixtures")
    sub.add_parser("wipe")
    sub.add_parser("reconcile")
    args = parser.parse_args()
    engine = Engine()
    if args.cmd == "seed-fixtures":
        seed_fixtures(engine)
    elif args.cmd == "wipe":
        engine.delete_graph()
    elif args.cmd == "reconcile":
        for done in reconciler(engine).reconcile():
            print(done.kind, done.decision, done.url)


if __name__ == "__main__":
    main()
