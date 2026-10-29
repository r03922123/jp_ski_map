from datetime import date
from typing import Literal, Protocol

from hakuba_api.catalog.models import Resort
from hakuba_api.common.models import ApiModel
from hakuba_api.snow.models import SnowReport

CrowdLevel = Literal["low", "medium", "high", "very_high"]


class CrowdEstimate(ApiModel):
    resort_id: str
    date: date
    level: CrowdLevel
    score: float
    source: str
    is_estimate: bool = True
    reasons: list[str]


class PeakPeriod(ApiModel):
    id: str
    name: str
    start: date
    end: date
    weight: float
    source: str


class CrowdSource(Protocol):
    """Swap-in point for real data (history, live feeds) without changing the API."""

    def estimate(self, resort: Resort, day: date, snow: SnowReport | None) -> CrowdEstimate: ...
