import asyncio

from retcon.mcp_server import Tools, build
from tests.conftest import add, published, withdrawn


def seeded(engine):
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-fjxv-7rqg-78g4"))
    engine.process_event(published("GHSA-rm8p-cx58-hcvx"))
    engine.process_event(withdrawn("GHSA-rm8p-cx58-hcvx"))
    return Tools(engine)


def test_why_explains_a_decision_down_to_its_advisory(engine):
    out = seeded(engine).why("decision:wiredoor:form-data")
    node = out["node"]
    assert node["status"] == "held" and node["urgency"] == "P0"
    exposure = node["because"][0]["premises"][0]
    assert exposure["id"] == "exposure:wiredoor:form-data@4.0.3"
    assert exposure["because"][0]["premises"][0]["id"] == "GHSA-fjxv-7rqg-78g4"
    assert out["ui"].endswith("?why=decision:wiredoor:form-data")


def test_why_shows_retracted_support_with_its_reason(engine):
    out = seeded(engine).why("decision:wiredoor:axios")
    assert out["node"]["status"] == "retracted"
    advisory = out["node"]["because"][0]["premises"][0]["because"][0]["premises"][0]
    assert advisory["id"] == "GHSA-rm8p-cx58-hcvx" and advisory["retracted"]["at"].startswith("2025-07-24")


def test_what_if_reports_outcomes_and_writes_nothing(engine):
    tools = seeded(engine)
    before = engine.q("MATCH (n:Node) RETURN n.id, n.status ORDER BY n.id")
    out = tools.what_if("GHSA-fjxv-7rqg-78g4")
    assert out["simulated"] and out["decisions"] == [
        {"decision": "decision:wiredoor:form-data", "outcome": "cancel", "urgency_before": "P0", "urgency_after": None}]
    assert engine.q("MATCH (n:Node) RETURN n.id, n.status ORDER BY n.id") == before


def test_decisions_are_listed_most_urgent_first_with_filters(engine):
    tools = seeded(engine)
    assert [d["package"] for d in tools.decisions()["decisions"]] == ["form-data"]
    assert [d["package"] for d in tools.decisions(include_cancelled=True)["decisions"]] == ["form-data", "axios"]
    assert tools.decisions(urgency="P3")["count"] == 0


def test_timeline_lists_withdrawals_with_what_they_changed(engine):
    out = seeded(engine).timeline(only_retractions=True)
    [event] = out["events"]
    assert event["kind"] == "withdrawn" and event["changes"] == [{"decision": "decision:wiredoor:axios", "change": "cancel"}]


def test_correct_is_offered_only_with_a_passphrase_and_retracts(engine, monkeypatch):
    seeded(engine)
    monkeypatch.delenv("RETCON_ADMIN_PASSPHRASE", raising=False)
    names = lambda s: [t.name for t in asyncio.run(s.list_tools())]
    assert names(build(engine, allow_correct=True)) == ["why", "what_if", "decisions", "timeline"]
    monkeypatch.setenv("RETCON_ADMIN_PASSPHRASE", "x")
    assert "correct" in names(build(engine, allow_correct=True))
    assert "correct" not in names(build(engine, allow_correct=False))

    out = Tools(engine).correct("GHSA-fjxv-7rqg-78g4", "test")
    assert out["decisions"] == [{"decision": "decision:wiredoor:form-data", "outcome": "cancel"}]
    assert engine.node("decision:wiredoor:form-data")["status"] == "retracted"
