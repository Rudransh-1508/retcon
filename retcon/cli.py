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


def reconciler(engine: Engine, gh=None):
    """Reconciler wired to real GitHub, with the Groq Fixer when keys are configured."""
    from . import config
    from .actions import Reconciler
    from .fixer import FixerWriter
    from .github import RealGitHub
    from .llm import GroqLLM
    writer = FixerWriter(GroqLLM()) if config.groq_keys() else None
    return Reconciler(engine, gh or RealGitHub(), writer=writer)


def triage_agent():
    """Triage over shallow clones of the target repositories, when Groq keys are configured."""
    from . import config, projects
    from .llm import GroqLLM
    from .triage import CodeSearch, TriageAgent, clone
    if not config.groq_keys():
        return None
    cache = ROOT / ".cache" / "targets"
    return TriageAgent(GroqLLM(), {p.id: CodeSearch(clone(p.repo, cache / p.id)) for p in projects.PROJECTS})


def main():
    parser = argparse.ArgumentParser(prog="retcon")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("seed-fixtures")
    sub.add_parser("wipe")
    sub.add_parser("reconcile")
    sub.add_parser("reset", help="close Retcon's open items, archive their markers, delete branches, wipe graph")
    run = sub.add_parser("run", help="load projects if needed, apply new advisory events, reconcile GitHub")
    run.add_argument("--archive", help="path or URL of the OSV npm archive (rebuild only)")
    run.add_argument("--pause", type=float, default=0.0, help="seconds between significant events (demo speed)")
    run.add_argument("--dry-run", action="store_true", help="do not touch GitHub")
    args = parser.parse_args()
    engine = Engine()
    if args.cmd == "seed-fixtures":
        seed_fixtures(engine)
    elif args.cmd == "wipe":
        engine.delete_graph()
    elif args.cmd == "run":
        import logging
        from . import config
        from . import worker
        from .github import RealGitHub
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
        from . import config
        gh = RealGitHub()
        engine.triage = triage_agent()
        if config.groq_keys():
            from .auditor import AuditorAgent
            from .llm import GroqLLM
            engine.auditor = AuditorAgent(GroqLLM())
        act = not args.dry_run and all(gh.can_write(repo) for repo in config.TARGET_REPOS)
        if not act and not args.dry_run:
            logging.warning("GitHub token cannot write to the target repos: updating the graph only")
        rep = worker.run(engine, reconciler(engine, gh) if act else None, gh, archive=args.archive,
                         pause=args.pause)
        print(f"rebuilt={rep.rebuilt} events={rep.events} skipped={rep.skipped} actions={len(rep.actions)}")
    elif args.cmd == "reset":
        from . import config
        from .github import RealGitHub
        gh = RealGitHub()
        for repo in config.TARGET_REPOS:
            for item in gh.retcon_items(repo):
                body = item.body.replace("<!-- retcon:", "<!-- retcon-archived:")
                if item.state == "open":
                    gh.comment(repo, item.number, "**Retcon reset.** History is being replayed from scratch; "
                                                  "this item is archived and a fresh one will follow if needed.")
                gh.update(repo, item.number, body=body, state="closed")
                print("archived", repo, item.number)
            gh.delete_branches(repo, "retcon/")
        engine.delete_graph()
        print("graph wiped")
    elif args.cmd == "reconcile":
        for done in reconciler(engine).reconcile():
            print(done.kind, done.decision, done.url)


if __name__ == "__main__":
    main()
