"""Read an npm lockfile (versions 2 and 3) into the package versions a project depends on."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field


@dataclass
class Dependency:
    name: str
    version: str
    direct: bool
    dev: bool
    paths: list[list[str]] = field(default_factory=list)  # each path starts at a direct dependency


def read(lock: dict) -> list[Dependency]:
    packages = lock.get("packages")
    if packages is None:
        raise ValueError("lockfile has no 'packages' map; only lockfile versions 2 and 3 are supported")
    root = packages.get("", {})
    root_deps = {**root.get("dependencies", {}), **root.get("devDependencies", {}),
                 **root.get("optionalDependencies", {})}

    def name_of(key: str) -> str:
        return packages[key].get("name") or key.rsplit("node_modules/", 1)[-1]

    def resolve(from_key: str, dep: str) -> str | None:
        # npm resolution: look in nested node_modules first, then walk up toward the root.
        base = from_key
        while True:
            candidate = f"{base}/node_modules/{dep}" if base else f"node_modules/{dep}"
            if candidate in packages:
                return candidate
            if not base:
                return None
            cut = base.rfind("/node_modules/")
            base = base[:cut] if cut >= 0 else ""

    # Breadth-first from the root gives every installed package its shortest path from a direct dependency.
    best: dict[str, list[str]] = {}
    queue: deque[tuple[str, list[str]]] = deque()
    for dep in root_deps:
        key = resolve("", dep)
        if key and key not in best:
            best[key] = [dep]
            queue.append((key, [dep]))
    while queue:
        key, path = queue.popleft()
        meta = packages[key]
        for dep in {**meta.get("dependencies", {}), **meta.get("optionalDependencies", {}),
                    **meta.get("peerDependencies", {})}:
            child = resolve(key, dep)
            if child and child not in best:
                best[child] = path + [dep]
                queue.append((child, path + [dep]))

    by_version: dict[tuple[str, str], Dependency] = {}
    for key, meta in packages.items():
        if not key or "version" not in meta or meta.get("link"):
            continue
        name, version = name_of(key), meta["version"]
        dep = by_version.setdefault((name, version), Dependency(name, version, direct=False, dev=True))
        is_direct = key == f"node_modules/{name}" and name in root_deps
        dep.direct = dep.direct or is_direct
        dep.dev = dep.dev and bool(meta.get("dev"))
        if key in best and best[key] not in dep.paths:
            dep.paths.append(best[key])
    for dep in by_version.values():
        dep.paths.sort(key=len)
    return sorted(by_version.values(), key=lambda d: (d.name, d.version))
