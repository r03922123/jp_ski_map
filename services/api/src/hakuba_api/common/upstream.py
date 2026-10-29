USER_AGENT = "hakuba-ski-map/0.1 (personal trip planner; local dev)"


class UpstreamError(Exception):
    """A third-party service (Photon, Overpass, Open-Meteo, ...) failed."""

    def __init__(self, source: str, detail: str = "") -> None:
        super().__init__(f"{source}: {detail}")
        self.source = source
