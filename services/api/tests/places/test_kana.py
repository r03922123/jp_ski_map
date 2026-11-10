import pytest

from hakuba_api.places.kana import sound_key, to_romaji


@pytest.mark.parametrize(
    ("ja", "romaji"),
    [
        ("ホテルグレース白馬", "hotel guresu hakuba"),
        ("グランジャム栂池", "guranjamu tsugaike"),
        ("カナディアンロッジ", "kanadian lodge"),
        ("トロイメライ", "toroimerai"),
        ("白馬メルヘンハウス", "hakuba meruhen house"),
        ("パルズイン雷鳥", "paruzu inn"),  # 雷鳥 isn't in the place-kanji table: dropped
        ("ほてるしろうま", "hotel shiroma"),  # hiragana too; long vowels folded
        ("ペンション・ミーティア", "pension mitia"),
        ("ロッヂ幸", "lodge"),  # the older spelling of ロッジ
        ("白馬パークホテル", "hakuba park hotel"),
    ],
)
def test_to_romaji(ja: str, romaji: str) -> None:
    assert to_romaji(ja) == romaji


@pytest.mark.parametrize(
    ("english", "reading"),
    [
        ("grace", "guresu"),
        ("granjam", "guranjamu"),
        ("traumerei", "toroimerai"),
        ("raicho", "raicho"),
        ("hotel", "hoteru"),  # an h before a vowel stays on both sides
        ("white", "howaito"),
        ("hilton", "hiruton"),
    ],
)
def test_english_and_its_katakana_reading_sound_alike(english: str, reading: str) -> None:
    assert sound_key(english) == sound_key(reading)


def test_different_words_sound_different() -> None:
    assert sound_key("ridge") != sound_key("grace")
    assert sound_key("grace") != sound_key("gurorias")  # 白馬グローリアス
    assert sound_key("phoenix") != sound_key("pension")
    assert sound_key("maruhachi") != sound_key("marriott")  # 丸八 is not マリオット
