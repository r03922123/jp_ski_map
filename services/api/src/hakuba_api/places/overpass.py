import time
from collections.abc import Callable
from typing import Any

import httpx

from hakuba_api.common.upstream import USER_AGENT, UpstreamError

OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]


def fetch_overpass(
    query: str,
    mirrors: list[str] = OVERPASS_MIRRORS,
    attempts: int = 3,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    """POST an Overpass query, retrying with exponential backoff across mirrors.

    Public instances regularly answer 429/5xx or a 200 HTML "busy" page.
    """
    last_error = ""
    for attempt in range(attempts):
        for url in mirrors:
            try:
                response = httpx.post(
                    url, data={"data": query}, headers={"User-Agent": USER_AGENT}, timeout=90
                )
                if response.status_code == 200:
                    return response.json()
                last_error = f"{url}: HTTP {response.status_code}"
            except (httpx.HTTPError, ValueError) as e:  # ValueError: HTML instead of JSON
                last_error = f"{url}: {e}"
        if attempt < attempts - 1:
            sleep(2 ** (attempt + 1))
    raise UpstreamError("overpass", last_error)
