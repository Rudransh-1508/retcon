"""In-memory GitHub port for tests: records every action, serves target repo files from fixtures."""

import json
from pathlib import Path

from retcon.github import Item, check_target

FIXTURES = Path(__file__).parent / "fixtures"


class FakeGitHub:
    def __init__(self):
        self.items: dict[str, dict[int, Item]] = {}
        self.comments: list[tuple[str, int, str]] = []
        self.pushes: list[tuple[str, str, dict]] = []
        self.log: list[tuple[str, str, int]] = []
        self.files: dict[tuple[str, str], str] = {}
        self._n = 0

    def _new(self, repo, title, body, labels, is_pr):
        check_target(repo)
        self._n += 1
        item = Item(self._n, f"https://github.com/{repo}/{'pull' if is_pr else 'issues'}/{self._n}", "open",
                    title, body, list(labels), is_pr)
        self.items.setdefault(repo, {})[item.number] = item
        return item

    def default_branch(self, repo):
        check_target(repo)
        return "main"

    def read_file(self, repo, path, ref):
        check_target(repo)
        project = "gladys" if repo.endswith("gladys") else "wiredoor"
        if path.endswith("package-lock.json"):
            return (FIXTURES / "lockfiles" / f"{project}.package-lock.json").read_text()
        lock = json.loads((FIXTURES / "lockfiles" / f"{project}.package-lock.json").read_text())
        root = lock["packages"][""]
        return json.dumps({"name": root.get("name", project), "version": root.get("version", "0.0.0"),
                           "dependencies": root.get("dependencies", {}),
                           "devDependencies": root.get("devDependencies", {})}, indent=2) + "\n"

    def find_by_marker(self, repo, marker):
        check_target(repo)
        return next((i for i in self.items.get(repo, {}).values() if marker in i.body), None)

    def open_pr(self, repo, branch, title, body, labels, files, message):
        item = self._new(repo, title, body, labels, True)
        self.pushes.append((repo, branch, files))
        self.log.append(("open_pr", repo, item.number))
        return item

    def push_files(self, repo, branch, files, message):
        check_target(repo)
        self.pushes.append((repo, branch, files))
        self.log.append(("push", repo, 0))

    def update(self, repo, number, *, title=None, body=None, labels=None, state=None):
        check_target(repo)
        item = self.items[repo][number]
        if title is not None:
            item.title = title
        if body is not None:
            item.body = body
        if labels is not None:
            item.labels = list(labels)
        if state is not None:
            item.state = state
        self.log.append(("update" if state is None else f"state:{state}", repo, number))
        return item

    def comment(self, repo, number, body):
        check_target(repo)
        self.comments.append((repo, number, body))
        self.log.append(("comment", repo, number))
        return f"https://github.com/{repo}/issues/{number}#comment-{len(self.comments)}"

    def open_issue(self, repo, title, body, labels):
        item = self._new(repo, title, body, labels, False)
        self.log.append(("open_issue", repo, item.number))
        return item

    def prs(self, repo):
        return [i for i in self.items.get(repo, {}).values() if i.is_pr]
