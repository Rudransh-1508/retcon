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
