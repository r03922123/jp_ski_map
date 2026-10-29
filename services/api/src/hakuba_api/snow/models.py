from datetime import datetime
from typing import Literal

from pydantic import ConfigDict

from hakuba_api.common.models import ApiModel


class SnowDepth(ApiModel):
    base: int | None
    summit: int | None
    source: Literal["model", "reported"]


class NewSnow(ApiModel):
    """Centimetres; None when any hour in the window is missing (never 0)."""

    # to_camel would turn past24h into past24H; these names are already wire-ready
    model_config = ConfigDict(alias_generator=None)

    past24h: float | None
    past72h: float | None
    next24h: float | None
    next72h: float | None


class SummitTemps(ApiModel):
    summit_min: float | None
    summit_max: float | None


class SnowReport(ApiModel):
    resort_id: str
    as_of: datetime
    depth_cm: SnowDepth
    new_snow_cm: NewSnow
    temp_c: SummitTemps
