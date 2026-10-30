"""Turn what people paste from hotel sites into a searchable name (SPEC-place-search v1.3).

A hotel-site URL is read as text only, never fetched: its path usually carries the hotel's
name ("booking.com/hotel/jp/hakuba-tokyu.html"). A copied page title loses its site noise
("Phoenix Hotel, Hakuba – Updated 2026 Prices" → "Phoenix Hotel"). Anything else, including
Google Maps links (handled by `gmaps_link`), passes through unchanged.
"""

import re
from urllib.parse import unquote, urlparse

# Place words that follow a hotel's name in titles and URLs ("…, Hakuba (Japan)").
_LOCALITY = {"hakuba", "mura", "hakuba-mura", "otari", "omachi", "nagano", "japan", "jp"}
_NOISE = re.compile(
    r"(?i)\b(updated \d{4} prices|hotel reviews|reviews|prices|deals|booking\.com|"
    r"expedia|agoda|tripadvisor|hotels\.com|trip\.com)\b"
)
_SEPARATOR = re.compile(r"\s+[|–—-]\s+|[:,]\s+")
_WORD = re.compile(r"[^\W_]+(?:-[^\W_]+)*")


def _slug_words(slug: str) -> str:
    words = [w for w in re.split(r"[-_+\s]+", slug.lower()) if w]
    if words[-1:] == ["japan"]:  # "…-hotel-hakuba-japan": drop the town too
        words.pop()
        if words and words[-1] in _LOCALITY:
            words.pop()
    return " ".join(words)


def _from_url(text: str) -> str | None:
    """Name words from a known hotel-site URL, or None when it isn't one."""
    try:
        url = urlparse(text)
    except ValueError:
        return None
    host = (url.hostname or "").lower()
    path = unquote(url.path)
    patterns = [
        ("booking.com", r"/hotel/[a-z]{2}/([^/.]+)"),
        ("agoda.", r"^/([^/]+)/hotel/"),
        ("expedia.", r"-Hotels-(.+?)\.h\d+"),
        ("hotels.com", r"/ho\d+/([^/]+)"),
        ("trip.com", r"/hotels/[^/]*-hotel-detail-\d+/([^/]+)"),
    ]
    for site, pattern in patterns:
        if site in host and (m := re.search(pattern, path)):
            return _slug_words(m.group(1))
    return None


def _strip_title_noise(text: str) -> str:
    """Cut at the first separator after which only site noise or place words follow."""
    for sep in _SEPARATOR.finditer(text):
        rest = text[sep.end() :]
        if _NOISE.search(rest):
            return text[: sep.start()]
        words = [w.lower() for w in _WORD.findall(rest)]
        if words and all(w in _LOCALITY for w in words):
            return text[: sep.start()]
    return text


def clean_query(text: str) -> str:
    text = " ".join(text.split())
    if re.match(r"(?i)^https?://", text):
        return _from_url(text) or text
    return _strip_title_noise(text).strip()
