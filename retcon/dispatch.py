"""Starting the agents' worker (a GitHub Actions workflow) from the website.

The agents and their keys live in the worker; the site only asks GitHub to run it, with a token that can do
nothing else (RETCON_DISPATCH_TOKEN: a fine-grained token on this repository with Actions read and write).
Two callers: an admin correction runs it now, and the console's tick runs it when the last run is stale,
because GitHub's own schedule is best effort and can skip hours on a quiet repository.
"""

from __future__ import annotations

import time
from datetime import datetime

import requests

from . import config

WORKFLOW = "worker.yml"
STALE_AFTER = 10 * 60  # seconds: the worker's intended schedule
CHECK_EVERY = 60  # seconds: how often one server instance asks GitHub about the worker
ACTIVE = {"queued", "in_progress", "waiting", "requested", "pending"}

_last: dict = {"at": 0.0, "answer": None}


def _token() -> str | None:
    return config.env("RETCON_DISPATCH_TOKEN")


def _call(method: str, path: str, **kwargs) -> requests.Response:
    repo = config.env("RETCON_REPO", "Rudransh-1508/retcon")
    response = requests.request(
        method, f"https://api.github.com/repos/{repo}/actions/workflows/{WORKFLOW}{path}",
        headers={"Authorization": f"Bearer {_token()}", "Accept": "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28"},
        timeout=10, **kwargs)
    response.raise_for_status()
    return response


def latest_run(now: float | None = None) -> dict:
    """Whether a worker run is queued or running, and how many seconds ago the latest run started."""
    runs = _call("GET", "/runs", params={"per_page": 5}).json().get("workflow_runs", [])
    now = time.time() if now is None else now
    active = any(r.get("status") in ACTIVE for r in runs)
    started = [datetime.fromisoformat(r["created_at"].replace("Z", "+00:00")).timestamp() for r in runs if r.get("created_at")]
    return {"active": active, "age": round(now - max(started)) if started else None}


def run_now(reason: str) -> dict:
    """Ask GitHub to start the worker. Never raises: the site keeps working if GitHub says no."""
    if not _token():
        return {"started": False, "why": "the site has no dispatch token"}
    try:
        _call("POST", "/dispatches", json={"ref": "main", "inputs": {"command": "run"}})
    except requests.RequestException as e:
        status = getattr(e.response, "status_code", None)
        return {"started": False, "why": f"GitHub refused ({status})" if status else "GitHub unavailable"}
    _last.update(at=0.0, answer=None)
    return {"started": True, "why": reason}


def run_if_stale(now: float | None = None) -> dict:
    """Start the worker unless one is queued or running, or the latest run started under 10 minutes ago."""
    now = time.time() if now is None else now
    if not _token():
        return {"started": False, "why": "the site has no dispatch token"}
    if _last["answer"] is not None and now - _last["at"] < CHECK_EVERY:
        return _last["answer"]
    try:
        run = latest_run(now)
    except requests.RequestException:
        return {"started": False, "why": "GitHub unavailable"}
    if run["active"]:
        answer = {"started": False, "why": "a run is already queued or running", "age": run["age"]}
    elif run["age"] is not None and run["age"] < STALE_AFTER:
        answer = {"started": False, "why": "the agents ran recently", "age": run["age"]}
    else:
        answer = run_now("the agents had not run for 10 minutes")
        # Later ticks in the same minute must not report a start they did not make.
        _last.update(at=now, answer={"started": False, "why": "a run was just started", "age": 0} if answer["started"] else answer)
        return answer
    _last.update(at=now, answer=answer)
    return answer
