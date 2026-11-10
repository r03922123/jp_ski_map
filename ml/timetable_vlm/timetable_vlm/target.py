"""What the model is asked to produce: the part of a Timetable a poster table shows."""

from hakuba_api.bus.models import Timetable


def to_target(t: Timetable) -> dict:
    # Fare, dates and boarding rules stay with the human reviewer; the draft covers stops and times.
    return {
        "directions": [
            {
                "id": d.id,
                "stops": list(d.stops),
                "trips": [{"n": tr.n, "times": list(tr.times)} for tr in d.trips],
            }
            for d in t.directions
        ]
    }


def prompt_for(t: Timetable) -> str:
    ids = ", ".join(d.id for d in t.directions)
    return (
        f"Transcribe the bus timetable for route {t.route_id.upper()} in this image as JSON. "
        f"Directions in order: {ids}. "
        'Shape: {"directions":[{"id":str,"stops":[English stop name as printed],'
        '"trips":[{"n":trip number,"times":["HH:MM" per stop, or null for —]}]}]}. '
        "Use 24-hour HH:MM with two-digit hours. Output only the JSON."
    )
