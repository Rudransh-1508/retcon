import zipfile

from retcon import worker
from retcon.actions import Reconciler
from tests.conftest import FIXTURES
from tests.fake_github import FakeGitHub
from tests.test_actions import no_lock_builder

GLADYS = "Rudransh-1508/retcon-target-gladys"
WIREDOOR = "Rudransh-1508/retcon-target-wiredoor"


def archive(tmp_path, ghsas=None):
    path = tmp_path / "npm.zip"
    with zipfile.ZipFile(path, "w") as z:
        for f in sorted((FIXTURES / "advisories").glob("*.json")):
            if ghsas is None or f.stem in ghsas:
                z.writestr(f.name, f.read_text())
    return path


def test_replay_applies_real_events_in_order_and_acts_only_after_each_snapshot(engine, tmp_path):
    gh = FakeGitHub()
    report = worker.run(engine, Reconciler(engine, gh, builder=no_lock_builder), gh, archive=archive(tmp_path))

    assert report.rebuilt and report.events > 0
    # wiredoor's axios PR opened on 2025-07-23 and closed when the advisory was withdrawn the next day,
    # then came back when GHSA-pmv8 arrived (P2, so it keeps its PR).
    [axios] = [p for p in gh.prs(WIREDOOR) if "axios" in p.title]
    assert any("cancelled" in body.lower() for repo, n, body in gh.comments if n == axios.number)
    assert any("reopened" in body.lower() for repo, n, body in gh.comments if n == axios.number)
    # the jsonwebtoken PR opened at gladys's snapshot and saw the RCE withdrawal as a support change
    [jwt] = [p for p in gh.prs(GLADYS) if "jsonwebtoken" in p.title]
    assert jwt.state == "open" and "3 advisories" in jwt.body


def test_second_run_continues_from_the_cursor_and_does_nothing_new(engine, tmp_path):
    gh = FakeGitHub()
    r = Reconciler(engine, gh, builder=no_lock_builder)
    worker.run(engine, r, gh, archive=archive(tmp_path))
    before = list(gh.log)

    report = worker.run(engine, r, gh, changed_since=lambda cursor, packages: ([], cursor))

    assert not report.rebuilt and report.events == 0
    assert gh.log == before


def test_incremental_run_applies_a_new_withdrawal(engine, tmp_path):
    from tests.conftest import advisory
    gh = FakeGitHub()
    r = Reconciler(engine, gh, builder=no_lock_builder)
    published_only = advisory("GHSA-pj86-cfqh-vqx6")
    published_only.pop("withdrawn")
    path = tmp_path / "npm.zip"
    with zipfile.ZipFile(path, "w") as z:
        import json
        z.writestr("GHSA-pj86-cfqh-vqx6.json", json.dumps(published_only))
    worker.run(engine, r, gh, archive=path)
    assert engine.node("decision:wiredoor:express")["status"] == "held"

    report = worker.run(engine, r, gh, changed_since=lambda c, p: ([advisory("GHSA-pj86-cfqh-vqx6")], c))

    assert report.events == 1
    assert engine.node("decision:wiredoor:express")["status"] == "retracted"


def test_reset_archives_retcon_items_and_a_fresh_replay_opens_new_ones(engine, tmp_path):
    from retcon.config import TARGET_REPOS
    gh = FakeGitHub()
    worker.run(engine, Reconciler(engine, gh, builder=no_lock_builder), gh, archive=archive(tmp_path))
    first = {(repo, i.number) for repo in gh.items for i in gh.items[repo].values()}
    assert first

    archived = worker.reset(engine, gh, TARGET_REPOS)

    assert set(archived) == first
    assert all(i.state == "closed" and "<!-- retcon:" not in i.body for r in gh.items for i in gh.items[r].values())
    engine.g = engine.db.select_graph(engine.graph_name)
    engine._ensure_indexes()
    worker.run(engine, Reconciler(engine, gh, builder=no_lock_builder), gh, archive=archive(tmp_path))
    fresh = {(repo, i.number) for repo in gh.items for i in gh.items[repo].values()} - first
    assert len(fresh) == len(first)
    assert all(gh.items[repo][n].body.count("<!-- retcon:") == 1 for repo, n in fresh)


def test_rebuild_on_an_empty_graph_reproduces_decisions_and_relinks_prs(engine, tmp_path):
    import uuid
    from falkordb import FalkorDB
    from retcon.engine import Engine
    from tests.conftest import LOCAL
    gh = FakeGitHub()
    worker.run(engine, Reconciler(engine, gh, builder=no_lock_builder), gh, archive=archive(tmp_path))
    before = sorted((d["id"], d["status"], d["urgency"]) for d in engine.decisions())
    prs = len([i for r in gh.items for i in gh.items[r].values() if i.is_pr])

    fresh = Engine(graph_name=f"test_{uuid.uuid4().hex[:10]}", db=FalkorDB(**LOCAL))
    try:
        worker.run(fresh, Reconciler(fresh, gh, builder=no_lock_builder), gh, archive=archive(tmp_path))
        assert sorted((d["id"], d["status"], d["urgency"]) for d in fresh.decisions()) == before
        assert len([i for r in gh.items for i in gh.items[r].values() if i.is_pr]) == prs
    finally:
        fresh.delete_graph()
