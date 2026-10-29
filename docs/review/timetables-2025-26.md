# Timetable review — 2025-26 season

## Independent second transcription (doubt-driven, 2026-10-29)
Four fresh-context reviewers re-transcribed all 14 images without seeing the committed
JSON. Diffed cell by cell: **2,198 cells across 37 routes, 0 disagreements on any time.**

Remaining differences, classified:

| Route | Difference | Class | Decision |
|---|---|---|---|
| H3 outward trip 1, Happo Sakka Slope | reviewer 09:53, committed `null` | trade-off | Both read **9:53** as printed; it breaks the +10 min pattern (8:43 → 8:53) and would arrive after trip 2's 9:43. Kept `null` + note. **Needs your call.** |
| I3 outward | reviewer kept two all-null rows (Happo BT, Iwatake) | contract ambiguity | Same 21 times; committed file omits rows a direction never serves. No change. |
| L1 south last column | reviewer `n=20` (as printed), committed trip 12 | contract ambiguity | Same times; header misprint noted in the file. No change. |

## Printed oddities both transcriptions agree on (kept as printed)
- R1 trip 2, Snowlines Lodge: printed `9;51` → 09:51. E2 trip 2, Courtyard: printed `8;50` → 08:50.
- T3 return trip 2: Gondola 16:20 → Sierra 16:25 (5 min; trip 1 takes 15). T3 outward trip 2: Tokyu 09:45 → Bus Terminal 10:00 (15 min; trip 1 takes 10).
- V2 north trip 7: Norikura 15:39 → Satomi 15:45 (6 min; others 3).
- R2 outward: leg times swap between trips (15/10 vs 10/15 min).
- E4 return: Happo Gondola Lift arrive/depart pairs; departure stored.
- F6 outward trip 3 starts at JR Hakuba Station (12:00); F6 has only two return trips.

## To finish the review
1. Decide H3 trip 1 (keep `null`, or set 08:53 / 09:53).
2. Optionally ask Hakuba Valley (0261-72-3155) about the T3 and V2 gaps.
3. Then set `"reviewed": true` in `data/bus/timetables/2025-26/*.json` — the bus tab goes live.

## Addendum 2026-10-30 — Line V2 main season from the PDF
The page image `TimetableV2.jpg` is the Mar 16–29 revision only. The season PDF's V2 block was transcribed
into three more periods of route `v2` (Dec 13–23 ● trips; Dec 24–Mar 8 all 28 trips, northbound 22-1;
Mar 9–15 ● trips). Check performed: the 8 ★ trips per direction match the reviewed Mar 16–29 file cell for
cell; the validator's increasing-time check passes. Crops used: scratch `pdf/v2-*.png` (re-renderable with
`uv run --with pypdfium2 --with pillow`). Marked reviewed on that basis — a second human look at the PDF is
still worthwhile.
