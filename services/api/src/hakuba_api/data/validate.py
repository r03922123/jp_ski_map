"""Validate every data file: `python -m hakuba_api.data.validate` (exit 1 on errors)."""

import sys

from pydantic import ValidationError

from hakuba_api.bus.validate import validate_repository as validate_bus_data
from hakuba_api.catalog.store import load_resorts
from hakuba_api.catalog.validate import validate_resorts
from hakuba_api.pois.store import load_pois
from hakuba_api.pois.validate import validate_pois


def collect_errors() -> list[str]:
    try:
        resorts = load_resorts()
    except ValidationError as e:
        return [f"resorts.json: {e}"]
    try:
        bus_errors = validate_bus_data()
    except ValidationError as e:
        bus_errors = [f"bus data: {e}"]
    try:
        poi_errors = validate_pois(load_pois())
    except (ValidationError, FileNotFoundError) as e:
        poi_errors = [f"poi_osm.json: {e}"]
    return validate_resorts(resorts) + bus_errors + poi_errors


def main() -> int:
    errors = collect_errors()
    for error in errors:
        print(f"ERROR {error}", file=sys.stderr)
    print("data OK" if not errors else f"{len(errors)} error(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
