"""Every stop's coordinate source has a licence decision; DATA-LICENSES.md counts match the data."""

import json
import re
from pathlib import Path
from typing import Any

import pytest

from hakuba_api.bus.store import load_stops
from hakuba_api.data.paths import data_dir

LICENSES = Path(__file__).resolve().parents[3] / "DATA-LICENSES.md"

# (coordSource prefix in data/bus_stops.json, the bold label of its bullet in DATA-LICENSES.md)
COUNTED = [
    ("operator My Maps pin", r"Google My Maps pins?"),
    ("overture:", r"Overture Maps Places points?"),
]

NOT_LOCATED = "not located yet"

# The coordSource prefixes that have a licence decision, as covered or as a named exception
# (ADR-0004). The list is typed here, not read from DATA-LICENSES.md, so a new prefix also needs
# an ADR and its own DATA-LICENSES.md bullet (and a COUNTED row if the bullet gives a count).
# A source outside this list, such as GSI's address search or ODPT, needs that decision before
# its rows can come in. Only OpenStreetMap snapshots pass as lodging-snapshot.
KNOWN_SOURCES = (
    "osm:",
    "photon:",
    "access-point:",
    "lodging-snapshot:osm:",
    "resort access point ",
    "overture:",
    "operator My Maps pin",
    NOT_LOCATED,
)


@pytest.mark.parametrize(("prefix", "label"), COUNTED)
def test_source_bullet_states_the_data_count(prefix: str, label: str) -> None:
    in_data = sum(1 for s in load_stops() if s.coord_source.startswith(prefix))
    evidence: dict[str, Any] = json.loads((data_dir() / "bus" / "stop_evidence.json").read_text())
    in_evidence = sum(1 for e in evidence["stops"].values() if e["osm"]["ref"].startswith(prefix))

    stated = re.findall(rf"^- \*\*(\d+) {label}:\*\*", LICENSES.read_text(), flags=re.MULTILINE)

    assert stated == [str(in_data)], f"DATA-LICENSES.md says {stated}, data has {in_data}"
    assert in_evidence == in_data, f"stop_evidence.json has {in_evidence}, bus_stops.json {in_data}"


def test_every_stop_names_a_known_coordinate_source() -> None:
    unknown = [s.id for s in load_stops() if not s.coord_source.startswith(KNOWN_SOURCES)]

    assert unknown == [], f"no licence decision (KNOWN_SOURCES) covers the coordSource of {unknown}"


def test_a_stop_not_located_yet_has_no_coordinate() -> None:
    located = [s.id for s in load_stops() if s.coord_source.startswith(NOT_LOCATED) and s.coord]

    assert located == [], f"these stops say '{NOT_LOCATED}' but carry a coordinate: {located}"
