from fastapi.testclient import TestClient

from retcon import api
from tests.conftest import add, published


def client(engine, monkeypatch, passphrase="correct horse"):
    monkeypatch.setattr(api, "_engine", engine)
    monkeypatch.delenv("RETCON_DISPATCH_TOKEN", raising=False)
    monkeypatch.setenv("RETCON_ADMIN_PASSPHRASE", passphrase)
    return TestClient(api.app)


def test_read_endpoints_answer(engine, monkeypatch):
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-fjxv-7rqg-78g4"))
    c = client(engine, monkeypatch)
    assert c.get("/api/health").json()["ok"]
    assert c.get("/api/projects").json()[0]["id"] == "wiredoor"
    assert c.get("/api/decisions").json()[0]["package"] == "form-data"
    assert c.get("/api/why", params={"id": "decision:wiredoor:form-data"}).json()["kind"] == "Decision"
    assert c.get("/api/events").json()[0]["advisory"] == "GHSA-fjxv-7rqg-78g4"


def test_what_if_is_public_and_correct_needs_the_passphrase(engine, monkeypatch):
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-fjxv-7rqg-78g4"))
    c = client(engine, monkeypatch)
    sim = c.get("/api/whatif", params={"id": "GHSA-fjxv-7rqg-78g4"}).json()
    assert sim["changes"][0]["change"] == "cancel"
    assert engine.node("decision:wiredoor:form-data")["status"] == "held"

    body = {"id": "GHSA-fjxv-7rqg-78g4", "reason": "test"}
    assert c.post("/api/correct", json=body).status_code == 403
    assert c.post("/api/correct", json=body, headers={"x-retcon-passphrase": "nope"}).status_code == 403
    ok = c.post("/api/correct", json=body, headers={"x-retcon-passphrase": "correct horse"})
    assert ok.status_code == 200 and ok.json()["changes"][0]["change"] == "cancel"
    assert engine.node("decision:wiredoor:form-data")["status"] == "retracted"
    # Without a dispatch token the correction still lands; the reply says the agents were not started.
    assert ok.json()["agents"] == {"started": False, "why": "the site has no dispatch token"}


def test_graph_returns_beliefs_with_supports_as_edges(engine, monkeypatch):
    from tests.conftest import withdrawn
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-pj86-cfqh-vqx6"))
    engine.process_event(withdrawn("GHSA-pj86-cfqh-vqx6"))
    c = client(engine, monkeypatch)
    g = c.get("/api/graph", params={"project": "wiredoor"}).json()
    kinds = {n["id"]: n["kind"] for n in g["nodes"]}
    assert kinds["GHSA-pj86-cfqh-vqx6"] == "Advisory"
    assert kinds["exposure:wiredoor:express@4.21.2"] == "Exposure"
    assert kinds["decision:wiredoor:express"] == "Decision"
    assert {(e["source"], e["target"]) for e in g["edges"]} == {
        ("GHSA-pj86-cfqh-vqx6", "exposure:wiredoor:express@4.21.2"),
        ("exposure:wiredoor:express@4.21.2", "decision:wiredoor:express")}
    ev = c.get("/api/event", params={"id": "event:withdrawn:GHSA-pj86-cfqh-vqx6"}).json()
    assert ev["waves"][0] == ["GHSA-pj86-cfqh-vqx6"]


def test_tick_reports_without_a_token(engine, monkeypatch):
    c = client(engine, monkeypatch)
    assert c.post("/api/tick").json() == {"started": False, "why": "the site has no dispatch token"}


def test_load_bearing_ranks_held_advisories(engine, monkeypatch):
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-fjxv-7rqg-78g4"))
    api._load_bearing.clear()
    body = client(engine, monkeypatch).get("/api/loadbearing", params={"project": "wiredoor"}).json()
    assert body["advisories"][0]["id"] == "GHSA-fjxv-7rqg-78g4"
    assert body["advisories"][0]["decisions"] == ["decision:wiredoor:form-data"]
