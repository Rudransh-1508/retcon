from retcon.actions import Reconciler
from retcon.auditor import AuditorAgent, withdrawal_reason
from retcon.upgrade import build
from tests.conftest import add, advisory, published, withdrawn
from tests.fake_github import FakeGitHub


class StubLLM:
    def __init__(self, reply):
        self.reply, self.calls = reply, 0

    def json(self, system, user, max_tokens=800):
        self.calls += 1
        return self.reply


def test_stated_reason_is_extracted_from_the_advisory():
    assert "patched version of form-data" in withdrawal_reason(advisory("GHSA-rm8p-cx58-hcvx"))


def test_every_withdrawal_gets_an_auditor_rationale_shown_in_why(engine):
    engine.auditor = AuditorAgent(StubLLM({"classification": "scope_change", "original": "GHSA-fjxv-7rqg-78g4",
                                           "rationale": "The flaw is in form-data, not axios."}))
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-fjxv-7rqg-78g4"))
    engine.process_event(published("GHSA-rm8p-cx58-hcvx"))
    engine.process_event(withdrawn("GHSA-rm8p-cx58-hcvx"))

    [r] = engine.why("GHSA-rm8p-cx58-hcvx")["retracted_by"]
    assert r["classification"] == "scope_change"
    assert r["rationale"] == "The flaw is in form-data, not axios."
    assert engine.q("MATCH (a:Agent {id: 'agent:auditor'})-[:WROTE]->(r:Retraction) RETURN count(r)")[0][0] == 1


def test_duplicate_withdrawal_records_a_link_to_the_original(engine):
    engine.auditor = AuditorAgent(StubLLM({"classification": "duplicate", "original": None, "rationale": "dup"}))
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-pmv8-rq9r-6j72"))
    engine.process_event(published("GHSA-4ww2-rjh2-xpv9"))
    engine.process_event(withdrawn("GHSA-4ww2-rjh2-xpv9"))
    [r] = engine.why("GHSA-4ww2-rjh2-xpv9")["retracted_by"]
    assert r["original"] == "GHSA-pmv8-rq9r-6j72"


def test_outcomes_are_identical_with_or_without_the_auditor():
    import uuid
    from falkordb import FalkorDB
    from retcon.engine import Engine
    from tests.conftest import LOCAL
    outcomes = []
    for auditor in (None, AuditorAgent(StubLLM({"classification": "duplicate", "original": None, "rationale": "x"}))):
        eng = Engine(graph_name=f"test_{uuid.uuid4().hex[:10]}", db=FalkorDB(**LOCAL), auditor=auditor)
        try:
            add(eng, "wiredoor")
            eng.process_event(published("GHSA-rm8p-cx58-hcvx"))
            outcomes.append([(c.decision, c.change) for c in eng.process_event(withdrawn("GHSA-rm8p-cx58-hcvx")).changes])
        finally:
            eng.delete_graph()
    assert outcomes[0] == outcomes[1] == [("decision:wiredoor:axios", "cancel")]


def test_auditor_rationale_appears_in_the_pull_request_comment(engine):
    engine.auditor = AuditorAgent(StubLLM({"classification": "scope_change", "original": None,
                                           "rationale": "Patch form-data instead."}))
    gh = FakeGitHub()
    r = Reconciler(engine, gh, builder=lambda p, l, pp, lp, n, plan: build(p, l, pp, lp, n, plan, regenerate=False))
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-rm8p-cx58-hcvx"))
    r.reconcile()
    engine.process_event(withdrawn("GHSA-rm8p-cx58-hcvx"))
    r.reconcile()
    [(_, _, comment)] = gh.comments
    assert "Auditor (scope change): Patch form-data instead." in comment
