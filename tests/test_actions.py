import json
import uuid

import pytest
from falkordb import FalkorDB

from retcon.actions import Reconciler, marker
from retcon.engine import Engine
from retcon.github import NotATarget, check_target
from retcon.upgrade import build
from tests.conftest import LOCAL, add, published, withdrawn
from tests.fake_github import FakeGitHub

WIREDOOR = "Rudransh-1508/retcon-target-wiredoor"
GLADYS = "Rudransh-1508/retcon-target-gladys"
JWT_2022 = ["GHSA-27h2-hvpr-p74q", "GHSA-8cf7-32gw-wr33", "GHSA-hjrf-2m68-5959", "GHSA-qwph-4952-7xr6"]


def no_lock_builder(package_json, lockfile, pkg_path, lock_path, name, plan):
    return build(package_json, lockfile, pkg_path, lock_path, name, plan, regenerate=False)


@pytest.fixture
def gh():
    return FakeGitHub()


def reconciler(engine, gh):
    return Reconciler(engine, gh, builder=no_lock_builder)


def test_new_p0_decision_opens_one_pull_request_with_label_and_marker(engine, gh):
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-fjxv-7rqg-78g4"))

    done = reconciler(engine, gh).reconcile()

    [pr] = gh.prs(WIREDOOR)
    assert [d.kind for d in done] == ["open_pr"]
    assert pr.labels == ["retcon", "P0"]
    assert "form-data" in pr.title and "4.0.4" in pr.title
    assert marker("decision:wiredoor:form-data") in pr.body
    assert "GHSA-fjxv-7rqg-78g4" in pr.body
    assert engine.node("decision:wiredoor:form-data")["pr_url"] == pr.url


def test_upgrade_bumps_direct_dependencies_and_overrides_vulnerable_transitive_versions(engine, gh):
    add(engine, "gladys")
    engine.process_event(published("GHSA-fjxv-7rqg-78g4"))
    reconciler(engine, gh).reconcile()

    [(repo, branch, files)] = gh.pushes
    pkg = json.loads(files["server/package.json"])
    assert pkg["dependencies"]["form-data"] == "^2.5.4"           # direct 2.5.1 -> 2.5.4
    assert pkg["overrides"]["form-data@4.0.0"] == "4.0.4"        # via axios
    assert branch == "retcon/form-data"


def test_withdrawal_that_cancels_a_decision_closes_its_pull_request_with_an_explanation(engine, gh):
    add(engine, "wiredoor")
    r = reconciler(engine, gh)
    engine.process_event(published("GHSA-rm8p-cx58-hcvx"))   # HIGH: axios PR
    r.reconcile()
    engine.process_event(withdrawn("GHSA-rm8p-cx58-hcvx"))

    r.reconcile()

    [pr] = gh.prs(WIREDOOR)
    assert pr.state == "closed"
    assert pr.labels == ["retcon", "cancelled"]
    [(_, number, body)] = gh.comments
    assert number == pr.number
    assert "cancelled" in body.lower() and "GHSA-rm8p-cx58-hcvx" in body


def test_withdrawal_that_leaves_urgency_rewrites_the_body_and_comments_once(engine, gh):
    add(engine, "gladys")
    r = reconciler(engine, gh)
    for ghsa in JWT_2022:
        engine.process_event(published(ghsa))
    r.reconcile()
    engine.process_event(withdrawn("GHSA-27h2-hvpr-p74q"))

    r.reconcile()

    [pr] = [p for p in gh.prs(GLADYS) if "jsonwebtoken" in p.title]
    assert pr.state == "open" and pr.labels == ["retcon", "P1"]
    assert "3 advisories" in pr.body
    assert "~~[GHSA-27h2-hvpr-p74q]" in pr.body
    [(_, _, comment)] = [c for c in gh.comments if c[1] == pr.number]
    assert "priority unchanged" in comment and "GHSA-27h2-hvpr-p74q" in comment


def test_reconcile_is_idempotent(engine, gh):
    add(engine, "wiredoor")
    r = reconciler(engine, gh)
    engine.process_event(published("GHSA-fjxv-7rqg-78g4"))
    r.reconcile()
    before = list(gh.log)
    assert r.reconcile() == []
    assert gh.log == before


def test_rebuilt_graph_relinks_existing_pull_requests_instead_of_duplicating(engine, gh):
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-fjxv-7rqg-78g4"))
    reconciler(engine, gh).reconcile()

    fresh = Engine(graph_name=f"test_{uuid.uuid4().hex[:10]}", db=FalkorDB(**LOCAL))
    try:
        add(fresh, "wiredoor")
        fresh.process_event(published("GHSA-fjxv-7rqg-78g4"))
        reconciler(fresh, gh).reconcile()
        assert len(gh.prs(WIREDOOR)) == 1
        assert fresh.node("decision:wiredoor:form-data")["pr_number"] == gh.prs(WIREDOOR)[0].number
    finally:
        fresh.delete_graph()


def test_lower_priority_decisions_go_into_one_report_issue(engine, gh):
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-pmv8-rq9r-6j72"))  # MODERATE -> P2
    engine.process_event(published("GHSA-pj86-cfqh-vqx6"))  # LOW -> P3
    reconciler(engine, gh).reconcile()

    assert gh.prs(WIREDOOR) == []
    [issue] = gh.items[WIREDOOR].values()
    assert not issue.is_pr
    assert "axios" in issue.body and "express" in issue.body


def test_duplicate_withdrawal_records_no_action(engine, gh):
    add(engine, "gladys")
    r = reconciler(engine, gh)
    for ghsa in JWT_2022:
        engine.process_event(published(ghsa))
    engine.process_event(published("GHSA-pmv8-rq9r-6j72"))
    engine.process_event(published("GHSA-4ww2-rjh2-xpv9"))
    r.reconcile()
    before = list(gh.log)

    engine.process_event(withdrawn("GHSA-4ww2-rjh2-xpv9"))

    assert r.reconcile() == []
    assert gh.log == before


def test_only_target_repositories_can_be_acted_on():
    with pytest.raises(NotATarget):
        check_target("GladysAssistant/Gladys")
    check_target(GLADYS)
