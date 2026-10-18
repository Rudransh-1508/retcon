import pytest

from retcon.engine import UnsupportedWrite
from tests.conftest import add, published


def test_published_advisory_creates_exposure_and_decision_with_support(engine):
    add(engine, "wiredoor")
    result = engine.process_event(published("GHSA-fjxv-7rqg-78g4"))

    assert result.outcome_of("decision:wiredoor:form-data") == "new"
    [decision] = [d for d in engine.decisions("wiredoor") if d["package"] == "form-data"]
    assert decision["status"] == "held"
    assert decision["urgency"] == "P0"  # form-data advisory is CRITICAL
    assert decision["target"] == "4.0.4"
    assert decision["evidence"] == ["GHSA-fjxv-7rqg-78g4"]


def test_exposure_is_identified_by_project_and_version_and_records_its_path(engine):
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-fjxv-7rqg-78g4"))

    exposure = engine.node("exposure:wiredoor:form-data@4.0.3")
    assert exposure["status"] == "held"
    edge = engine.q("""MATCH (:Project {id: 'wiredoor'})-[d:DEPENDS_ON]->(:PackageVersion {id: 'pv:npm/form-data@4.0.3'})
                       RETURN d.direct, d.paths""")[0]
    assert edge[0] is False
    assert "axios > form-data" in edge[1]


def test_why_returns_the_chain_back_to_the_advisory(engine):
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-fjxv-7rqg-78g4"))

    why = engine.why("decision:wiredoor:form-data")
    [resolves] = why["supports"]
    [exposure] = resolves["premises"]
    assert exposure["id"] == "exposure:wiredoor:form-data@4.0.3"
    [affects] = exposure["supports"]
    assert affects["by"] == "Retcon"
    assert affects["premises"][0]["id"] == "GHSA-fjxv-7rqg-78g4"
    assert affects["premises"][0]["severity"] == "CRITICAL"


def test_writes_without_support_are_rejected(engine):
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-fjxv-7rqg-78g4"))
    with pytest.raises(UnsupportedWrite):
        engine.write_belief("Judgment", "judgment:x", {}, [], by="agent:retcon")
    with pytest.raises(UnsupportedWrite):
        engine.write_belief("Judgment", "judgment:x", {},
                            [{"id": "support:x", "kind": "judged", "premises": []}], by="agent:retcon")


def test_reprocessing_an_event_is_a_no_op(engine):
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-fjxv-7rqg-78g4"))
    again = engine.process_event(published("GHSA-fjxv-7rqg-78g4"))
    assert again.skipped


def test_a_cancelled_decision_returns_when_new_evidence_supports_it(engine):
    from tests.conftest import withdrawn
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-rm8p-cx58-hcvx"))
    assert engine.process_event(withdrawn("GHSA-rm8p-cx58-hcvx")).outcome_of("decision:wiredoor:axios") == "cancel"

    result = engine.process_event(published("GHSA-pmv8-rq9r-6j72"))

    assert result.outcome_of("decision:wiredoor:axios") == "new"
    [axios] = [d for d in engine.decisions("wiredoor") if d["package"] == "axios"]
    assert axios["status"] == "held"
    assert axios["evidence"] == ["GHSA-pmv8-rq9r-6j72"]
