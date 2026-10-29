import httpx
import pytest
import respx

from hakuba_api.places.gmaps_link import (
    is_google_maps_url,
    parse_google_maps_url,
    resolve_short_link,
)

PLACE_URL = (
    "https://www.google.com/maps/place/Hakuba+Springs+Hotel/"
    "@36.6990,137.8410,17z/data=!3m1!4b1!4m9!3m8!1s0x0:0x0!8m2!3d36.6993011!4d137.8427522"
)


def test_recognises_google_maps_urls() -> None:
    assert is_google_maps_url(PLACE_URL)
    assert is_google_maps_url("https://maps.app.goo.gl/AbCdEf123")
    assert is_google_maps_url("https://maps.google.com/?q=36.7,137.8")
    assert not is_google_maps_url("Hotel Hakuba")
    assert not is_google_maps_url("https://example.com/maps/place/@36.7,137.8,17z")


def test_prefers_place_pin_over_viewport_centre() -> None:
    place = parse_google_maps_url(PLACE_URL)

    assert place is not None
    assert (place.coord.lat, place.coord.lng) == (36.6993011, 137.8427522)


def test_extracts_place_name_from_path() -> None:
    place = parse_google_maps_url(PLACE_URL)

    assert place is not None
    assert place.name == "Hakuba Springs Hotel"
    assert place.source == "gmaps-link"


def test_falls_back_to_viewport_centre() -> None:
    place = parse_google_maps_url("https://www.google.com/maps/@36.70123,137.85432,15z")

    assert place is not None
    assert (place.coord.lat, place.coord.lng) == (36.70123, 137.85432)
    assert place.name == "Dropped pin"


def test_reads_q_parameter_coordinates() -> None:
    place = parse_google_maps_url("https://maps.google.com/?q=36.7001,137.8602")

    assert place is not None
    assert (place.coord.lat, place.coord.lng) == (36.7001, 137.8602)


def test_url_without_coordinates_is_unparseable() -> None:
    assert parse_google_maps_url("https://www.google.com/maps/search/hotels") is None


@respx.mock
def test_short_link_follows_exactly_one_redirect() -> None:
    respx.head("https://maps.app.goo.gl/AbCdEf123").respond(302, headers={"Location": PLACE_URL})

    assert resolve_short_link("https://maps.app.goo.gl/AbCdEf123") == PLACE_URL


@respx.mock
def test_short_link_without_redirect_returns_none() -> None:
    respx.head("https://maps.app.goo.gl/AbCdEf123").respond(404)

    assert resolve_short_link("https://maps.app.goo.gl/AbCdEf123") is None


@respx.mock
def test_short_link_network_error_returns_none() -> None:
    respx.head("https://maps.app.goo.gl/AbCdEf123").mock(side_effect=httpx.ConnectError("x"))

    assert resolve_short_link("https://maps.app.goo.gl/AbCdEf123") is None


@pytest.mark.parametrize("url", ["https://evil.example/redirect", "http://localhost:8002/status"])
def test_only_google_short_link_hosts_are_ever_requested(url: str) -> None:
    with respx.mock(assert_all_mocked=True):  # any real request would raise
        assert resolve_short_link(url) is None
