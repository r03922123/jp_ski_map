from hakuba_api.common.models import ApiModel


class Example(ApiModel):
    resort_id: str
    drive_s: int


def test_serializes_snake_case_fields_as_camel_case() -> None:
    model = Example(resort_id="happo-one", drive_s=600)

    assert model.model_dump(by_alias=True) == {"resortId": "happo-one", "driveS": 600}


def test_accepts_camel_case_input() -> None:
    model = Example.model_validate({"resortId": "happo-one", "driveS": 600})

    assert model.resort_id == "happo-one"


def test_accepts_snake_case_input() -> None:
    model = Example.model_validate({"resort_id": "happo-one", "drive_s": 600})

    assert model.drive_s == 600
