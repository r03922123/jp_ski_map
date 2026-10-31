from datetime import date, datetime
from typing import Annotated

from fastapi import HTTPException
from pydantic import AfterValidator

from hakuba_api.common.geo import Coord

# Timetables, seasons and snow are about this century. Dates far outside it are not
# plans; at the edges of what datetime holds (9999, year 1) the arithmetic overflows.
EARLIEST = date(2000, 1, 1)
LATEST = date(2100, 12, 31)
# A pasted Google Maps link can run to several hundred characters; a search never more
MAX_QUERY_CHARS = 2048


def _plausible_day(day: date) -> date:
    if not EARLIEST <= day <= LATEST:
        raise ValueError(f"date must be between {EARLIEST} and {LATEST}")
    return day


def _plausible_moment(moment: datetime) -> datetime:
    _plausible_day(moment.date())  # before any time-zone arithmetic can overflow
    return moment


PlausibleDate = Annotated[date, AfterValidator(_plausible_day)]
PlausibleDateTime = Annotated[datetime, AfterValidator(_plausible_moment)]


def parse_lat_lng(value: str, name: str) -> Coord:
    """Parse a `lat,lng` query parameter; 422 on anything malformed or out of range."""
    parts = value.split(",")
    try:
        if len(parts) != 2:
            raise ValueError
        lat, lng = float(parts[0]), float(parts[1])
    except ValueError:
        raise HTTPException(422, f"{name} must be 'lat,lng'") from None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise HTTPException(422, f"{name} is out of range")
    return Coord(lat=lat, lng=lng)
