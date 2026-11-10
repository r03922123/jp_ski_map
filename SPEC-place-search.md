# Spec: place-search

> Module of [SPEC.md](SPEC.md). Depends on: — . Consumed by: web-app.

## Objective
Let the user find their hotel (or any place) in Hakuba and turn it into an origin coordinate, the way the Google Maps search box works.

## Coverage findings (2026-10-28 spot check, 10 well-known hotels)
- 4/10 found by English name in OSM/Photon (Hotel Hakuba, Mominoki, Sierra Resort, Penke Panke).
- 2/10 are in OSM **only under their Japanese name** (白馬東急ホテル, 白馬ハイランドホテル), so English search misses them.
- 4/10 are missing from OSM (Courtyard by Marriott, Hakuba Springs, Phoenix, Morino Lodge).
- Both public Overpass instances returned "at capacity" errors, so live Overpass is unreliable.

> **Superseded (2026-10-30)** by [v1.2](#v12--google-style-suggestions-approved-2026-10-30) (a local suggestion index) and [v1.3](#v13--paste-a-hotel-name-from-bookingcom-approved-2026-10-30) (the Overture Maps lodging snapshot) below. Kept for history; rejecting Google Places still holds.

**Decision (2026-10-28):** stay on OSM (free, no ToS conflict with MapLibre). There is **no curated lodging list**; hotels missing from OSM are reached by pasting a Google Maps link or dropping a pin. Google Places is rejected for v1: it needs billing and an API key, its terms require a Google base map, and it limits caching.

## Input paths
1. **Photon** (`https://photon.komoot.io/api/`) with the location bias set to Hakuba (36.70, 137.86). Results outside the Hakuba bounding box are ranked last.
2. **Pasted Google Maps link**: if the query looks like a Google Maps URL, extract the coordinates from `@lat,lng`, `!3d<lat>!4d<lng>` or `?q=lat,lng`, without calling any Google API. Short links (`maps.app.goo.gl`) are resolved with **one HEAD request to follow the redirect**, and the coordinates are then read from the final URL. The place name is read from the `/place/<name>/` path segment when present.
3. **Map click / long-press** sets a pin (handled in web-app; listed here for completeness).

## Lodging pins
- `data/lodging_osm.json`: a snapshot of Overpass lodging (`tourism~"hotel|guest_house|hostel|apartment|chalet"`, Hakuba bbox), refreshed with `python -m hakuba_api.places.refresh_lodging` (with retry/backoff, run manually or weekly). It is **never queried live at request time.**
- `GET /api/places/lodging?bbox=…` serves the snapshot.

## Interface
- `GET /api/places/search?q=<text>&limit=10` → `Place[]`
- `GET /api/places/lodging?bbox=<s,w,n,e>` → `Place[]`
```jsonc
{ "id": "osm:node/123456 | gmaps-link | pin",
  "name": "Hakuba Tokyu Hotel", "nameJa": "白馬東急ホテル",
  "kind": "hotel|guest_house|hostel|apartment|other",
  "coord": { "lat": 36.7, "lng": 137.85 }, "address": "…",
  "source": "photon|osm-snapshot|gmaps-link" }
```

## Acceptance Criteria
- [ ] The OSM-mapped spot-check hotels are found: the 4 English-named ones by English query, and 白馬東急ホテル / 白馬ハイランドホテル by Japanese query (top 3 results).
- [ ] The 4 spot-check hotels missing from OSM (Courtyard, Hakuba Springs, Phoenix, Morino) can all be set as the origin by pasting their Google Maps link.
- [ ] When a text search has no results, the UI suggests "Paste a Google Maps link or tap the map".
- [ ] Pasting a full Google Maps place URL gives coordinates within 50 m and the place name. Pasting a `maps.app.goo.gl` short link works (live test). URL parsing has unit tests for the 3 coordinate formats.
- [ ] The lodging snapshot has ≥ 20 POIs in the Happo/Echoland bbox. Snapshot refresh survives a 502 using backoff.
- [ ] Empty query → 422. Photon down → 502 `{error, source}`, while link-paste and pin keep working.
- [ ] Contract tests run against recorded fixtures, without network.

## Boundaries
- Always: send a descriptive `User-Agent`, debounce on the client (≥ 300 ms), and cache Photon for 24 h.
- Never: call any Google API, or scrape Google Maps pages. Link parsing reads only the URL the user pasted, plus at most one redirect hop for short links.
- Ask first: adding a keyed or paid geocoder, or a curated lodging list.

## Open Questions
- Contribute the missing hotels and `name:en` tags back to OpenStreetMap? This is optional and benefits everyone, but it's a manual job for the author.

## v1.2 — Google-style suggestions (approved 2026-10-30)
**Problem:** Photon alone misses hotels, knows no Japanese for most, returns far-away places, and is slow (~300 ms per keystroke). Google feels good because suggestions are instant, local, forgiving and ranked.

**Design: a local index first, Photon as fallback.**
- `places/index.py` builds, at startup, one in-memory index from data we already hold: bus stops (EN/JA + aliases), resorts and their base areas (EN/JA), the lodging snapshot (EN + JA, the refresh now keeps `name:ja`), and the POI snapshot (EN/JA, brand). ~350 entries; no network.
- Matching (pure, unit-tested): query and names are NFKC-normalised and case-folded; katakana is folded to hiragana so 「ホテル」 and 「ほてる」 match. Score: exact 100 › name-prefix 90 › token-prefix 80 › substring 70 › fuzzy (≤ 2 edits on a token, query ≥ 4 chars) 40–60. Tie-break by straight-line distance to `near` (the map centre), then kind (resort, stop, lodging, food, convenience).
- `GET /api/places/suggest?q=…&near=lat,lng&limit=8` → `Suggestion[]`: `Place` fields plus `nameJa`, `kind` extended with `resort | stop | food | convenience`, `detail` (e.g. "Bus stop · Line V", "Hotel", "Konbini · 7-Eleven"), `match: [start, end]` on `name` for highlighting, `source: "index" | "photon" | "gmaps-link"`.
- A Google Maps URL is still handled first (unchanged). Otherwise: local hits; if fewer than 3 and the query has ≥ 3 characters, Photon results (Hakuba-biased, outside-Hakuba dropped) are appended, de-duplicated against local hits by proximity (< 50 m). A Photon failure never fails the request.
- Web `SearchBox`: suggestions update per keystroke (150 ms debounce — local is cheap); each row shows an icon by kind (🏨 🚏 ⛷ 🍜 🏪 📍), the name with the matched part bold, and `detail`; Enter picks the top row; arrow keys move; an empty focused box shows up to 5 recent picks (`localStorage`, per-viewer convenience). The map centre is sent as `near`.

**Acceptance:**
- [ ] Index unit tests: "tokyu" → Hakuba Tokyu Hotel (stop + lodging) first; 「白馬東急」 → the same; "happo bus" → Happo Bus Terminal; "7-eleven" → konbini; "hakuba" ranks the nearest entries first for a given `near`; "hotl hakuba" (typo) still finds Hotel Hakuba.
- [ ] `/suggest` returns within 20 ms for local hits (no Photon call when ≥ 3 local hits — asserted with respx).
- [ ] Photon down → local results still returned, 200.
- [ ] Web: typing "tok" shows a bolded "Tok" in "Hakuba Tokyu Hotel"; Enter selects it; recents appear on focus; E2E: search "Tokyu" → origin set at the hotel, lodging pins visible (existing spec adapted).
- [ ] Mobile: dropdown fits 390 px with no horizontal scroll.

**Not doing:** Google Places (needs billing, Google basemap, caching limits); server-side query logging.

## v1.3 — Paste a hotel name from Booking.com (approved 2026-10-30)
**Problem (measured):** 29 hotel names as Booking.com lists them → only **10 (34%)** found as the top result; **6** came back as a *confidently wrong* hotel (Photon fallback), and pasted page titles / Booking URLs found nothing. Root causes: (1) coverage, since OSM knows 146 of Hakuba's ~730 stays; (2) matching, since every query word must match ("The Ridge Hotel **&** Apartments") and generic words ("Hotel", "Hakuba") count as much as distinctive ones; (3) no relevance check on Photon results; (4) English vs katakana-only names.

**Decisions:** Overture Maps Places as a second lodging snapshot (each record keeps its provider's licence, see `DATA-LICENSES.md`; ~870 Hakuba lodgings). Rakuten Travel was rejected: its terms (Art. 10(9)/(10), 8.4) forbid a shared stored copy and apps limited to specific people. No Google, no Booking.com scraping. A pasted Booking.com URL is parsed **as text only** (never fetched).

**Design**
1. **Query cleaning** (`places/query_clean.py`, pure): a hotel-site URL → the name words from its path (`booking.com/hotel/jp/hakuba-tokyu.en-gb.html` → "hakuba tokyu"; also Agoda, Expedia, Hotels.com, Trip.com. Rakuten Travel and Jalan URLs carry only a numeric id, so they can't be read); page-title noise is stripped ("– Updated 2026 Prices", "(Japan) Deals", "| Booking.com", "Hotel Reviews", trailing ", Hakuba").
2. **Scoring v2** (`places/index.py`): words are weighted. Generic words (hotel, hakuba, inn, lodge, chalet(s), apartments, resort, house, the, by, &, pension, onsen, japan…) count little; a name must match **every distinctive query word** (prefix or ≤ 2-edit fuzzy). Missing generic words cost a little instead of failing the match. The exact and prefix tiers are unchanged.
3. **Photon gate:** a Photon result is kept only if it shares at least one distinctive word with the query, so "Hotel 24sweets Hakuba" never returns Hakuba Mominoki Hotel.
4. **Overture lodging snapshot** (`places/refresh_overture.py`, run via `uv run --with duckdb`, not a project dependency): the Hakuba bbox of the latest release; taxonomy under `lodging` minus `ski_resort`; confidence ≥ 0.5; booking-feed room suffixes stripped ("Piremon - Economy Twin Room" → "Piremon"); English and Japanese names split from `names.primary` ("Courtyard by Marriott Hakuba - コートヤード…", "マリオンシナノ(Marion Shinano)"); `names.common` and `operating_status` are empty in this release. **De-duplicated** against OSM, then among themselves: ≤ 80 m and either equal names or one name's identifying words contained in the other's. Type words count, so "Phoenix Hotel" and "Phoenix Chalets" stay two places. OSM wins. Output `data/lodging_overture.json` + `.meta.json` (release, licence, counts); the validator checks ids, bbox and no OSM overlap. The map attribution adds "Overture Maps Foundation". *(Built 2026-10-30: release 2026-10-21.0, 886 rows → 755 lodgings.)*
5. **Kana ↔ English** (`places/kana.py`): Japanese lodging names get a romaji *reading*: loanwords become their English word (ホテル → hotel, ロッジ → lodge), common place kanji their names (白馬 → hakuba, 栂池 → tsugaike), the rest Hepburn (グレース → guresu); other kanji are dropped. Readings match by a consonant *sound key* (l→r, c→k/s, j→z, doubled letters folded, then vowels dropped), so "Grace" meets グレース and "Granjam" meets グランジャム. Sound matching applies **only to readings and only to distinctive words**, so "Ridge" can never sound-match "lodge".
6. **Lodging words decide the kind.** A query naming a type of lodging (`hotel`, `inn`, `lodge`, `pension`…; `LODGING_WORDS`) keeps lodging, and other places only if their name carries that same word in any script, or if a bus stop is named only for what the query names. "Hakuba Park Hotel" no longer answers with the "… Parking" bus stop, "Bloom Inn" still finds that stop, and "The Gakusui Hotel" keeps the "The Gakusui" stop. Photon's results follow the same rule.
7. **Chinese hotel words.** When nothing matches, 飯店, 饭店, 酒店 and 旅馆 are retried as ホテル ("東急飯店" → 白馬東急ホテル). It is only a fallback because 白馬飯店 is a real restaurant, and Photon keeps the original words if the retry finds nothing.

**Evaluation** (`tests/places/booking_eval.json` + `python -m hakuba_api.places.eval_search`): each Booking.com-style name with the expected coordinate (reviewed), or `absent`. Any result for an `absent` name counts as wrong.

**Acceptance**
- [x] Eval: top-1 correct for ≥ 85% of the names whose hotel is in our data; **0** confidently wrong lodging results (top-1 a different hotel) across the whole set. *Result on the offline index, 2026-11-09: 26/26 present, 4/4 absent empty, 0 wrong (baseline 10/25 and 6 wrong). The live-Photon run predates the stricter judge.*
- [x] Booking.com, Agoda and Expedia URLs and page titles resolve like the bare name (unit tests).
- [x] The v1.2 index tests still pass (tokyu, 白馬東急, happo bus, 7-eleven, near-ranking, typo).
- [x] Overture refresh is tested against a recorded fixture (no network in tests); the validator checks ids, bbox and dedupe; the attribution is shown.
- [x] `/suggest` stays < 20 ms for local hits with ~1,000 entries. *1,100 entries: median 9 ms, p95 13 ms (`normalize`/`sound_key` memoised).*

**Ranking fixes found in the post-build sweep** (everyday queries against the full 1,100-entry index):
- Sound keys need ≥ 3 consonants ("tokyu" and "tokiwa" both reduce to "tk"); a sound match scores just below a spelled one.
- A reading's score is capped at 85, below the exact and name-prefix tiers, because it approximates the name (乗鞍荘 reads "norikura").
- *Prominence:* a query with only area or generic words ("iwatake", "goryu", "hakuba") boosts resorts by 15, so the ski area leads, not the nearest lodge or stop.

**Not doing:** fetching Booking.com/Agoda pages (their terms; also no coordinates in the URL); Rakuten (terms); a paid geocoder.

## v1.4 — Semantic retrieval beside the lexical index (experiment, 2026-11-11)

**Why:** the lexical index scores 26/26 on `booking_eval.json`, so that set can only catch regressions. It cannot match what isn't spelled in a name: Chinese resort names (八方尾根滑雪場), food and shop categories (ramen, 拉麵, コンビニ), translated hotel names (白馬高地飯店). A multilingual embedding model can, but the look-alike guard below deliberately gives up translated hotel names: a hotel needs a shared distinctive word, so 白馬高地飯店 and 樅之木飯店 stay unmatched.

**Design**
- A separate local embedding server (`ml/search`, `python -m hakuba_search.server`) loads a sentence-embedding model (default `intfloat/multilingual-e5-small`, or a fine-tuned copy under `ml/search/models/`), embeds the same 1,100 index entries (`name | name_ja | aliases | detail`), and answers `GET /search?q=&k=` with `[{id, score}]` above a cosine threshold. ~1,100 vectors fit in one matrix, so search is an exact dot product (no vector database).
- The API calls it only when `HAKUBA_SEMANTIC_URL` is set, with a 300 ms timeout (httpx applies it per phase, so a slow server can hold a request a little longer); any error or timeout falls back to lexical results (logged). It skips the call when lexical already fills the page, and Photon still decides on the lexical count alone, since semantic food and shop hits carry no name check. Production stays unchanged until that variable is set.
- `suggest()` builds the page as lexical hits, then Photon (still only when fewer than 3 lexical hits), then semantic hits, and cuts to the limit once, so semantic hits never push a name-checked Photon hit off the page. A semantic lodging or bus-stop hit must share a distinctive word with the query, and a query of only area and generic words names no place (`names_a_place`), because a look-alike hotel is a confidently wrong answer.
- *Tried and dropped:* reciprocal rank fusion (RRF, k=60). It rewards items both lists rank high, which put Hakuba Grace Inn above the exact "Hotel Grace Hakuba" on `booking_eval.json` (26 → 25 hits). With only the kind filter, hybrid also turned all 4 absent hotels into wrong answers (4 → 0).
- Fine-tuning (`ml/search`): synthetic (query, entry) pairs generated from the index (typos, dropped words, romaji readings, Chinese/variant characters, cuisine and shop words), contrastive training with in-batch negatives (MultipleNegativesRankingLoss) on the Mac's GPU (MPS). Entries are split 80/20 so the synthetic dev set has names the model never trained on.
- Tracking: every eval run logs params and metrics to a local MLflow store (`ml/search/mlruns`, gitignored).

**Evaluation**
- `ml/search/evals/hard_queries.json`: 40 hand-written queries in 4 groups. `synth.make_pairs` drops any training or dev query equal to one of them (a test checks it): the first fine-tune had 13 of the 40 word for word in its training pairs. Metric: hit@1 and hit@5 per mode (lexical, semantic, hybrid) and model (base, fine-tuned).
- `booking_eval.json` stays the regression check: hybrid must keep 26/26 present and 4/4 absent empty.
- Latency: p50/p95 of `suggest()` per mode.

**Acceptance**
- [x] Hybrid beats lexical on the hard set at hit@5, with no regression on `booking_eval.json`. *Fine-tuned without any hard-set query in training, calibrated: 0.55 vs 0.15; booking 26/26 present, 4/4 absent empty, 0 wrong.*
- [x] The fine-tuned model is reported against the base model on the hard set and the synthetic dev set, whichever way it comes out. *See the results below.*
- [x] The API falls back to lexical when the server is down or slow (unit tests); API gates green. *Also seen live: `ReadTimeout` → lexical results.*

**Results (2026-11-11, hard set n=40, hit@5)**

| Setup | Threshold | Hard hit@5 | category | hotel | resort-en | resort-zh | booking hit / absent / wrong |
|---|---|---|---|---|---|---|---|
| Lexical only | – | 0.15 | 0.10 | 0.50 | 0.00 | 0.00 | 26 / 4 / 0 |
| Base e5-small, hybrid | 0.84 (guessed) | 0.65 | 0.75 | 0.625 | 0.20 | 0.714 | 26 / 4 / 0 |
| Base e5-small, hybrid | 0.9127 (calibrated) | 0.15 | 0.10 | 0.50 | 0.00 | 0.00 | 26 / 4 / 0 |
| Fine-tuned, 13/40 hard queries leaked into training (first run) | 0.5366 (calibrated) | 0.475 | 0.35 | 0.50 | 0.60 | 0.714 | 26 / 4 / 0 |
| Fine-tuned, hard queries excluded | 0.5387 (calibrated) | **0.55** | 0.45 | 0.625 | 0.60 | 0.714 | 26 / 4 / 0 |
| (same, semantic only) | 0.5387 | 0.60 | 0.45 | 0.75 | 0.80 | 0.714 | – |

- Synthetic dev split (unseen entries, whole index as distractors): recall@1 0.717 → 0.860, MRR@10 0.765 → 0.895 after one epoch (3,604 pairs, ~4 min on MPS, train loss 0.430). The first run, with the leak, gave 0.714 → 0.851.
- Removing the 13 exact copies did not lower the hard-set score (0.475 → 0.55, a 3-query difference, within noise for n=40), so those exact strings didn't carry the gain. 9 of the 40 still have near-duplicates in training (the query plus an area word, e.g. `curry hakuba`, `tsugaike kogen lodge`), so some of the gain may still be overlap.
- Calibrated on dev, the base model keeps almost nothing (its top-1 is rarely 90% right), so the 0.65 row relied on an untested threshold. Fine-tuning made the model usable at a calibrated threshold, and lifted English resort names, but scored lower on food and shop categories than the guessed-threshold base model (0.75 → 0.45): 82% of the training pairs are lodging names.
- The eval patches `semantic_ids` in process, so its hit and latency numbers skip the HTTP hop and the 300 ms timeout; live, a loaded Mac falls back to lexical more often (seen: two `ReadTimeout`s on a cold server).
- Latency on the loaded Mac (load average 25–40): embedding server 30–56 ms warm; `suggest()` hybrid p50 49 ms, p95 81 ms, against lexical p50 33 ms, p95 78 ms.
- **Next:** rebalance the synthetic pairs by kind and judge it on a *new* held-out query set, since this hard set has now been seen. Semantic search stays off in production until then.

**Boundaries:** local models only ($0); the model and MLflow files are never committed; the app logger and the embedding server (access log off) never log query text. The production API's uvicorn access log already records `/api/places/suggest?q=…`, as before this change.
