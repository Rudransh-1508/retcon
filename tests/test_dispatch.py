"""The website starts the agents' worker through GitHub's API; GitHub is faked here, nothing is sent."""

import pytest
import requests

from retcon import dispatch

NOW = 1_800_000_000.0  # 2027-01-15T08:00:00Z


def iso(seconds_ago: float) -> str:
    from datetime import datetime, timezone
    return datetime.fromtimestamp(NOW - seconds_ago, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class FakeGitHub:
    def __init__(self, runs=(), refuse=None):
        self.runs = list(runs)
        self.refuse = refuse
        self.calls = []

    def request(self, method, url, headers=None, timeout=None, params=None, json=None):
        self.calls.append((method, url.rsplit("/", 1)[-1], json))
        response = requests.Response()
        response.status_code = self.refuse or (204 if method == "POST" else 200)
        response._content = b"" if method == "POST" else requests.compat.json.dumps({"workflow_runs": self.runs}).encode()
        return response

    @property
    def dispatched(self):
        return [c for c in self.calls if c[0] == "POST"]


@pytest.fixture
def github(monkeypatch):
    fake = FakeGitHub()
    monkeypatch.setattr(dispatch.requests, "request", fake.request)
    monkeypatch.setenv("RETCON_DISPATCH_TOKEN", "test-token")
    dispatch._last.update(at=0.0, answer=None)
    return fake


def test_a_stale_worker_is_started(github):
    github.runs = [{"status": "completed", "created_at": iso(25 * 60)}]
    answer = dispatch.run_if_stale(NOW)
    assert answer["started"] is True
    assert github.dispatched == [("POST", "dispatches", {"ref": "main", "inputs": {"command": "run"}})]


def test_a_recent_or_running_worker_is_left_alone(github):
    github.runs = [{"status": "completed", "created_at": iso(4 * 60)}]
    assert dispatch.run_if_stale(NOW) == {"started": False, "why": "the agents ran recently", "age": 240}
    dispatch._last.update(at=0.0, answer=None)
    github.runs = [{"status": "in_progress", "created_at": iso(30 * 60)}]
    assert dispatch.run_if_stale(NOW)["why"] == "a run is already queued or running"
    assert github.dispatched == []


def test_github_is_asked_at_most_once_a_minute(github):
    github.runs = [{"status": "completed", "created_at": iso(4 * 60)}]
    dispatch.run_if_stale(NOW)
    dispatch.run_if_stale(NOW + 30)
    assert len(github.calls) == 1
    dispatch.run_if_stale(NOW + 61)
    assert len(github.calls) == 2


def test_no_token_or_a_refusal_never_breaks_the_site(github, monkeypatch):
    github.refuse = 403
    assert dispatch.run_now("test") == {"started": False, "why": "GitHub refused (403)"}
    monkeypatch.delenv("RETCON_DISPATCH_TOKEN")
    assert dispatch.run_if_stale(NOW) == {"started": False, "why": "the site has no dispatch token"}
    assert dispatch.run_now("test")["started"] is False


def test_a_second_tick_right_after_a_start_does_not_claim_another(github):
    github.runs = [{"status": "completed", "created_at": iso(25 * 60)}]
    assert dispatch.run_if_stale(NOW)["started"] is True
    assert dispatch.run_if_stale(NOW + 20) == {"started": False, "why": "a run was just started", "age": 0}
    assert len(github.dispatched) == 1
