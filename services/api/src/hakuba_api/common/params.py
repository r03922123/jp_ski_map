from fastapi import HTTPException

from hakuba_api.common.geo import Coord


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
