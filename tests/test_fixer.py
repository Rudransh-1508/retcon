from retcon.actions import Reconciler
from retcon.fixer import FixerWriter
from retcon.llm import GroqLLM, LLMError
from retcon.upgrade import build
from tests.conftest import add, published, withdrawn
from tests.fake_github import FakeGitHub

WIREDOOR = "Rudransh-1508/retcon-target-wiredoor"


class StubLLM:
    def __init__(self, fail=False):
        self.fail, self.calls = fail, []

    def json(self, system, user, max_tokens=800):
        self.calls.append(user)
        if self.fail:
            raise LLMError("stubbed failure")
        return {"summary": "Stub summary about form-data.", "explanation": "Stub explanation of the change."}


def no_lock(p, l, pp, lp, n, plan):
    return build(p, l, pp, lp, n, plan, regenerate=False)


def test_fixer_writes_the_pull_request_explanation_but_not_the_facts(engine):
    gh, llm = FakeGitHub(), StubLLM()
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-fjxv-7rqg-78g4"))
    Reconciler(engine, gh, builder=no_lock, writer=FixerWriter(llm)).reconcile()

    [pr] = gh.prs(WIREDOOR)
    assert "Stub summary about form-data." in pr.body
    assert "GHSA-fjxv-7rqg-78g4" in pr.body and "<!-- retcon:decision=" in pr.body
    assert pr.title == "[P0] Upgrade form-data to 4.0.4"
    assert "GHSA-fjxv-7rqg-78g4" in llm.calls[0]


def test_fixer_explains_a_cancellation_in_the_comment(engine):
    gh = FakeGitHub()
    r = Reconciler(engine, gh, builder=no_lock, writer=FixerWriter(StubLLM()))
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-rm8p-cx58-hcvx"))
    r.reconcile()
    engine.process_event(withdrawn("GHSA-rm8p-cx58-hcvx"))
    r.reconcile()
    [(_, _, comment)] = gh.comments
    assert "Stub explanation of the change." in comment
    assert comment.startswith("**Retcon: cancelled.**")


def test_templates_stand_alone_when_the_llm_fails(engine):
    gh = FakeGitHub()
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-fjxv-7rqg-78g4"))
    Reconciler(engine, gh, builder=no_lock, writer=FixerWriter(StubLLM(fail=True))).reconcile()
    [pr] = gh.prs(WIREDOOR)
    assert "Stub" not in pr.body and "GHSA-fjxv-7rqg-78g4" in pr.body


def test_keys_are_read_from_numbered_slots_and_lists_skipping_duplicates_and_junk(monkeypatch):
    import os
    from retcon import config
    for name in [k for k in os.environ if k.startswith("GROQ_API_KEY")]:
        monkeypatch.delenv(name)
    good1, good2 = "gsk_" + "a" * 52, "gsk_" + "b" * 52
    monkeypatch.setenv("GROQ_API_KEY_1", f"{good1},{good2}")
    monkeypatch.setenv("GROQ_API_KEY_2", "gsk_short")
    monkeypatch.setenv("GROQ_API_KEYS", good1)
    assert config.groq_keys() == [good1, good2]


def test_rejected_keys_are_dropped_and_reported():
    import pytest
    llm = GroqLLM(keys=["gsk_" + "x" * 52], max_wait=10)
    with pytest.raises(LLMError):
        llm.json("Reply with JSON.", "{}")
