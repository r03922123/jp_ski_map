"""DATA-LICENSES.md names every bus-stop coordinate source; its counts must match the data."""

import re
from pathlib import Path

import pytest

from hakuba_api.bus.store import load_stops

LICENSES = Path(__file__).resolve().parents[3] / "DATA-LICENSES.md"

# (coordSource prefix in data/bus_stops.json, the bold label of its bullet in DATA-LICENSES.md)
COUNTED = [
    ("operator My Maps pin", r"Google My Maps pins?"),
    ("overture:", r"Overture Maps Places points?"),
]

# The coordSource prefixes that DATA-LICENSES.md names, as covered or as a named exception
# (ADR-0004). A source outside this list, such as GSI's address search or ODPT, needs a licence
# decision before its rows can come in. Only OpenStreetMap snapshots pass as lodging-snapshot.
KNOWN_SOURCES = (
    "osm:",
    "photon:",
    "access-point:",
    "lodging-snapshot:osm:",
    "resort access point ",
    "overture:",
    "operator My Maps pin",
    "not located yet",
)


@pytest.mark.parametrize(("prefix", "label"), COUNTED)
def test_source_bullet_states_the_data_count(prefix: str, label: str) -> None:
    in_data = sum(1 for s in load_stops() if s.coord_source.startswith(prefix))

    stated = re.findall(rf"^- \*\*(\d+) {label}:\*\*", LICENSES.read_text(), flags=re.MULTILINE)

    assert stated == [str(in_data)], f"DATA-LICENSES.md says {stated}, data has {in_data}"


def test_every_stop_names_a_known_coordinate_source() -> None:
    unknown = [s.id for s in load_stops() if not s.coord_source.startswith(KNOWN_SOURCES)]

    assert unknown == [], f"DATA-LICENSES.md names no source for the coordSource of {unknown}"
