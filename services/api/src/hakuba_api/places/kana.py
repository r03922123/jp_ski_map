"""Romaji readings for Japanese names, and a sound key to match them with English.

Many Hakuba lodgings are listed only in Japanese (ホテルグレース白馬), while booking sites
name them in English ("Hotel Grace Hakuba"). A reading turns common loanwords into the
English word (ホテル → hotel), common place kanji into their names (白馬 → hakuba) and the
rest of the katakana/hiragana into Hepburn romaji (グレース → guresu); the sound key
then lets "grace" meet "guresu". Other kanji are dropped. See SPEC-place-search v1.3.
"""

import re
import unicodedata
from functools import lru_cache

# Kanji that show up in lodging names, by their usual reading.
PLACE_KANJI = {
    "白馬": "hakuba",
    "栂池": "tsugaike",
    "八方": "happo",
    "和田野": "wadano",
    "五竜": "goryu",
    "岩岳": "iwatake",
    "小谷": "otari",
    "大町": "omachi",
    "乗鞍": "norikura",
    "神城": "kamishiro",
    "温泉": "onsen",
    "高原": "kogen",
    "山荘": "sanso",
    "旅館": "ryokan",
    "民宿": "minshuku",
}

# Katakana loanwords → the English word a booking site would print.
LOANWORDS = {
    "アパートメント": "apartments",
    "ゲストハウス": "guesthouse",
    "ペンション": "pension",
    "レストラン": "restaurant",
    "リゾート": "resort",
    "コテージ": "cottage",
    "ホステル": "hostel",
    "シャレー": "chalet",
    "ヒュッテ": "hutte",
    "パーク": "park",
    "ホテル": "hotel",
    "ロッジ": "lodge",
    "ロッヂ": "lodge",  # older spelling
    "ハウス": "house",
    "ヴィラ": "villa",
    "ビラ": "villa",
    "スキー": "ski",
}

_DIGRAPHS = {
    "キャ": "kya", "キュ": "kyu", "キョ": "kyo", "シャ": "sha", "シュ": "shu", "ショ": "sho",
    "チャ": "cha", "チュ": "chu", "チョ": "cho", "ニャ": "nya", "ニュ": "nyu", "ニョ": "nyo",
    "ヒャ": "hya", "ヒュ": "hyu", "ヒョ": "hyo", "ミャ": "mya", "ミュ": "myu", "ミョ": "myo",
    "リャ": "rya", "リュ": "ryu", "リョ": "ryo", "ギャ": "gya", "ギュ": "gyu", "ギョ": "gyo",
    "ジャ": "ja", "ジュ": "ju", "ジョ": "jo", "ビャ": "bya", "ビュ": "byu", "ビョ": "byo",
    "ピャ": "pya", "ピュ": "pyu", "ピョ": "pyo",
    # loanword sounds
    "ファ": "fa", "フィ": "fi", "フェ": "fe", "フォ": "fo", "ティ": "ti", "ディ": "di",
    "トゥ": "tu", "ドゥ": "du", "ウィ": "wi", "ウェ": "we", "ウォ": "wo", "ヴァ": "va",
    "ヴィ": "vi", "ヴェ": "ve", "ヴォ": "vo", "チェ": "che", "シェ": "she", "ジェ": "je",
}  # fmt: skip

_MONO = dict(
    zip(
        "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン"
        "ガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポヴァィゥェォャュョ",
        [
            "a",
            "i",
            "u",
            "e",
            "o",
            "ka",
            "ki",
            "ku",
            "ke",
            "ko",
            "sa",
            "shi",
            "su",
            "se",
            "so",
            "ta",
            "chi",
            "tsu",
            "te",
            "to",
            "na",
            "ni",
            "nu",
            "ne",
            "no",
            "ha",
            "hi",
            "fu",
            "he",
            "ho",
            "ma",
            "mi",
            "mu",
            "me",
            "mo",
            "ya",
            "yu",
            "yo",
            "ra",
            "ri",
            "ru",
            "re",
            "ro",
            "wa",
            "o",
            "n",
            "ga",
            "gi",
            "gu",
            "ge",
            "go",
            "za",
            "ji",
            "zu",
            "ze",
            "zo",
            "da",
            "ji",
            "zu",
            "de",
            "do",
            "ba",
            "bi",
            "bu",
            "be",
            "bo",
            "pa",
            "pi",
            "pu",
            "pe",
            "po",
            "vu",
            "a",
            "i",
            "u",
            "e",
            "o",
            "ya",
            "yu",
            "yo",
        ],
        strict=True,
    )
)
_KANA_RUN = re.compile(r"[ァ-ヴー]+")


def _katakana(text: str) -> str:
    return "".join(chr(ord(c) + 0x60) if "ぁ" <= c <= "ゖ" else c for c in text)


def _romanize(run: str) -> str:
    out: list[str] = []
    i = 0
    geminate = False
    while i < len(run):
        pair, ch = run[i : i + 2], run[i]
        if ch == "ッ":
            geminate = True
            i += 1
            continue
        if ch == "ー":  # long vowel: folded away
            i += 1
            continue
        syllable = _DIGRAPHS.get(pair)
        step = 2 if syllable else 1
        syllable = syllable or _MONO.get(ch, "")
        if geminate and syllable:
            syllable = ("t" if syllable.startswith("ch") else syllable[0]) + syllable
            geminate = False
        out.append(syllable)
        i += step
    text = "".join(out)
    for long, short in (("ou", "o"), ("oo", "o"), ("uu", "u")):
        text = text.replace(long, short)
    return text


def _kana_words(run: str) -> list[str]:
    """One katakana run → words, loanwords replaced by their English."""
    for jp, en in LOANWORDS.items():
        run = run.replace(jp, f" {en} ")
    if run.endswith("イン") and len(run) > 2:  # "パルズイン" → "paruzu inn"
        run = run[:-2] + " inn "
    words: list[str] = []
    for part in run.split():
        if part.isascii():
            words.append(part)
        else:
            words.append(_romanize(part))
    return [w for w in words if w]


def to_romaji(name: str) -> str:
    """A Latin reading of a Japanese name; "" when nothing in it can be read."""
    text = _katakana(unicodedata.normalize("NFKC", name))
    for kanji, reading in PLACE_KANJI.items():
        text = text.replace(kanji, f" {reading} ")
    words: list[str] = []
    pos = 0
    for m in _KANA_RUN.finditer(text):
        words += re.findall(r"[a-z]+", text[pos : m.start()].lower())
        words += _kana_words(m.group())
        pos = m.end()
    words += re.findall(r"[a-z]+", text[pos:].lower())
    return " ".join(words)


_SOUND_RULES = [
    ("ph", "f"), ("th", "s"), ("ck", "k"), ("qu", "kw"), ("x", "ks"), ("dg", "j"),
    ("tch", "ch"), ("sh", "s"), ("ch", "t"), ("ts", "t"), ("j", "z"),
]  # fmt: skip


@lru_cache(maxsize=16_384)
def sound_key(word: str) -> str:
    """Consonant skeleton that English spellings and katakana readings share."""
    w = "".join(
        c for c in unicodedata.normalize("NFKD", word.lower()) if not unicodedata.combining(c)
    )
    for a, b in _SOUND_RULES:
        w = w.replace(a, b)
    w = re.sub(r"c(?=[eiy])", "s", w).replace("c", "k").replace("l", "r").replace("v", "b")
    # fold doubled letters (ッ "rojji", English "ll") before vowels go, so "gurorias"
    # keeps both r's and doesn't collapse into "grace"
    w = re.sub(r"(.)\1+", r"\1", w)
    # an h before a vowel is sounded in both spellings (ハ "ha", "hotel"), so it stays:
    # without it Maruhachi and Marriott share "mrt"
    return re.sub(r"h(?![aeiouy])|[waeiouy]", "", w)
