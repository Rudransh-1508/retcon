import copy

from tests.conftest import add, advisory, published, withdrawn

JWT_2022 = ["GHSA-27h2-hvpr-p74q", "GHSA-8cf7-32gw-wr33", "GHSA-hjrf-2m68-5959", "GHSA-qwph-4952-7xr6"]


def test_jsonwebtoken_decision_after_the_four_december_2022_advisories(engine):
    add(engine, "gladys")
    for ghsa in JWT_2022:
        engine.process_event(published(ghsa))

    jwt = engine.node("decision:gladys:jsonwebtoken")
    assert jwt["status"] == "held"
    assert jwt["urgency"] == "P1"  # most severe advisory is HIGH
    assert jwt["target"] == "9.0.0"
    assert sorted(jwt["evidence"]) == sorted(JWT_2022)


def test_rce_withdrawal_keeps_urgency_because_another_high_advisory_still_holds(engine):
    add(engine, "gladys")
    for ghsa in JWT_2022:
        engine.process_event(published(ghsa))

    result = engine.process_event(withdrawn("GHSA-27h2-hvpr-p74q"))

    assert result.outcome_of("decision:gladys:jsonwebtoken") == "unchanged"
    jwt = engine.node("decision:gladys:jsonwebtoken")
    assert jwt["urgency"] == "P1"
    assert "GHSA-27h2-hvpr-p74q" not in jwt["evidence"]
    assert len(jwt["evidence"]) == 3


def test_urgency_follows_the_most_severe_held_advisory(engine):
    add(engine, "gladys")
    engine.process_event(published("GHSA-hjrf-2m68-5959"))  # MODERATE
    assert engine.node("decision:gladys:jsonwebtoken")["urgency"] == "P2"
    result = engine.process_event(published("GHSA-8cf7-32gw-wr33"))  # HIGH
    assert result.outcome_of("decision:gladys:jsonwebtoken") == "escalate"
    assert engine.node("decision:gladys:jsonwebtoken")["urgency"] == "P1"


def test_aliased_advisories_count_as_one_piece_of_evidence(engine):
    # A second record of the same flaw (same CVE alias) under another id: built from the real advisory.
    add(engine, "gladys")
    engine.process_event(published("GHSA-8cf7-32gw-wr33"))
    twin = copy.deepcopy(advisory("GHSA-8cf7-32gw-wr33"))
    twin["id"] = "GHSA-test-twin-0001"
    engine.process_event({"kind": "published", "at": twin["published"], "advisory": twin})

    jwt = engine.node("decision:gladys:jsonwebtoken")
    assert jwt["evidence"] == ["GHSA-8cf7-32gw-wr33"]
    assert engine.q("MATCH (:Advisory {id: 'GHSA-test-twin-0001'})-[:ALIAS_OF]->(a:Advisory) RETURN a.id")[0][0] \
        == "GHSA-8cf7-32gw-wr33"


def test_decision_history_records_every_change_in_order(engine):
    add(engine, "gladys")
    for ghsa in JWT_2022:
        engine.process_event(published(ghsa))
    engine.process_event(withdrawn("GHSA-27h2-hvpr-p74q"))

    history = engine.why("decision:gladys:jsonwebtoken")["history"]
    assert [h["change"] for h in history] == ["new", "updated", "updated", "updated", "unchanged"]
    assert history[-1]["advisory"] == "GHSA-27h2-hvpr-p74q"
    assert (history[-1]["evidence_before"], history[-1]["evidence_after"]) == (4, 3)
