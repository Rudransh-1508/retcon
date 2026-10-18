from retcon.actions import Reconciler
from retcon.planner import PlannerAgent
from retcon.upgrade import build
from tests.conftest import add, published, withdrawn
from tests.fake_github import FakeGitHub

WIREDOOR = "Rudransh-1508/retcon-target-wiredoor"
GLADYS = "Rudransh-1508/retcon-target-gladys"
JWT_2022 = ["GHSA-27h2-hvpr-p74q", "GHSA-8cf7-32gw-wr33", "GHSA-hjrf-2m68-5959", "GHSA-qwph-4952-7xr6"]


def no_lock(p, l, pp, lp, n, items):
    return build(p, l, pp, lp, n, items, regenerate=False)


class ScriptedLLM:
    """Stub LLM for the Planner: answers each decision point with a scripted action."""

    def __init__(self, answers):
        self.answers, self.prompts = answers, []

    def json(self, system, user, max_tokens=800):
        import json
        prompt = json.loads(user)
        self.prompts.append(prompt)
        action = self.answers.get(prompt["decision_point"], "open_pr")
        return {"action": action, "rationale": f"scripted {action} at {prompt['decision_point']}"}


def reconciler(engine, gh, answers):
    llm = ScriptedLLM(answers)
    return Reconciler(engine, gh, builder=no_lock, planner=PlannerAgent(llm)), llm


def test_planner_can_choose_report_over_a_pull_request(engine):
    gh = FakeGitHub()
    r, llm = reconciler(engine, gh, {"new": "report"})
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-rm8p-cx58-hcvx"))  # HIGH -> P1, the Policy would open a PR

    r.reconcile()

    assert gh.prs(WIREDOOR) == []
    [report] = gh.items[WIREDOOR].values()
    assert "axios" in report.body
    [plan] = engine.why("decision:wiredoor:axios")["plans"]
    assert (plan["action"], plan["by"], plan["status"]) == ("report", "Planner", "held")
    assert plan["rationale"] == "scripted report at new"
    assert llm.prompts[0]["facts"]["advisories_still_holding"][0]["id"] == "GHSA-rm8p-cx58-hcvx"


def test_an_action_outside_the_allowed_set_falls_back_to_the_policy(engine):
    gh = FakeGitHub()
    r, _ = reconciler(engine, gh, {"new": "delete_repository"})
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-rm8p-cx58-hcvx"))
    r.reconcile()
    [pr] = gh.prs(WIREDOOR)
    [plan] = engine.why("decision:wiredoor:axios")["plans"]
    assert (plan["action"], plan["by"]) == ("open_pr", "Policy")


def test_withdrawing_evidence_a_plan_rested_on_retracts_it_and_the_planner_plans_again(engine):
    gh = FakeGitHub()
    r, llm = reconciler(engine, gh, {"new": "open_pr", "replan": "keep_pr"})
    add(engine, "gladys")
    for ghsa in JWT_2022:
        engine.process_event(published(ghsa))
    r.reconcile()

    engine.process_event(withdrawn("GHSA-27h2-hvpr-p74q"))
    r.reconcile()

    plans = engine.why("decision:gladys:jsonwebtoken")["plans"]
    assert [(p["action"], p["point"], p["status"]) for p in plans] == [
        ("open_pr", "new", "retracted"), ("keep_pr", "replan", "held")]
    assert [p["decision_point"] for p in llm.prompts] == ["new", "replan"]
    [pr] = [p for p in gh.prs(GLADYS) if "jsonwebtoken" in p.title]
    assert pr.state == "open" and "scripted keep_pr at replan" in gh.comments[-1][2]


def test_cancel_closes_without_consulting_the_planner(engine):
    gh = FakeGitHub()
    r, llm = reconciler(engine, gh, {})
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-rm8p-cx58-hcvx"))
    r.reconcile()
    asked = len(llm.prompts)

    engine.process_event(withdrawn("GHSA-rm8p-cx58-hcvx"))
    r.reconcile()

    assert len(llm.prompts) == asked
    [pr] = gh.prs(WIREDOOR)
    assert pr.state == "closed"


def test_a_downgrade_can_move_the_pull_request_to_the_report(engine, tmp_path):
    from retcon.triage import TriageAgent
    from tests.test_triage import VerdictLLM, project_code

    # Triage makes jsonwebtoken P0; withdrawing the RCE claim drops it to P1 while its pull request is open.
    engine.triage = TriageAgent(VerdictLLM({"GHSA-27h2-hvpr-p74q": "exploitable"}), project_code(tmp_path))
    gh = FakeGitHub()
    r, llm = reconciler(engine, gh, {"new": "open_pr", "downgrade": "move_to_report"})
    add(engine, "gladys")
    for ghsa in JWT_2022:
        engine.process_event(published(ghsa))
    r.reconcile()

    engine.process_event(withdrawn("GHSA-27h2-hvpr-p74q"))
    r.reconcile()

    assert [p["decision_point"] for p in llm.prompts] == ["new", "downgrade"]
    [pr] = [p for p in gh.prs(GLADYS) if "jsonwebtoken" in p.title]
    assert pr.state == "closed"
    [(_, _, comment)] = [c for c in gh.comments if c[1] == pr.number]
    assert "moved to the report, downgraded from P0 to P1" in comment
    assert "scripted move_to_report at downgrade" in comment
    [report] = [i for i in gh.items[GLADYS].values() if not i.is_pr]
    assert "jsonwebtoken" in report.body
    plans = engine.why("decision:gladys:jsonwebtoken")["plans"]
    assert [(p["action"], p["point"], p["status"]) for p in plans] == [
        ("open_pr", "new", "retracted"), ("move_to_report", "downgrade", "held")]
    [action] = plans[1]["actions"]
    assert f"/issues/{pr.number}#comment-" in action


def test_every_action_at_a_decision_point_is_linked_to_its_plan(engine):
    gh = FakeGitHub()
    r, _ = reconciler(engine, gh, {})
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-fjxv-7rqg-78g4"))
    r.reconcile()
    [plan] = engine.why("decision:wiredoor:form-data")["plans"]
    assert plan["actions"] == [gh.prs(WIREDOOR)[0].url]
    assert engine.q("MATCH (:Plan {id: $p})-[:CAUSED]->(a:Action) RETURN a.kind", {"p": plan["id"]}) == [["open_pr"]]


def test_the_planner_rationale_reaches_the_pull_request(engine):
    gh = FakeGitHub()
    r, _ = reconciler(engine, gh, {"new": "open_pr"})
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-fjxv-7rqg-78g4"))
    r.reconcile()
    [pr] = gh.prs(WIREDOOR)
    assert "scripted open_pr at new" in pr.body


def test_agent_activity_lists_every_agent_in_time_order(engine, tmp_path):
    from retcon.auditor import AuditorAgent
    from retcon.triage import TriageAgent
    from tests.test_triage import VerdictLLM, project_code

    class AuditLLM:
        def json(self, system, user, max_tokens=800):
            return {"classification": "real_retraction", "original": None, "rationale": "not a real flaw"}

    engine.triage = TriageAgent(VerdictLLM({"GHSA-27h2-hvpr-p74q": "not_reachable"}), project_code(tmp_path))
    engine.auditor = AuditorAgent(AuditLLM())
    gh = FakeGitHub()
    r, _ = reconciler(engine, gh, {"new": "open_pr", "replan": "keep_pr"})
    add(engine, "gladys")
    for ghsa in JWT_2022:
        engine.process_event(published(ghsa))
    r.reconcile()
    engine.process_event(withdrawn("GHSA-27h2-hvpr-p74q"))
    r.reconcile()

    feed = engine.agent_activity(project="gladys")
    assert {i["agent"] for i in feed} == {"Triage", "Planner", "Auditor", "Fixer"}
    assert [i["at"] for i in feed] == sorted((i["at"] for i in feed), reverse=True)
    plan = next(i for i in feed if i["kind"] == "plan" and i["title"] == "open_pr")
    assert plan["at"].startswith("2022-12-22") and plan["links"] == [gh.prs(GLADYS)[0].url]
    assert [i["agent"] for i in engine.agent_activity(agent="auditor")] == ["Auditor"]
