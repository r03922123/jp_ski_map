"""Stage runner, lock file and snapshot store (SPEC-pipeline.md, Design).

A stage is a module in `hakuba_pipeline.stages` with `VERSION`, `INPUTS` (other stage names, or
paths with a "/" relative to the pipeline root), `NETWORK` (whether it calls `fetch`) and
`run(inputs, out)`. A stage whose key (version + input bytes) is in `pipeline.lock.json` with
the same output hashes is skipped; a network stage always re-runs online. Every network read goes
through `fetch`, which keeps the bytes at `<store>/<sha256>` and logs the URL and hash per stage.
"""

import hashlib
import json
import os
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from types import ModuleType
from typing import Any, cast

import httpx
from hakuba_api.common.upstream import USER_AGENT

ROOT = Path(__file__).parents[2]


@dataclass(frozen=True)
class Stage:
    name: str
    version: str
    inputs: tuple[str, ...]
    network: bool
    run: Callable[[Mapping[str, Path], Path], None]

    @classmethod
    def of(cls, module: ModuleType) -> "Stage":
        m = cast(Any, module)
        return cls(module.__name__.rsplit(".", 1)[1], m.VERSION, m.INPUTS, m.NETWORK, m.run)


@dataclass
class _Fetcher:
    store: Path
    offline: bool
    locked: dict[str, str]  # url -> sha256 from the last run of the current stage
    log: dict[str, str] = field(default_factory=dict[str, str])
    changed: list[str] = field(default_factory=list[str])


_fetcher: _Fetcher | None = None


def fetch(url: str) -> bytes:
    """Bytes of `url`, from the network (online) or the snapshot store (offline)."""
    if _fetcher is None:
        raise RuntimeError("fetch() is only available while the runner runs a stage")
    f = _fetcher
    if f.offline:
        if url not in f.locked:
            raise FileNotFoundError(f"--offline: {url} is not in pipeline.lock.json")
        sha = f.locked[url]
        path = f.store / sha
        if not path.exists():
            raise FileNotFoundError(f"--offline: snapshot {sha} of {url} is not in {f.store}")
        content = path.read_bytes()
    else:
        response = httpx.get(
            url, headers={"User-Agent": USER_AGENT}, timeout=60, follow_redirects=True
        )
        response.raise_for_status()
        content = response.content
        sha = hashlib.sha256(content).hexdigest()
        path = f.store / sha
        if not path.exists():
            path.write_bytes(content)
        if f.locked.get(url, sha) != sha:
            f.changed.append(url)
    f.log[url] = sha
    return content


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _hash_tree(path: Path) -> dict[str, str]:
    """{relative path: sha256} of a file or of every file under a folder ({} if missing)."""
    if path.is_file():
        return {path.name: _sha(path)}
    return {p.relative_to(path).as_posix(): _sha(p) for p in sorted(path.rglob("*")) if p.is_file()}


@dataclass
class Result:
    ran: list[str]
    changed: list[str]  # URLs whose bytes differ from the lock (new or removed URLs aren't listed)


def run(
    stages: list[Stage], *, root: Path = ROOT, store: Path | None = None, offline: bool = False
) -> Result:
    """Run `stages` in order (callers list a stage after its inputs) and rewrite the lock."""
    global _fetcher
    store = store or Path(os.environ.get("HAKUBA_SNAPSHOTS", root / "snapshots"))
    store.mkdir(parents=True, exist_ok=True)
    lock_path = root / "pipeline.lock.json"
    lock: dict[str, Any] = json.loads(lock_path.read_text()) if lock_path.exists() else {}
    entries: dict[str, Any] = lock.setdefault("stages", {})
    result = Result([], [])

    for stage in stages:
        inputs = {i: root / i if "/" in i else root / "out" / i for i in stage.inputs}
        key_src = json.dumps([stage.version, {i: _hash_tree(p) for i, p in inputs.items()}])
        key = hashlib.sha256(key_src.encode()).hexdigest()
        out = root / "out" / stage.name
        old = entries.get(stage.name, {})
        fresh = old.get("key") == key and old.get("outputs") == _hash_tree(out)
        if fresh and (offline or not stage.network):
            continue

        _fetcher = _Fetcher(store, offline, dict(old.get("fetches", {})))
        try:
            out.mkdir(parents=True, exist_ok=True)
            for stale in out.rglob("*"):
                if stale.is_file():
                    stale.unlink()
            stage.run(inputs, out)
            fetched = _fetcher
        finally:
            _fetcher = None
        entries[stage.name] = {
            "version": stage.version,
            "key": key,
            "fetches": dict(sorted(fetched.log.items())),
            "outputs": _hash_tree(out),
        }
        result.ran.append(stage.name)
        result.changed += fetched.changed

    lock_path.write_text(json.dumps(lock, indent=2, sort_keys=True) + "\n")
    return result
