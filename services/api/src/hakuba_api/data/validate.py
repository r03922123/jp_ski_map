"""Validate every data file: `python -m hakuba_api.data.validate` (exit 1 on errors)."""

import sys

from pydantic import ValidationError

from hakuba_api.bus.validate import validate_repository as validate_bus_data
from hakuba_api.catalog.store import load_resorts
from hakuba_api.catalog.validate import validate_resorts
from hakuba_api.places.lodging import load_lodging, load_osm_lodging, load_overture_lodging
from hakuba_api.places.lodging_extras import load_aliases_file, load_readings_file
from hakuba_api.places.validate import validate_extras, validate_lodging
from hakuba_api.pois.store import load_google_ids, load_osm_pois
from hakuba_api.pois.validate import validate_google_ids, validate_pois
from hakuba_api.skiruns.store import load_ski_lines
from hakuba_api.skiruns.validate import validate_ski_lines


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
        pois = load_osm_pois()
        poi_errors = validate_pois(pois)
    except (ValidationError, FileNotFoundError) as e:
        pois, poi_errors = [], [f"poi_osm.json: {e}"]
    try:
        poi_errors += validate_google_ids(pois, load_google_ids())
    except (ValidationError, FileNotFoundError) as e:
        poi_errors.append(f"poi_google.json: {e}")
    try:
        lodging_errors = validate_lodging(load_osm_lodging(), load_overture_lodging())
    except ValidationError as e:
        lodging_errors = [f"lodging snapshots: {e}"]
    try:
        lodging_errors += validate_extras(load_lodging(), load_readings_file(), load_aliases_file())
    except ValidationError as e:
        lodging_errors.append(f"lodging readings/aliases: {e}")
    try:
        ski_errors = validate_ski_lines(load_ski_lines(), [r.id for r in resorts])
    except (ValidationError, FileNotFoundError) as e:
        ski_errors = [f"ski_lines.json: {e}"]
    errors = validate_resorts(resorts) + bus_errors + poi_errors + lodging_errors
    return errors + ski_errors


def main() -> int:
    errors = collect_errors()
    for error in errors:
        print(f"ERROR {error}", file=sys.stderr)
    print("data OK" if not errors else f"{len(errors)} error(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
