from datetime import date
from typing import Literal

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


class Direction(ApiModel):
    id: str
    stops: list[str]  # printed names, resolved via BusStop.aliases
    trips: list[Trip]


class LocalizedText(ApiModel):
    en: str
    ja: str


class Timetable(ApiModel):
    line_id: str  # e.g. line-v (badge colour / group)
    route_id: str  # e.g. v1; periods of one route must not overlap
    season: str
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
