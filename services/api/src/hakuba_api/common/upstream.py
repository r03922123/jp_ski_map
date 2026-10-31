import os


def user_agent(public_url: str | None) -> str:
    """Identify ourselves to the free services (Photon, Open-Meteo, ...): name + where we run."""
    return f"hakuba-ski-map/0.1 (personal trip planner; {public_url or 'local dev'})"


USER_AGENT = user_agent(os.environ.get("PUBLIC_URL"))


class UpstreamError(Exception):
    """A third-party service (Photon, Overpass, Open-Meteo, ...) failed."""

    def __init__(self, source: str, detail: str = "") -> None:
        super().__init__(f"{source}: {detail}")
        self.source = source


class UpstreamBusyError(UpstreamError):
    """Our own budget for that service is spent (common/ratelimit.py); it wasn't called."""

    def __init__(self, source: str) -> None:
        super().__init__(source, "over our request budget")
