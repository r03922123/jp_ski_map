"""Read coordinates out of a pasted Google Maps link — no Google API involved.

The only network call is one HEAD request to resolve a maps.app.goo.gl short link
the user pasted; the redirect target is read, never fetched.
"""

import re
from urllib.parse import parse_qs, unquote_plus, urlparse

import httpx

from hakuba_api.common.geo import Coord
from hakuba_api.common.ratelimit import spend_upstream
from hakuba_api.common.upstream import USER_AGENT
from hakuba_api.places.models import Place

SHORT_LINK_HOSTS = {"maps.app.goo.gl", "goo.gl"}
_GOOGLE_HOST = re.compile(r"^(www\.|maps\.)?google\.[a-z.]+$")
_NUM = r"(-?\d{1,3}\.\d+)"
_PIN = re.compile(rf"!3d{_NUM}!4d{_NUM}")
_VIEWPORT = re.compile(rf"@{_NUM},{_NUM}")
_LAT_LNG = re.compile(rf"^\s*{_NUM}\s*,\s*{_NUM}\s*$")
_PLACE_NAME = re.compile(r"/maps/place/([^/@]+)")


def is_google_maps_url(text: str) -> bool:
    url = urlparse(text.strip())
    if url.scheme not in ("http", "https"):
        return False
    host = url.hostname or ""
    if host in SHORT_LINK_HOSTS:
        return True
    if not _GOOGLE_HOST.match(host):
        return False
    return host.startswith("maps.") or url.path.startswith("/maps")


def is_short_link(text: str) -> bool:
    return (urlparse(text.strip()).hostname or "") in SHORT_LINK_HOSTS


def _coords(url: str) -> tuple[float, float] | None:
    # The place pin (!3d!4d) beats the viewport centre (@lat,lng).
    if m := _PIN.search(url) or _VIEWPORT.search(url):
        return float(m.group(1)), float(m.group(2))
    for key in ("q", "query", "ll", "center"):
        for value in parse_qs(urlparse(url).query).get(key, []):
            if m := _LAT_LNG.match(value):
                return float(m.group(1)), float(m.group(2))
    return None


def parse_google_maps_url(url: str) -> Place | None:
    coords = _coords(url)
    if coords is None:
        return None
    lat, lng = coords
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    name = m.group(1) if (m := _PLACE_NAME.search(url)) else None
    return Place(
        id="gmaps-link",
        name=unquote_plus(name) if name else "Dropped pin",
        kind="other",
        coord=Coord(lat=lat, lng=lng),
        address=None,
        source="gmaps-link",
    )


def resolve_short_link(url: str, timeout_s: float = 5) -> str | None:
    """Follow exactly one redirect of a Google short link; never any other host."""
    parsed = urlparse(url.strip())
    if parsed.scheme != "https" or parsed.hostname not in SHORT_LINK_HOSTS:
        return None
    spend_upstream("gmaps-link")
    try:
        response = httpx.head(
            url.strip(),
            follow_redirects=False,
            timeout=timeout_s,
            headers={"User-Agent": USER_AGENT},
        )
    except httpx.HTTPError:
        return None
    if response.is_redirect:
        return response.headers.get("location")
    return None
