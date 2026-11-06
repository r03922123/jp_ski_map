"""DATA-LICENSES.md names the bus stops ODbL doesn't cover; its counts must match the data."""

import re
from pathlib import Path

import pytest

from hakuba_api.bus.store import load_stops

LICENSES = Path(__file__).resolve().parents[3] / "DATA-LICENSES.md"

# (coordSource prefix in data/bus_stops.json, the bold label of its bullet in DATA-LICENSES.md)
EXCEPTIONS = [
    ("operator My Maps pin", r"Google My Maps pins?"),
    ("gsi:", r"GSI-geocoded stops?"),
]


@pytest.mark.parametrize(("prefix", "label"), EXCEPTIONS)
def test_exception_bullet_states_the_data_count(prefix: str, label: str) -> None:
    in_data = sum(1 for s in load_stops() if s.coord_source.startswith(prefix))

    stated = re.findall(rf"^- \*\*(\d+) {label}:\*\*", LICENSES.read_text(), flags=re.MULTILINE)

    assert stated == [str(in_data)], f"DATA-LICENSES.md says {stated}, data has {in_data}"
