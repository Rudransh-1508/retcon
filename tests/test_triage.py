import json

from retcon.engine import Engine
from retcon.triage import CodeSearch, TriageAgent, mentioned_apis
from tests.conftest import add, advisory, published, withdrawn

JWT_2022 = ["GHSA-27h2-hvpr-p74q", "GHSA-8cf7-32gw-wr33", "GHSA-hjrf-2m68-5959", "GHSA-qwph-4952-7xr6"]


class VerdictLLM:
    """Stub LLM: one verdict per advisory id found in the prompt, citing the first usage it was shown."""

    def __init__(self, verdicts):
        self.verdicts, self.prompts = verdicts, []

    def json(self, system, user, max_tokens=800):
        self.prompts.append(user)
        facts = json.loads(user)
        usages = facts["usages_in_project"]
        cite = [{"file": usages[0]["file"], "line": usages[0]["line"]}] if isinstance(usages, list) and usages else []
        return {"verdict": self.verdicts.get(facts["advisory"]["id"], "unknown"),
                "rationale": "stub rationale", "evidence": cite}


def project_code(tmp_path):
    root = tmp_path / "gladys"
    (root / "server" / "lib").mkdir(parents=True)
    (root / "server" / "lib" / "session.js").write_text(
        "const jwt = require('jsonwebtoken');\n\nfunction check(token, key) {\n  return jwt.verify(token, key);\n}\n")
    (root / "server" / "node_modules" / "x").mkdir(parents=True)
    (root / "server" / "node_modules" / "x" / "i.js").write_text("require('jsonwebtoken')\n")
    return {"gladys": CodeSearch(root)}


def triaged_engine(engine, tmp_path, verdicts):
    llm = VerdictLLM(verdicts)
    engine.triage = TriageAgent(llm, project_code(tmp_path))
    return llm


def test_triage_finds_code_usages_and_skips_node_modules(tmp_path):
    usages = project_code(tmp_path)["gladys"].usages("jsonwebtoken", ["jwt.verify"])
    assert {(u.file, u.line) for u in usages} == {("server/lib/session.js", 1), ("server/lib/session.js", 4)}


def test_apis_named_by_the_advisory_are_extracted():
    assert "jwt.verify" in mentioned_apis(advisory("GHSA-27h2-hvpr-p74q"))


def test_judgment_rests_on_advisory_and_exposure_with_code_evidence(engine, tmp_path):
    triaged_engine(engine, tmp_path, {"GHSA-27h2-hvpr-p74q": "exploitable"})
    add(engine, "gladys")
    engine.process_event(published("GHSA-27h2-hvpr-p74q"))

    jid = "judgment:triage:gladys:jsonwebtoken@8.5.1:GHSA-27h2-hvpr-p74q"
    judgment = engine.why(jid)
    assert judgment["verdict"] == "exploitable"
    assert json.loads(judgment["evidence"]) == [{"file": "server/lib/session.js", "line": 1}]
    [support] = judgment["supports"]
    assert support["by"] == "Triage"
    assert {p["id"] for p in support["premises"]} == {"GHSA-27h2-hvpr-p74q", "exposure:gladys:jsonwebtoken@8.5.1"}


def test_exploitable_judgment_raises_urgency_and_its_withdrawal_downgrades(engine, tmp_path):
    # The real jsonwebtoken story: Triage judged the RCE claim exploitable here, which made the decision P0.
    # When the claim was withdrawn, the judgment lost its premise and the decision fell back to P1.
    triaged_engine(engine, tmp_path, {"GHSA-27h2-hvpr-p74q": "exploitable"})
    add(engine, "gladys")
    for ghsa in JWT_2022:
        engine.process_event(published(ghsa))
    assert engine.node("decision:gladys:jsonwebtoken")["urgency"] == "P0"

    result = engine.process_event(withdrawn("GHSA-27h2-hvpr-p74q"))

    assert result.outcome_of("decision:gladys:jsonwebtoken") == "downgrade"
    assert engine.node("decision:gladys:jsonwebtoken")["urgency"] == "P1"
    assert engine.node("judgment:triage:gladys:jsonwebtoken@8.5.1:GHSA-27h2-hvpr-p74q")["status"] == "retracted"


def test_not_reachable_lowers_only_the_advisory_it_judged(engine, tmp_path):
    triaged_engine(engine, tmp_path, {"GHSA-27h2-hvpr-p74q": "not_reachable"})
    add(engine, "gladys")
    engine.process_event(published("GHSA-27h2-hvpr-p74q"))
    assert engine.node("decision:gladys:jsonwebtoken")["urgency"] == "P2"   # HIGH lowered one level
    engine.process_event(published("GHSA-8cf7-32gw-wr33"))                   # another HIGH, judged unknown
    assert engine.node("decision:gladys:jsonwebtoken")["urgency"] == "P1"


def test_triage_only_judges_high_advisories_on_direct_dependencies(engine, tmp_path):
    llm = triaged_engine(engine, tmp_path, {})
    add(engine, "gladys")
    engine.process_event(published("GHSA-hjrf-2m68-5959"))   # MODERATE: no judgment
    engine.process_event(published("GHSA-fjxv-7rqg-78g4"))   # CRITICAL, form-data is direct in gladys
    judged = [json.loads(p)["advisory"]["id"] for p in llm.prompts]
    assert judged == ["GHSA-fjxv-7rqg-78g4"]
