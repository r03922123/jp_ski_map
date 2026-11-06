import json
from pathlib import Path

import pytest

from hakuba_api.common.geo import Coord
from hakuba_api.main import app
from hakuba_api.places.models import Place
from hakuba_api.places.refresh_overture import (
    KNOWN_LICENSES,
    NOTICES,
    OvertureRow,
    OvertureSource,
    build_meta,
    dedupe_against,
    latest_release,
    rows_to_places,
    split_names,
    strip_room_type,
)

REPO = Path(__file__).resolve().parents[4]
FIXTURES = Path(__file__).parents[1] / "fixtures" / "overture"
ROWS: list[OvertureRow] = json.loads((FIXTURES / "rows.json").read_text())


@pytest.mark.parametrize(
    ("primary", "en", "ja"),
    [
        (
            "Courtyard by Marriott Hakuba - コートヤード･バイ･マリオット 白馬",
            "Courtyard by Marriott Hakuba",
            "コートヤード･バイ･マリオット 白馬",
        ),
        ("マリオンシナノ(Marion Shinano)", "Marion Shinano", "マリオンシナノ"),
        ("Hotel Wohnen ホテル・ボーネン", "Hotel Wohnen", "ホテル・ボーネン"),
        ("グランジャム栂池", None, "グランジャム栂池"),
        ("Hakuba Canadian Lodge", "Hakuba Canadian Lodge", None),
        ("SANU 2nd Home 白馬 1st", "SANU 2nd Home 白馬 1st", None),  # not two clean halves
    ],
)
def test_split_names(primary: str, en: str | None, ja: str | None) -> None:
    assert split_names(primary) == (en, ja)


@pytest.mark.parametrize(
    ("name", "clean"),
    [
        ("Piremon - Economy Twin Room", "Piremon"),
        ("Wadano Grove by Jade Group - Three-Bedroom Villa", "Wadano Grove by Jade Group"),
        ("Alps Aunty Cottage - Family Cottage, 3 Bedrooms", "Alps Aunty Cottage"),
        ("Le Bocage - Hakuba Echoland Chalets", "Le Bocage - Hakuba Echoland Chalets"),
    ],
)
def test_strip_room_type(name: str, clean: str) -> None:
    assert strip_room_type(name) == clean


def test_rows_become_lodging_places_with_both_names() -> None:
    places = {p.name: p for p in rows_to_places(ROWS, min_confidence=0.5)}
    courtyard = places["Courtyard by Marriott Hakuba"]
    assert courtyard.name_ja == "コートヤード･バイ･マリオット 白馬"
    assert courtyard.kind == "hotel"
    assert courtyard.source == "overture-snapshot"
    assert courtyard.id.startswith("overture:")
    assert places["グランジャム栂池"].name_ja == "グランジャム栂池"
    assert places["Marion Shinano"].kind == "hostel"
    assert places["Hakuba Canadian Lodge"].kind == "guest_house"
    assert "Piremon" not in places  # confidence 0.18
    assert "SANU 2nd Home 白馬 1st" not in places  # confidence 0.20


def test_places_osm_already_has_are_dropped() -> None:
    osm = [
        Place(
            id="osm:way/1",
            name="Hotel Green Plaza Hakuba",
            name_ja="ホテルグリーンプラザ白馬",
            kind="hotel",
            coord=Coord(lat=36.77547, lng=137.88754),
            address=None,
            source="osm-snapshot",
        )
    ]
    kept = {p.name for p in dedupe_against(rows_to_places(ROWS, 0.5), osm)}
    assert "Hotel Green Plaza Hakuba" not in kept
    assert "Hakuba Canadian Lodge" in kept


def test_latest_release_from_the_bucket_listing() -> None:
    xml = (
        "<ListBucketResult><CommonPrefixes><Prefix>release/2026-09-23.0/</Prefix>"
        "</CommonPrefixes><CommonPrefixes><Prefix>release/2026-10-21.0/</Prefix>"
        "</CommonPrefixes><CommonPrefixes><Prefix>release/2026-09-23.1/</Prefix>"
        "</CommonPrefixes></ListBucketResult>"
    )
    assert latest_release(xml) == "2026-10-21.0"


def test_neighbours_of_one_brand_are_different_places() -> None:
    def place(name: str, lat: float, source: str = "overture-snapshot") -> Place:
        return Place(
            id=f"x:{name}",
            name=name,
            kind="hotel",
            coord=Coord(lat=lat, lng=137.8406),
            address=None,
            source=source,  # type: ignore[arg-type]
        )

    # 40 m apart, both "Phoenix", but a hotel and chalets: keep both
    kept = dedupe_against(
        [place("Phoenix Chalets by HHG", 36.7054), place("Phoenix Hotel", 36.7058)], []
    )
    assert {p.name for p in kept} == {"Phoenix Chalets by HHG", "Phoenix Hotel"}
    # a typo'd OSM name with an extra word is still the same place
    osm = [place("Rosort Inn Marion Shinano", 36.75022, "osm-snapshot")]
    assert dedupe_against([place("Marion Shinano", 36.75013)], osm) == []


# Live iPhone QA (2026-11-02): "Hakuba Tokyu Hotel" showed as "Guest House": Overture's
# category said lodge. A place whose own name says hotel is a hotel.
@pytest.mark.parametrize(
    ("name", "tax", "kind"),
    [
        ("Hakuba Tokyu Hotel", "lodge", "hotel"),
        ("白馬東急ホテル", "lodge", "hotel"),
        ("Hakuba Luna Hotel", "bed_and_breakfast", "hotel"),
        ("Hakuba Canadian Lodge", "lodge", "guest_house"),  # the name agrees: unchanged
        ("Hotel-ish Hostel", "hostel", "hostel"),  # a hostel stays a hostel
        # a "hotel pension" (ホテルペンション) is a small family-run guest house in Japan
        ("ホテルペンション アルピーヌ", "lodge", "guest_house"),
        ("Hotel Pension Alpine", "lodge", "guest_house"),
    ],
)
def test_a_name_that_says_hotel_beats_a_guest_house_category(
    name: str, tax: str, kind: str
) -> None:
    row = OvertureRow(id="x", name=name, tax=tax, conf=0.9, lat=36.7, lng=137.84, addr=None)
    assert rows_to_places([row], min_confidence=0.5)[0].kind == kind


# Each Places record names its providers in `sources`, each with its licence
# (docs.overturemaps.org/attribution); every record also has Overture's own: its confidence.
type Source = tuple[str, str | None]  # (dataset, licence)
META = ("meta", "CDLA-Permissive-2.0")
MICROSOFT = ("Microsoft", "CDLA-Permissive-2.0")
FOURSQUARE = ("Foursquare", "Apache-2.0")
ALLTHEPLACES = ("AllThePlaces", "CC0-1.0")
OVERTURE = ("Overture", "CDLA-Permissive-2.0")
CDLA = {
    "license": "CDLA-Permissive-2.0",
    "licenseUrl": "https://cdla.dev/permissive-2-0/",
    "licenseText": "LICENSES/CDLA-Permissive-2.0.txt",
}
FOURSQUARE_ENTRY = {
    "dataset": "Foursquare",
    "license": "Apache-2.0",
    "licenseUrl": "https://www.apache.org/licenses/LICENSE-2.0",
    "licenseText": "LICENSES/Apache-2.0.txt",
    "notice": "LICENSES/Foursquare-NOTICE.txt",
    "places": 1,
}


def _row(gid: str, *sources: Source, conf: float = 0.9) -> OvertureRow:
    src = [OvertureSource(dataset=d, license=lic) for d, lic in sources]
    return OvertureRow(
        id=gid, name=gid, tax="hotel", conf=conf, lat=36.7, lng=137.8, addr=None, sources=src
    )


def _meta(*rows: OvertureRow) -> dict[str, object]:
    return build_meta("2026-10-21.0", "2026-11-06T00:00:00+00:00", [*rows], rows_to_places([*rows]))


def test_the_meta_lists_each_dataset_of_the_kept_places_with_its_licence() -> None:
    meta = _meta(
        _row("a", META, OVERTURE),
        _row("b", FOURSQUARE, OVERTURE),
        _row("c", MICROSOFT, OVERTURE),
        _row("d", ALLTHEPLACES, OVERTURE, conf=0.2),  # dropped, so its licence isn't listed
    )
    assert meta["licenses"] == [
        FOURSQUARE_ENTRY,
        {"dataset": "meta", **CDLA, "places": 1},
        {"dataset": "Microsoft", **CDLA, "places": 1},
        {"dataset": "Overture", **CDLA, "places": 3},
    ]
    assert (meta["release"], meta["rows"], meta["places"]) == ("2026-10-21.0", 4, 3)


def test_a_foursquare_record_brings_apache_2_and_foursquares_notice() -> None:
    meta = _meta(_row("a", FOURSQUARE))
    assert (meta["licenses"], meta["license"]) == ([FOURSQUARE_ENTRY], "Apache-2.0")
    assert meta["attribution"] == (
        "Overture Maps Foundation (Apache-2.0: Foursquare); © Foursquare Labs, Inc."
    )


# The label used to be one fixed string, "CDLA-Permissive-2.0", whatever the records said
@pytest.mark.parametrize(
    ("sources", "label"),
    [
        ([META, OVERTURE], "CDLA-Permissive-2.0"),
        ([ALLTHEPLACES], "CC0-1.0"),
        ([FOURSQUARE, OVERTURE], "Apache-2.0 AND CDLA-Permissive-2.0"),
    ],
)
def test_the_label_is_built_from_the_records_sources(sources: list[Source], label: str) -> None:
    meta = _meta(_row("a", *sources))
    assert meta["license"] == label
    assert all(lic in str(meta["attribution"]) for lic in label.split(" AND "))


@pytest.mark.parametrize("sources", [(OVERTURE, ("meta", None)), (OVERTURE, ("X", "ODbL-1.0")), ()])
def test_an_unknown_or_missing_licence_stops_the_refresh(sources: tuple[Source, ...]) -> None:
    with pytest.raises(ValueError, match="overture:a"):
        _meta(_row("a", *sources))


def test_the_licence_files_exist_and_the_api_docs_link_them() -> None:
    committed = json.loads((REPO / "data" / "lodging_overture.meta.json").read_text())
    files = {t for _, t in KNOWN_LICENSES.values() if t} | {n for n, _ in NOTICES.values()}
    for entry in committed["licenses"]:
        assert entry["license"] in KNOWN_LICENSES
        files |= {entry[k] for k in ("licenseText", "notice") if k in entry}
    assert sorted(f for f in files if not (REPO / f).is_file()) == []
    assert sorted(f for f in files if f not in (app.description or "")) == []
