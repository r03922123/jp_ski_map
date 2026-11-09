from datetime import date
from typing import Annotated, Literal

from pydantic import Field, field_validator

from hakuba_api.common.geo import Coord
from hakuba_api.common.models import ApiModel


class StopName(ApiModel):
    en: str
    ja: str | None  # a few stops print no Japanese name


class BusStop(ApiModel):
    id: str
    name: StopName
    coord: Coord | None  # None = not yet located; such stops can't be walked to
    serves_resort_id: str | None
    aliases: list[str]  # exact English names as printed on the timetables
    coord_source: str


class Fare(ApiModel):
    adult_jpy: int
    child_jpy: int
    hv_pass_free: bool


class TimetableSource(ApiModel):
    file: str  # asset file name in data/bus/sources.json


class Trip(ApiModel):
    n: int
    times: list[str | None]  # "HH:MM" per stop; None = doesn't stop / not published
    skips: list[int] = []  # stops a first-stop-only trip prints "—" for: it doesn't go there


class StopPairing(ApiModel):
    stop: int  # index into Direction.stops
    only_with: int  # a ride using `stop` must have this stop at its other end


class Direction(ApiModel):
    id: str
    stops: list[str]  # printed names, resolved via BusStop.aliases
    trips: list[Trip]
    # indexes into stops, because a loop lists some stops twice (SPEC-bus-schedules v1.2)
    board_only: list[int] = []
    alight_only: list[int] = []
    restricted: list[StopPairing] = []


class LocalizedText(ApiModel):
    en: str
    ja: str


class Timetable(ApiModel):
    line_id: str  # e.g. line-v (badge colour / group)
    route_id: str  # e.g. v1; periods of one route must not overlap
    season: Annotated[str, Field(pattern=r"^\d{4}-\d{2}$")]  # "2025-26"; sorts chronologically
    kind: Literal["day", "night"]
    name: LocalizedText
    valid_from: date
    valid_to: date
    service_days: Literal["daily"]
    fare: Fare
    source: TimetableSource
    reviewed: bool  # never served unless a human checked it against the image
    directions: list[Direction]
    notes: str | None = None

    @field_validator("season")
    @classmethod
    def _consecutive_years(cls, season: str) -> str:
        if int(season[5:]) != (int(season[:4]) + 1) % 100:
            raise ValueError(f"season {season!r} must span consecutive years, e.g. 2025-26")
        return season
