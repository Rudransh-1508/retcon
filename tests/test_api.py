from fastapi.testclient import TestClient

from retcon import api
from tests.conftest import add, published


def client(engine, monkeypatch, passphrase="correct horse"):
    monkeypatch.setattr(api, "_engine", engine)
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
