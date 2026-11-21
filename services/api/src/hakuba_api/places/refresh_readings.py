"""Readings for Japanese lodging names, written to `data/lodging_readings.json`.

`kana.to_romaji` reads katakana, loanwords and a few place kanji, and drops every other
kanji, so 雪の荘 reads only "no" and "yukinoso" finds nothing (SPEC-place-search v1.5).
A morphological analyser (fugashi with the unidic-lite dictionary, both MIT) gives each
word's kana; a short override table fixes the readings it gets wrong in inn names (荘 is
"sou" there, not "shou"); `to_romaji` then romanises each word, so loanwords and long
vowels follow the same rules as the rest of the index.

Run it offline, like the Overture refresh; the analyser is not a project dependency:

    uv run --directory services/api --frozen --with fugashi --with unidic-lite \\
        python -m hakuba_api.places.refresh_readings
"""

import json
from collections.abc import Callable, Iterable, Sequence
from importlib import metadata

from hakuba_api.data.paths import data_dir
from hakuba_api.places.kana import to_romaji
from hakuba_api.places.lodging import load_lodging
from hakuba_api.places.lodging_extras import READINGS_FILE, LodgingReading, ReadingsFile
from hakuba_api.places.models import Place

# Kanji the dictionary reads one way and inn names another. Keep it short and tested:
# each entry changes every name that carries the kanji.
KANA_OVERRIDES = {
    "荘": "ソウ",  # 雪の荘: the inn suffix is "sou", the dictionary says "shou"
}

# (surface, kana or None) for each word, as the analyser splits the name
Morpheme = tuple[str, str | None]
Tagger = Callable[[str], Sequence[Morpheme]]


def japanese_name(p: Place) -> str | None:
    """The name to read: the Japanese one, or the name itself when it isn't ASCII."""
    return p.name_ja or (None if p.name.isascii() else p.name)


def word_kana(morphemes: Iterable[Morpheme]) -> list[str]:
    """Each word's kana, with the override table applied; a word with no kana keeps its text."""
    return [KANA_OVERRIDES.get(surface) or kana or surface for surface, kana in morphemes]


def read(morphemes: Sequence[Morpheme]) -> tuple[str, list[str]]:
    """The whole kana reading and its romaji forms: spaced by word, and joined when the
    name has several words, because people type an unspaced name both ways."""
    kana = word_kana(morphemes)
    words = [w for k in kana for w in to_romaji(k).split()]
    spaced = " ".join(words)
    forms = [spaced] if spaced else []
    joined = "".join(words)
    if joined and joined != spaced:
        forms.append(joined)
    return "".join(kana), forms


def build_readings(lodging: Iterable[Place], tagger: Tagger) -> list[LodgingReading]:
    out: list[LodgingReading] = []
    for p in lodging:
        name = japanese_name(p)
        if not name:
            continue
        kana, romaji = read(tagger(name))
        if romaji:
            out.append(LodgingReading(id=p.id, name=name, kana=kana, romaji=romaji))
    return sorted(out, key=lambda r: r.id)


def _fugashi_tagger() -> Tagger:  # pragma: no cover - needs the optional analyser
    import fugashi  # pyright: ignore

    tagger = fugashi.Tagger()  # pyright: ignore

    def tag(text: str) -> list[Morpheme]:
        return [(w.surface, w.feature.kana) for w in tagger(text)]  # pyright: ignore

    return tag


def _generator() -> str:  # pragma: no cover - needs the optional analyser
    versions = [f"{p} {metadata.version(p)}" for p in ("fugashi", "unidic-lite")]
    return " + ".join(versions)


def main() -> None:  # pragma: no cover - writes the data file
    readings = build_readings(load_lodging(), _fugashi_tagger())
    payload = ReadingsFile(generator=_generator(), readings=readings)
    path = data_dir() / READINGS_FILE
    path.write_text(
        json.dumps(payload.model_dump(by_alias=True), ensure_ascii=False, indent=1) + "\n"
    )
    print(f"wrote {len(readings)} readings to {path}")


if __name__ == "__main__":  # pragma: no cover
    main()
