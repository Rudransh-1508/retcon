"""GitHub port: the only way Retcon touches GitHub. It refuses every repository except the targets."""

from __future__ import annotations

import base64
import time
from dataclasses import dataclass, field
from typing import Protocol

import requests

from . import config


class NotATarget(PermissionError):
    pass


def check_target(repo: str):
    if repo not in config.TARGET_REPOS:
        raise NotATarget(f"Retcon only acts on {config.TARGET_REPOS}, not {repo}")


@dataclass
class Item:
    """A pull request or issue as Retcon sees it."""
    number: int
    url: str
    state: str  # open | closed
    title: str
    body: str
    labels: list[str] = field(default_factory=list)
    is_pr: bool = True


class GitHubPort(Protocol):
    def default_branch(self, repo: str) -> str: ...
    def read_file(self, repo: str, path: str, ref: str) -> str: ...
    def find_by_marker(self, repo: str, marker: str) -> Item | None: ...
    def open_pr(self, repo: str, branch: str, title: str, body: str, labels: list[str],
                files: dict[str, str], message: str) -> Item: ...
    def push_files(self, repo: str, branch: str, files: dict[str, str], message: str) -> None: ...
    def update(self, repo: str, number: int, *, title: str | None = None, body: str | None = None,
               labels: list[str] | None = None, state: str | None = None) -> Item: ...
    def comment(self, repo: str, number: int, body: str) -> str: ...
    def open_issue(self, repo: str, title: str, body: str, labels: list[str]) -> Item: ...


LABEL_COLORS = {"P0": "d93036", "P1": "e5701a", "P2": "c99a06", "P3": "7b7b86", "retcon": "5b5bd6",
                "cancelled": "a3a3ad"}


class RealGitHub:
    """GitHub REST API with a fine-grained token limited to the target repositories."""

    def __init__(self, token: str | None = None, pause: float = 0.7):
        token = token or config.env("GITHUB_TOKEN")
        if not token:
            raise RuntimeError("GITHUB_TOKEN is not set")
        self.s = requests.Session()
        self.s.headers.update({"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
                               "X-GitHub-Api-Version": "2022-11-28"})
        self.pause = pause  # stay well under GitHub's secondary rate limits for content creation
        self._items: dict[str, list[Item]] = {}
        self._labels: dict[str, set[str]] = {}

    def _req(self, method: str, url: str, write: bool = False, **kw):
        for attempt in range(6):
            r = self.s.request(method, f"https://api.github.com{url}", timeout=60, **kw)
            if r.status_code in (403, 429) and ("rate limit" in r.text.lower() or "secondary" in r.text.lower()):
                wait = int(r.headers.get("retry-after", 0)) or 30 * (attempt + 1)
                time.sleep(wait)
                continue
            if r.status_code >= 500 and attempt < 5:
                time.sleep(2 * (attempt + 1))
                continue
            r.raise_for_status()
            if write:
                time.sleep(self.pause)
            return r.json() if r.content else None
        r.raise_for_status()

    def default_branch(self, repo):
        check_target(repo)
        return self._req("GET", f"/repos/{repo}")["default_branch"]

    def read_file(self, repo, path, ref):
        check_target(repo)
        meta = self._req("GET", f"/repos/{repo}/contents/{path}", params={"ref": ref})
        if meta.get("encoding") == "base64" and meta.get("content"):
            return base64.b64decode(meta["content"]).decode()
        blob = self._req("GET", f"/repos/{repo}/git/blobs/{meta['sha']}")
        return base64.b64decode(blob["content"]).decode()

    def _all_items(self, repo) -> list[Item]:
        if repo not in self._items:
            items, page = [], 1
            while True:
                batch = self._req("GET", f"/repos/{repo}/issues", params={"state": "all", "per_page": 100, "page": page})
                items += [self._item(x) for x in batch]
                if len(batch) < 100:
                    break
                page += 1
            self._items[repo] = items
        return self._items[repo]

    @staticmethod
    def _item(x) -> Item:
        return Item(number=x["number"], url=x["html_url"], state=x["state"], title=x["title"], body=x.get("body") or "",
                    labels=[label["name"] for label in x.get("labels", [])], is_pr="pull_request" in x)

    def _remember(self, repo, item: Item):
        items = self._all_items(repo)
        self._items[repo] = [i for i in items if i.number != item.number] + [item]

    def find_by_marker(self, repo, marker):
        check_target(repo)
        return next((i for i in self._all_items(repo) if marker in i.body), None)

    def _ensure_labels(self, repo, labels):
        if repo not in self._labels:
            self._labels[repo] = {x["name"] for x in self._req("GET", f"/repos/{repo}/labels", params={"per_page": 100})}
        for name in labels:
            if name not in self._labels[repo]:
                self._req("POST", f"/repos/{repo}/labels", write=True,
                          json={"name": name, "color": LABEL_COLORS.get(name, "ededed")})
                self._labels[repo].add(name)

    def _commit(self, repo, base_sha, files, message) -> str:
        tree = [{"path": path, "mode": "100644", "type": "blob",
                 "sha": self._req("POST", f"/repos/{repo}/git/blobs", json={"content": content, "encoding": "utf-8"})["sha"]}
                for path, content in files.items()]
        base_tree = self._req("GET", f"/repos/{repo}/git/commits/{base_sha}")["tree"]["sha"]
        new_tree = self._req("POST", f"/repos/{repo}/git/trees", json={"base_tree": base_tree, "tree": tree})["sha"]
        return self._req("POST", f"/repos/{repo}/git/commits", write=True,
                         json={"message": message, "tree": new_tree, "parents": [base_sha]})["sha"]

    def open_pr(self, repo, branch, title, body, labels, files, message):
        check_target(repo)
        base = self.default_branch(repo)
        base_sha = self._req("GET", f"/repos/{repo}/git/ref/heads/{base}")["object"]["sha"]
        sha = self._commit(repo, base_sha, files, message)
        try:
            self._req("POST", f"/repos/{repo}/git/refs", write=True, json={"ref": f"refs/heads/{branch}", "sha": sha})
        except requests.HTTPError:
            self._req("PATCH", f"/repos/{repo}/git/refs/heads/{branch}", write=True, json={"sha": sha, "force": True})
        pr = self._req("POST", f"/repos/{repo}/pulls", write=True,
                       json={"title": title, "body": body, "head": branch, "base": base})
        self._ensure_labels(repo, labels)
        self._req("PUT", f"/repos/{repo}/issues/{pr['number']}/labels", write=True, json={"labels": labels})
        item = Item(pr["number"], pr["html_url"], "open", title, body, labels, True)
        self._remember(repo, item)
        return item

    def push_files(self, repo, branch, files, message):
        check_target(repo)
        base = self.default_branch(repo)
        base_sha = self._req("GET", f"/repos/{repo}/git/ref/heads/{base}")["object"]["sha"]
        sha = self._commit(repo, base_sha, files, message)
        self._req("PATCH", f"/repos/{repo}/git/refs/heads/{branch}", write=True, json={"sha": sha, "force": True})

    def update(self, repo, number, *, title=None, body=None, labels=None, state=None):
        check_target(repo)
        patch = {k: v for k, v in {"title": title, "body": body, "state": state}.items() if v is not None}
        x = self._req("PATCH", f"/repos/{repo}/issues/{number}", write=True, json=patch) if patch else \
            self._req("GET", f"/repos/{repo}/issues/{number}")
        if labels is not None:
            self._ensure_labels(repo, labels)
            self._req("PUT", f"/repos/{repo}/issues/{number}/labels", write=True, json={"labels": labels})
            x["labels"] = [{"name": n} for n in labels]
        item = self._item(x)
        self._remember(repo, item)
        return item

    def comment(self, repo, number, body):
        check_target(repo)
        return self._req("POST", f"/repos/{repo}/issues/{number}/comments", write=True, json={"body": body})["html_url"]

    def open_issue(self, repo, title, body, labels):
        check_target(repo)
        self._ensure_labels(repo, labels)
        x = self._req("POST", f"/repos/{repo}/issues", write=True, json={"title": title, "body": body, "labels": labels})
        item = self._item(x)
        self._remember(repo, item)
        return item
