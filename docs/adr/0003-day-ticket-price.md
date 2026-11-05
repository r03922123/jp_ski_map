# ADR-0003: `dayTicketJpy` is the adult 1-day window price for the main season, without the card deposit

## Status

Accepted (2026-11-06).

## Date

2026-11-06

## Context

`stats.dayTicketJpy` in `data/resorts.json` (`int | None`, `catalog/models.py:34`) feeds two things:
the "Ticket price" row on each resort card (`apps/web/src/components/ResortList.tsx:38-42`) and the
API's `price` sort, where lower is better (`ranking/rank.py:15`, `:76`). [ADR-0001](0001-follow-ups-1-2-3-5.md)
Decision 2 said: fill it if 2026–27 prices are published, and hide the price sort if not.

[PR #15](https://github.com/r03922123/jp_ski_map/pull/15) found 2026–27 prices on 9 resorts' own
pages, but left the field `null` because the prices use different bases and nobody had said which
one the field means. The pages differ in three ways:

- **Window or online.** Several sell a cheaper ticket online: Sanosaka ¥5,700 at the window and
  ¥5,300 on the web; Goryu ¥10,000 at the window, ¥9,500 online for a new card, ¥8,200 to recharge
  one. Jigatake's price list has no online price.
- **Season.** Some prices change by date: Happo-One ¥9,800 from 19 December to 22 March and ¥6,400
  before and after; Norikura ¥6,500, or ¥5,500 early and in spring. Jigatake, Kashimayari and
  Sanosaka have no seasonal rates.
- **IC-card deposit.** Goryu and Hakuba47 include a refundable ¥500 in the price shown;
  Kashimayari and Iwatake charge ¥1,000 on top; the others mention none.

The owner approved doing all of the takeover work, including the owner decisions (2026-11-06,
04:00 CST), and left this call to best practice. Code paths are relative to
`services/api/src/hakuba_api/`, as in [ARCHITECTURE.md](../ARCHITECTURE.md).

## Decision

### `dayTicketJpy` is one adult 1-day lift ticket for the current season's main period (2026–27 when decided), bought at the ticket window, in yen, without any refundable IC-card deposit

- **Main period** is the resort's regular or peak period, not its early-season or spring rate. The
  value is the standard price, not a weekday, resident or other discount (Jigatake ¥5,500, not its
  ¥4,900 weekday price; Kashimayari ¥6,200, not its ¥4,700 Nagano-resident price).
- **Adult** is the resort's own adult band (Goryu 23–64, Happo-One 18–64).
- **Window:** a price that says neither "window" nor "online" counts as the window price,
  because these pages label their online prices (WEB, オンライン) as such. That includes an
  unlabelled standard (通常) price for the current season on the resort's own page, such as a news
  post, until its rates page is updated for that season (Iwatake: the 通常 ¥7,500 in its 2026–27
  early-bird news, while its rates page still shows 2025–26).
- **Deposit:** when the page's price includes the deposit, the value leaves it out, and
  `statsSource` says so (Goryu and Hakuba47: ¥10,000 including ¥500, so `9500`).
- **Online only:** when a resort publishes only an online price for that ticket, use it and write
  "online" in `statsSource`.
- **Source:** the same rule as `nightSkiing` in PR #15. A value goes in only when the resort's or
  its operator's own page states it; otherwise it stays `null`
  ([SPEC-resort-catalog.md](../../SPEC-resort-catalog.md), Acceptance Criteria and Boundaries).
  Each value is recorded in `statsSource` as `dayTicketJpy: <URL> (<basis, if not plain>; checked
  <date>)`.
- **The price sort** stays hidden until all 10 resorts have a value. `rank.py:106` puts unknown
  values last, so a resort with no price would look like the dearest.

**Why:** it is the one figure that every resort's own price page gives. Each of the 9 lists a
standard adult 1-day price for 2026–27, either labelled as the window price or as the plain list
price, while online and early-season prices exist at only some. So it is the only basis on which
all 10 can be compared. The deposit comes back when you return the card, so it isn't part of what
a day of skiing costs.

## Alternatives Considered

### The online price

- Often what people pay, but Jigatake publishes none, and some resorts have two (new card and
  recharge), so there is no single online figure to compare.

### The early-season price

- It lasts a week or two (Happo-One 1–18 December), and Jigatake, Kashimayari and Sanosaka have
  no such rate.

### The price with the deposit included

- It would rank Goryu (¥10,000 with the deposit) as dearer than Happo-One (¥9,800), though a day at
  Goryu costs ¥9,500 once the card is returned.

### Hide the price sort for good

- No yearly re-check, but the cards already show a "Ticket price" row, the API still accepts
  `sort=price`, and [SPEC-resort-ranking.md](../../SPEC-resort-ranking.md) lists price as a ranking
  factor. With one meaning, all three are right instead of empty.

## Consequences

- 9 resorts get a 2026–27 value. Cortina stays `null`: its own site, `hgp.co.jp/cortina/`, shows
  a maintenance page on every path (checked 2026-11-06). Norikura's page sells a joint Norikura ×
  Cortina 1-day ticket for ¥6,500, but that is Norikura's page, so it is only a lead.
- The cards show a price for those 9 and "—" for Cortina. The price sort stays hidden, and
  follow-up 2 stays open.
- Iwatake's rates page still shows 2025–26. Its value comes from its own 2026–27 early-bird news,
  which calls ¥7,500 the 通常 (regular) price; the page doesn't say "window", so the Window rule
  above is what counts it.
- Prices change every season, so each autumn the values need a re-check against the new season's
  pages; the `checked <date>` in each `statsSource` entry shows when a value was last read. The
  definition says "the current season", so this ADR needs no yearly edit.

## Next steps

1. When Cortina's site is back, read its 2026–27 adult 1-day window price and its night skiing.
   With a price for all 10, put `price` back into `SORT_KEYS` (`apps/web/src/lib/url-state.ts`)
   and rewrite the doc comment above it (`:35-41`), which says why `price` is hidden; add price
   back to the Drive sort list in `README.md` (`:8`); set
   `apps/web/e2e/journeys/destination-route.spec.ts` back to 7 options; and change the
   `?sort=price` test in `apps/web/tests/url-state.test.ts` to expect `price`.
2. In December, re-check Iwatake's rates page and the 5 resorts whose `nightSkiing` is still
   `null` (follow-up 2).
