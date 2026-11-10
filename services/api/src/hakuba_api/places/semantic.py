"""Optional semantic retrieval from the local embedding server (SPEC-place-search v1.4)."""

import logging
import os
import time

import httpx

log = logging.getLogger(__name__)

TIMEOUT_S = 0.3  # typing must stay responsive; lexical results stand on their own


def semantic_ids(query: str, k: int) -> list[str]:
    """Entry ids from the embedding server, best first; [] when it is off, down or slow."""
    base = os.environ.get("HAKUBA_SEMANTIC_URL")
    if not base:
        return []
    start = time.perf_counter()
    try:
        resp = httpx.get(f"{base}/search", params={"q": query, "k": k}, timeout=TIMEOUT_S)
        resp.raise_for_status()
        ids = [str(hit["id"]) for hit in resp.json()]
    except (httpx.HTTPError, ValueError, TypeError, KeyError) as e:
        log.warning("semantic search unavailable, lexical only: %s", type(e).__name__)
        return []
    # counts and timing only: query text is user data and never logged
    log.info("semantic search ms=%.0f hits=%d", (time.perf_counter() - start) * 1000, len(ids))
    return ids
