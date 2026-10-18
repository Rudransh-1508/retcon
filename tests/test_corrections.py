import json

import pytest

from retcon.actions import Reconciler
from retcon.triage import TriageAgent
from retcon.upgrade import build
from tests.conftest import add, published
from tests.fake_github import FakeGitHub
from tests.test_triage import VerdictLLM, project_code

JWT_2022 = ["GHSA-27h2-hvpr-p74q", "GHSA-8cf7-32gw-wr33", "GHSA-hjrf-2m68-5959", "GHSA-qwph-4952-7xr6"]
JUDGMENT = "judgment:triage:gladys:jsonwebtoken@8.5.1:GHSA-27h2-hvpr-p74q"


def no_lock(p, l, pp, lp, n, plan):
    return build(p, l, pp, lp, n, plan, regenerate=False)


@pytest.fixture
def judged(engine, tmp_path):
    engine.triage = TriageAgent(VerdictLLM({"GHSA-27h2-hvpr-p74q": "exploitable"}), project_code(tmp_path))
    add(engine, "gladys")
    for ghsa in JWT_2022 + ["GHSA-fjxv-7rqg-78g4"]:
        engine.process_event(published(ghsa))
    engine.triage = None
    return engine


def test_correcting_an_exploitable_judgment_downgrades_only_what_it_influenced(judged):
    gh = FakeGitHub()
    r = Reconciler(judged, gh, builder=no_lock)
    r.reconcile()
    before = list(gh.log)

    result = judged.correct(JUDGMENT, "Gladys signs tokens with its own secret; the key is never user input.")

    assert result.outcome_of("decision:gladys:jsonwebtoken") == "downgrade"
    assert judged.node("decision:gladys:jsonwebtoken")["urgency"] == "P1"
    assert judged.node(JUDGMENT)["status"] == "retracted"
    r.reconcile()
    new = gh.log[len(before):]
    jwt = next(p for p in gh.prs("Rudransh-1508/retcon-target-gladys") if "jsonwebtoken" in p.title)
    assert {n for _, _, n in new} == {jwt.number}
    [(_, _, comment)] = [c for c in gh.comments if c[1] == jwt.number]
    assert "downgraded from P0 to P1" in comment and "never user input" in comment


def test_a_corrected_belief_stays_retracted_even_if_its_support_is_written_again(judged):
    judged.correct(JUDGMENT, "wrong")
    judged.write_belief("Judgment", JUDGMENT, {},
                        [{"id": f"support:judged:{JUDGMENT}", "kind": "judged",
                          "premises": ["GHSA-27h2-hvpr-p74q", "exposure:gladys:jsonwebtoken@8.5.1"]}],
                        by="agent:retcon")
    assert judged.node(JUDGMENT)["status"] == "retracted"


def test_what_if_returns_the_same_diff_and_writes_nothing(judged):
    def snapshot():
        return judged.q("MATCH (n:Node) RETURN n.id, n.status ORDER BY n.id")

    live = snapshot()
    simulated = judged.what_if(JUDGMENT)
    assert snapshot() == live
    assert not any(name.startswith(f"{judged.graph_name}__whatif") for name in judged.db.list_graphs())

    real = judged.correct(JUDGMENT, "what if this were wrong?")
    assert [(c.decision, c.change, c.after) for c in simulated.changes] == \
           [(c.decision, c.change, c.after) for c in real.changes]
    assert simulated.waves == real.waves


def test_correcting_an_advisory_cancels_what_rested_only_on_it(judged):
    result = judged.correct("GHSA-fjxv-7rqg-78g4", "Not exploitable in Node's crypto setup.")
    assert result.outcome_of("decision:gladys:form-data") == "cancel"


def test_decisions_cannot_be_corrected_directly(judged):
    with pytest.raises(ValueError):
        judged.correct("decision:gladys:jsonwebtoken", "no")


def test_correction_appears_as_an_event_with_its_reason(judged):
    judged.correct(JUDGMENT, "the key is never user input")
    [row] = judged.q("MATCH (e:Event {kind: 'correction'}) RETURN e.target, e.reason, e.changes")
    assert row[0] == JUDGMENT and row[1] == "the key is never user input"
    assert json.loads(row[2])[0]["change"] == "downgrade"
