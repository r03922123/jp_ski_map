import pytest

from hakuba_api.places.query_clean import clean_query


@pytest.mark.parametrize(
    ("raw", "clean"),
    [
        # hotel-site URLs: the name words from the path, never fetched
        ("https://www.booking.com/hotel/jp/hakuba-tokyu.html", "hakuba tokyu"),
        (
            "https://www.booking.com/hotel/jp/the-ridge-hakuba.en-gb.html?aid=1&checkin=2027-01-02",
            "the ridge hakuba",
        ),
        (
            "https://www.agoda.com/hakuba-mominoki-hotel/hotel/nagano-jp.html?cid=1",
            "hakuba mominoki hotel",
        ),
        (
            "https://www.expedia.com/Hakuba-Hotels-Hakuba-Highland-Hotel.h1234567.Hotel-Information",
            "hakuba highland hotel",
        ),
        ("https://jp.hotels.com/ho554176/hakuba-tokyu-hotel-hakuba-japan/", "hakuba tokyu hotel"),
        (
            "https://www.trip.com/hotels/hakuba-hotel-detail-998877/hotel-green-plaza-hakuba/",
            "hotel green plaza hakuba",
        ),
        # page titles copied from a tab
        ("Hakuba Tokyu Hotel, Hakuba (Japan) Deals", "Hakuba Tokyu Hotel"),
        (
            "Hakuba Highland Hotel, Hakuba: Hotel Reviews & Prices | Expedia",
            "Hakuba Highland Hotel",
        ),
        ("Phoenix Hotel, Hakuba – Updated 2026 Prices", "Phoenix Hotel"),
        (
            "THE RIDGE HOTEL & APARTMENTS - Updated 2026 Prices & Hotel Reviews"
            " (Hakuba-mura, Japan)",
            "THE RIDGE HOTEL & APARTMENTS",
        ),
        ("Hakuba Mominoki Hotel | Booking.com", "Hakuba Mominoki Hotel"),
        # left alone: real names with dashes or commas, and ordinary searches
        ("Le Bocage - Hakuba Echoland Chalets", "Le Bocage - Hakuba Echoland Chalets"),
        ("Happo bus terminal", "Happo bus terminal"),
        ("白馬東急ホテル", "白馬東急ホテル"),
        ("  Hotel   Hakuba  ", "Hotel Hakuba"),
    ],
)
def test_clean_query(raw: str, clean: str) -> None:
    assert clean_query(raw) == clean


def test_google_maps_links_pass_through_untouched() -> None:
    link = "https://www.google.com/maps/place/Phoenix+Hotel/@36.70,137.84,17z"
    assert clean_query(link) == link
