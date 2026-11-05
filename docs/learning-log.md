# Learning log

One entry per merged PR: the few "whys" worth remembering, in plain words. Newest on top.

## 2026-11-06 · tidy: PR #20 docs: settle ADR-0003's open day-ticket cases

**1. Principle: settle the edge cases once, next to the definition, and say which ones you hit.**
ADR-0003 said "main period" but not what to do when a page has several. Happo-One's note named its
high season; Tsugaike's, Goryu's, Hakuba47's and Norikura's didn't, though each also picked the
main price over a cheaper early or spring one. So "no note" meant two things: no choice, or a
choice nobody wrote down. Now the SPEC lists five cases, and each note that made a choice says so
("joint with Cortina; main period 12/19–3/14"). No price changed.
*Analogy:* a recipe that says "a cup of flour" needs to say once whether it's packed or sifted;
after that, every cook gets the same cake.

**2. Trade-off: add the rulings to the SPEC, and leave the accepted ADR as it was.**
An ADR records what was decided and why on that day. Rewriting it would hide what was known then.
The SPEC is the living description of the data, so the five cases go there, and the ADR's Status
gets one dated line pointing to them, as ADR-0002 does. The cost is that a reader looks in two
places; the pointer keeps that to one hop.
*Analogy:* a court doesn't rewrite a law after a ruling; the law book gets a note "see the ruling
of 6 November".

**3. What could go wrong: a translated page, and a label that misleads.**
Hakuba47's English page puts the window ticket's spring rate "after Mar 10", but its Japanese page
says 3/15から, the same as Goryu's page for the same joint ticket (Mar 10 is the online ticket's
date). The price is the same, so the value was safe, but the note worked out from the English
named the wrong period. So the notes use the Japanese page. Labels can mislead the same way: a
page may call a short year-end rate ハイシーズン, so rule 1 counts days instead of trusting the
label. If a resort adds a holiday rate next season, the autumn re-check has to count, not just
copy the number.
*Analogy:* a restaurant's translated menu can drift from the kitchen's own; when they disagree,
read the original.

## 2026-11-06 · tidy: PR #19 fix(data): define the day-ticket price and fill it for 9 resorts

**1. Principle: define a number before you collect it.**
PR #15 found 9 prices but couldn't use them, because each resort means something different by
"1-day ticket". Goryu shows ¥10,000, which includes a ¥500 card deposit you get back; Happo-One
shows ¥9,800 with no deposit. Sorted as printed, Goryu looks dearer, but a day there costs ¥9,500.
ADR-0003 now fixes one meaning (adult, main season, ticket window, no deposit), and every value in
`data/resorts.json` says in `statsSource` where it came from and how it was read.
*Analogy:* comparing drink prices when one shop's label includes the bottle deposit and the next
one's doesn't: you have to take the deposit off first.

**2. Trade-off: the price everyone posts, not the price most people pay.**
Many skiers buy online, and online is often cheaper (Sanosaka ¥5,300 against ¥5,700 at the
window). But not every resort posts an online price, and some post two (new card and recharge).
The window price is on every resort's page, so it is the one that compares all 10. The cost: the
card shows a little more than an online buyer pays.
*Analogy:* a train's full fare: few people pay exactly that, but every line posts one, so you can
compare lines with it.

**3. What could go wrong: a ranking with a gap, and numbers that go stale.**
Cortina's own site is down, so its price stays `null`. The cards can show 9 prices and a "—",
because a card describes one resort. A sort is different: it compares all 10, and `rank.py:106`
puts unknowns last, so Cortina would look like the dearest. That is why the price sort stays
hidden. Prices also change every season, so each value carries "checked 2026-11-06", and Iwatake's
comes from its early-bird news, because its price page still shows last season.
*Analogy:* a league table with one team's score missing: putting them at the bottom says they
lost, when the truth is that nobody knows yet.

## 2026-11-06 · tidy: PR #18 fix(data): re-locate 3 more bus stops from OpenStreetMap

**1. Principle: accept a weaker match only with a second fact behind it, and record how weak it is.**
PR #17 left 6 stops whose OSM candidate matched only indirectly. Three have a second fact that
backs the match. The 日向山高原 bus stop used to be named after the hotel (`old_name:en`
"Holiday Inn Resort Kuroyon"), and it is 60 m from the pin. Pension "Meteor Garden" is a
translation of 流星花園, 26 m away. The Yakushi-no-yu stop takes the nearer of two 薬師の湯
buildings, and is marked `(approximate)` because the stop also serves くろべ路, which OSM lacks.
That mark stays with the coordinate, so a later reader knows it is close, not exact.
*Analogy:* a letter addressed to someone's maiden name is delivered when the street number matches
too, and a note says so.

**2. Trade-off: a little position risk for less licence risk, and only where a mistake is small.**
For these 3, a wrong pick costs a few tens of metres of walking, because every candidate sits
within 90 m of the old pin. Keeping the Google pin keeps a licence that is still unresolved. The
other 3 ambiguous stops stay. Two parking stops would both land on one lot that OSM gives no
number. The third is a camp site whose name isn't the stop's. There, a wrong pick could put a
stop in the wrong place.
*Analogy:* you guess between two doors of the same building, but not between two buildings.

**3. What could go wrong: copies outside the data files.**
Coordinates get copied into tests. The end-to-end tests use a saved API answer,
`apps/web/e2e/fixtures/bus-options-2026-03-20.json`, that still holds 4 My Maps pins, including
Snowlines Lodge's old pin that PR #17 took out of `bus_stops.json`. The first pass checked only
that file, and the review found 3 more test files with exact copies. So a scan then compared every
tracked file with every My Maps or GSI point any version of the data has held, allowing for
rounding: 7 test files hold copies, all within 6 m of the original. The licence test counts only
`bus_stops.json`, so it can't see them. DATA-LICENSES.md now names all 7 under the same
exceptions. The copies go away only when someone swaps in made-up points, or regenerates the
fixture with the API running. The lesson: search every file, not just the one you expect.
*Analogy:* a shop recalls a product from its shelves; the boxes in the stockroom still need a label.

## 2026-11-06 · tidy: PR #17 fix(data): re-locate 7 bus stops from OpenStreetMap

**1. Principle: move a stop only when the match is clear; a named gap beats a wrong pin.**
Of the 58 stops on borrowed coordinates, OpenStreetMap has 7 under a name that clearly matches,
and only those moved. Six others have a candidate that might be right, such as the parking lot
`八方Ｐ` for "Happo Parking No. 3": OSM gives the lot no number, and a second stop 48 m away would
match the same lot. Moving them would swap a pin whose licence is unclear for one whose place is
unclear. They stay as they are, for the owner to decide. PR #17's description lists them by name;
DATA-LICENSES.md covers them in the My Maps group, which it names by `coordSource` prefix, not
stop by stop.
*Analogy:* in a lost-and-found you return a wallet only when the name inside matches; "looks like
yours" stays on the shelf with a label.

**2. Trade-off: a 200 m distance check instead of the stop locator's drive-time check.**
`locate_stops` normally checks each new point against the timetable by asking the router how long
a car takes between stops (`bus/locate_stops.py:117-127`). The router isn't running in this
session, and starting it isn't allowed, so this PR checks something simpler: each stop moved 200 m
or less from where it was. Six moved 62 m or less. Cultured moved 198 m, because its old point was
an approximate street-address lookup and OSM has the hotel itself. The cost: a mistake under 200 m
isn't caught. The drive-time check, which allows 1.5× the bus time plus 3 minutes, would rarely
catch one that small anyway.
*Analogy:* without a scale, you check that the parcel still fits in the same box. That catches a
wrong parcel, not a few grams.

**3. What could go wrong: the licence page and the data drift apart.**
DATA-LICENSES.md says how many stops are not covered by the licence. Before this PR nothing
checked that number, so moving 7 stops could have left "56" on the page. The new
`tests/test_data_licenses.py` counts the two kinds of borrowed coordinate in `bus_stops.json` and
fails when the page's two bullets say something else. It failed on this branch (56 vs 50, 2 vs 1)
until the docs were updated. It checks only those two numbers; the OSM counts in the same paragraph
and in ARCHITECTURE.md are still kept by hand.
*Analogy:* smoke alarms in two rooms of a house: those rooms are watched, and the others still
need someone to look.

## 2026-11-06 · tidy: PR #16 fix(web): reword the night-skiing note, test the hidden price sort

**1. Principle: a message should state the rule, not today's data.**
The Drive panel's empty-list note said the night-skiing filter "currently matches nothing". That
was a fact about the data on one day, and PR #15 made it false by filling 3 resorts with `true`,
without touching the note. The new note says what the filter does: it shows only resorts
confirmed to run night skiing (`rank.py:85` keeps only `true`), so resorts not known yet are left
out. That stays right with 3 matches today or 8 after the December re-check, and has no count to
go stale.
*Analogy:* a shop sign saying "open 9 to 5" is right all day; one saying "open now" is wrong at 5:01.

**2. Trade-off: test the one list the app reads, and accept that copies of it can drift.**
The "Sort by" menu (`SortControls.tsx:38`) and a shared link (`url-state.ts:85`) both read
`SORT_KEYS`, so one line checking that `?sort=price` falls back to drive time guards both. A menu
test would render the panel to check the same list again. The cost: copies outside the code, such
as the README's list of Drive sorts, aren't read by any test. That's how the README kept "price"
after PR #15, and why this PR fixes it by hand.
*Analogy:* checking the kitchen's recipe card covers every plate, but not the menu in the window
that still lists a dish taken off.

**3. What could go wrong: a test that passed the moment it was written.**
Test-first means watching the test fail before the fix. This one couldn't fail on day one: PR #15
had already removed `price`, and this run leaves the web tests to CI. A test that has never failed
might be checking nothing. The guard was reading the line that decides it: `parseRank` keeps a
sort only if `SORT_KEYS` has it (`url-state.ts:85`), so putting `price` back makes the parse
return `"price"`, and the test's `toBe("drive_time")` fails.
*Analogy:* a smoke alarm you've never heard beep may have a dead battery; when you can't press the
test button, you open the lid and check the battery is in.

## 2026-11-06 · tidy: PR #15 fix(ranking): fill night skiing from resort pages, hide the price sort

**1. Principle: a value needs a page that says it; "probably" stays `null`.**
Five resorts' own pages state their 2026–27 night skiing: Jigatake, Sanosaka and Goryu sell night
tickets, Tsugaike says its night skiing is cancelled for 2026–27, and Kashimayari lists lift hours
of 8:30–16:00 on every day. The other five don't say. Happo-One ran night skiing in 2016 (its own
old news), but its 2026–27 price list has no night ticket and no page says yes or no, so it stays
`null`. Cortina's own site is down for maintenance, and a partner resort's page doesn't count.
*Analogy:* a witness who saw it, not one who heard about it.

**2. Trade-off: hide the price sort rather than fill 9 of 10 prices.**
Nine resorts publish a 2026–27 day price, but not on one basis. Goryu and Hakuba47 list ¥10,000
including a ¥500 card deposit you get back; Kashimayari lists ¥6,200 and Iwatake ¥7,500, each
plus a ¥1,000 deposit charged on top; Happo-One has three seasonal prices. Sorted as listed,
Happo-One (¥9,800) would rank cheaper than Goryu, which costs ¥9,500 once the deposit comes back.
And Cortina, with no price, would sort last as if it were the dearest. The cost: no price sort
for now, and the 9 prices live in the PR, not the data, until someone decides what "day price" means.
*Analogy:* comparing bottle prices where some tags include the bottle deposit and some don't.

**3. What could go wrong: `null` and `false` look the same to the filter.**
The night-skiing filter keeps only `true`, so a resort that does run night skiing but whose page
doesn't say it is dropped from the list, just like one that says no. ADR-0001 also called night
skiing a fact that rarely changes, yet 2 of these 5 changed this season: Sanosaka starts it and
Tsugaike stops it. The guard: each value carries the page and the date it was checked in
`statsSource`, and follow-up 2 stays open for the 5 unknowns.
*Analogy:* a dark window isn't a "closed" sign; it only tells you nobody has looked inside.

## 2026-11-06 · tidy: PR #14 docs: ADR-0002, whole-file ODbL for stop and resort data

**1. Principle: follow a value back to where it was first copied from.**
ADR-0001 counted 27 OpenStreetMap stops by reading each stop's `coordSource` label. 13 more said
"access-point", which looked like our own data, but their coordinates were copied from
`data/resorts.json`, and that file says `osm:way` for every one. Following the copies gave 40, not
27. The same happened with "GSI": the endpoint was GSI's, but GSI's own 2015 answer on its tracker
says its address answers come from CSIS Simple Geocoding, a third party with its own terms.
*Analogy:* a jar labelled "homemade jam" that was refilled from a shop jar; the label says who
filled it, not who made it.

**2. Trade-off: label the whole file, not the rows.**
The OSMF's safe harbour for keeping OSM data apart from other data looks at each kind of data
across a whole region: it applies when that kind is all OSM or all non-OSM. The `coord` field in
`bus_stops.json` mixes the two, so the safe harbour doesn't apply, and if the OSM part is
"substantial", share-alike reaches the whole file. Whether it is depends on which OSMF guideline
covers our hand-picked points, and that's unclear. A whole-file label is safe either way.
`resorts.json`, whose coordinates are all OSM, gets the same label by choice, so one rule covers all
three files. The cost: our hand-compiled facts, such as resort stats and stop names, are now
share-alike for anyone who reuses them.
*Analogy:* one share-alike ingredient in a sauce; you can't label the spoonfuls, so you label the pot.

**3. What could go wrong: a named gap is still a gap.**
ODbL has no way to except rows from a file it covers: content that is incompatible with it must
leave the file (§4.4.a, §4.4.d). So naming the 56 My Maps pins and 2 GSI stops tells readers where
the gap is; it doesn't close it. If step 2 stalls, the gap stays in a public repository, and no
test notices. The guard is the process: follow-up 1 stays open, so the takeover can't leave "tidy"
until step 2 removes both groups.
*Analogy:* a "bridge out" sign warns drivers, but only rebuilding the bridge reopens the road.

## 2026-11-05 · tidy: PR #13 fix(crowd): name every non-zero resort prior in reasons

**1. Principle: an explanation with a missing term looks arbitrary.**
The crowd score is a sum, and its reasons are meant to say what went into it. A resort prior below
0.20 was added with no reason. On Mon 2026-02-16, Details showed Norikura at 33% and Jigatake at
25% with the same single reason, "Lunar New Year week", and nothing on screen said why they differ.
Now Norikura also shows "Less-visited resort", and Jigatake, whose prior is 0, shows nothing more.
A reason names a factor, not its size: Norikura (0.08) and Sanosaka (0.03) share one label, just as
Happo-One (0.25) and Goryu (0.20) already shared "Large, popular resort".
*Analogy:* a receipt that leaves one item off; even a small item makes the total look wrong.

**2. Trade-off: why change the code this time, when follow-ups 3, 5 and 11 changed only words.**
Follow-ups 3 and 11 left the code alone because changing it would change behaviour with no data
behind it; 5 kept a tested endpoint rather than delete it. That data rule protects the numbers.
This PR changes no number: every score, level and rank is the same before and after, checked for
all 10 resorts on two dates. It only names a number the score already used. The cost: hand-set
judgements are now on screen. "Less-visited resort" for Kashimayari comes from a
table someone typed, with no visitor data behind it; the SPEC still lists visitor statistics as an
open question.
*Analogy:* a price tag on the shelf. The price was already being charged; now shoppers can see it
and argue with it.

**3. What could go wrong: a guess shown as a fact.**
A resort missing from the prior table gets the default prior of 0.10, so it would now read
"Moderately popular resort" with nothing behind it. No resort is missing today: `data/resorts.json`
lists the same 10 ids as the table. But an 11th resort added without a prior would quietly show
that guess.
*Analogy:* a form that fills a blank field with a default reads just like one a person filled in.

## 2026-11-05 · tidy: PR #12 docs: make three crowd SPEC lines match the code

**1. Principle: an example is a claim too, so make it by running the code, not by typing it.**
SPEC-crowd-level's example said Happo-One on a Lunar New Year Saturday with 25 cm of powder scores
0.78. That is "high" by the SPEC's own levels, yet its own acceptance test says such a day must be
"very high". Three of the four reasons were words the code never prints ("Weekend", not
"Saturday"). Running the code for the same day gives 0.95, very high, and the SPEC now shows that
output, checked by comparing the two, not by eye. PR #10's reviewers found it.
*Analogy:* the photo on a recipe should be of the dish the recipe makes, not a sketch from memory.

**2. Trade-off: exact dates over a vague phrase.**
The SPEC said "early December and late March" lower the score. That hid all of April, and nobody
can test "late". "Mar 16–31" can be tested with two dates: the 15th isn't an edge and the 16th is.
The cost: the dates now live in two places, the SPEC and `_is_season_edge` in the code, and the
two can drift apart.
*Analogy:* "open late" can never be wrong; "open until 9 pm" can, and that's what makes it useful.

**3. What could go wrong: the SPEC and the code drift apart, and nothing notices.**
These three lines were written 41 minutes before the code, and the code came out different. No
test reads the SPEC, so they went unnoticed from that day until PR #10's reviewers read both side
by side. The same could happen again if someone changes a date in `_is_season_edge`. The SPEC now
names the two functions behind these lines (`_new_snow_for`, `_is_season_edge`), so a reader knows
where the truth lives, and whoever edits those functions can search for their names and find the
line to update.
*Analogy:* a trail map that says "conditions change; ask at the hut" still tells you who to ask.

## 2026-11-05 · tidy: PR #11 docs: land the review fixes to ADR-0001

**1. Principle: a PR merges the exact version that was checked, not whatever its branch holds later.**
PR #10 was merged at the version that CI and the fresh review had checked. The review fixes were
pushed 11 minutes later, so they missed it. PR #10 was already merged and closed, so nothing pushed
afterwards could join it. GitHub had also deleted its branch, so the push created a new branch with
the same name, and its output said so. Check that a PR is still open before pushing a fix to it.
*Analogy:* the train leaves with the luggage that was on board; a bag thrown on afterwards needs the
next train.

**2. Trade-off: send the original fix, not a copy.**
The fixes could have been copied onto a fresh branch. But git gives a copied change a new ID, so it
can't tell that the original reached main. The old branch could then only be removed with a forced
delete, the kind that can throw away work nobody merged. Reusing the old branch for this PR lands the
original fix, so git's safe delete, which removes a branch only when all its work is on main, works
after a normal merge. The cost: the branch's name says "follow-ups" for a fix-up.
*Analogy:* forward the original letter rather than a photocopy, so the post office can match it to
the receipt.

**3. What could go wrong: copying a line number without counting.**
The first review cited line 417 for the test that expects 7 sort options, and the owner and the
author repeated it. The assertion is on 418; 417 is the line above it. Only the second review printed
the line and counted. A line number is a fact like any other: print the line and look.
*Analogy:* three people quoting the same wrong page number doesn't make it the right page.

## 2026-11-05 · tidy: PR #10 docs: record the decisions on follow-ups 1, 2, 3 and 5

**1. Principle: a decision made in chat is lost; write it down next to the code.**
The four choices were quick because PR #9's brief had the evidence ready. But the brief lived only
in a chat transcript, and this PR had to dig it out of an export to quote its reasons. An ADR
(architecture decision record: a short file with the decision, why, and what was dropped) keeps all
three in the repo, under `docs/adr/` as in bouldering-vis. When someone asks in six months why a
holiday doesn't outweigh a Saturday, the answer is in `docs/adr/0001-follow-ups-1-2-3-5.md`.
*Analogy:* meeting minutes. Without them, the next meeting argues the same point again.

**2. Trade-off: when the SPEC and the code disagree and neither has data, change the words.**
Follow-up 3 could have raised `holiday` above Saturday's 0.30 to match the SPEC. That would be a
new number with nothing behind it, plus a new test, for the 3 lone holidays between December 2026
and April 2027 (the brief said 1–2 a season; re-counting from the code gave 3). Rewriting the SPEC
changes no behaviour and is easy to undo. The cost: the SPEC drops the hunch that holidays are
busier, so the ADR says to revisit if crowd data ever arrives. Follow-up 5 is the same idea: keep
the tested `/api/crowd` and describe it, rather than delete working tests for tidiness.
*Analogy:* the menu says the soup is spicy, the cook says it isn't, and nobody has tasted it. Fix
the menu before you change the recipe.

**3. What could go wrong: "decided" read as "done".**
Follow-ups 1 and 2 are decided, but nothing in `data/` has changed. The 56 My Maps pins are still in
a public repo, and the night-skiing filter still empties the list. A follow-up marked only
"decided" could look fixed, so each one says "Not done yet", the ADR lists the next steps, and the
CLAUDE.md phase line stays "tidy" until both land.
*Analogy:* a signed repair quote isn't a fixed roof; keep the bucket under the leak until the
roofer has been.

## 2026-11-05 · tidy: PR #9 docs: close follow-ups 4, 6 and 10

**1. Principle: keep one status record.**
The SPECs have 89 unticked checkboxes and 39 ticked ones, with no rule for when to tick, while
`tasks/todo.md` ticks each task as it lands. Two places for the same fact drift apart, which is
how follow-up 10 came about. So SPEC.md now says once that `tasks/todo.md` is the status record,
and the boxes stay as the bar to meet. Ticking them all would only start a second copy that
drifts again.
*Analogy:* a house with two clocks always has one that's wrong; keep one and trust it.

**2. Trade-off: label the empty slot instead of removing it.**
`snow/models.py` allows `source: "reported"`, but nothing sets it yet (`snow/compute.py` always
writes `"model"`). Dropping the value now would change the API types, and the planned
resort-report adapter would add it back in December. Keeping it costs nothing; the risk is that a
reader thinks it works, so SPEC-snow-conditions now says "not built yet" and points to the plan.
*Analogy:* a parking space signed "reserved from December" instead of painting it over and
repainting it later.

**3. What could go wrong: writing what the SPEC should say without reading the code.**
Follow-up 4 was checked in two places: `data/crowd_periods.json` has no 3-day-weekend entries
(its only February rows are the Lunar New Year weeks), and `crowd/heuristic.py` (`_off_run`,
`_day_type`) gives the "3-day weekend" weight to any run of 3 or more weekend and holiday days.
That second read showed the rule covers every month, not only February, so the SPEC now says that
too. Even so, the first draft of this entry said the file had "no February entries", which is
false; the fresh reviewer caught it. Checking once isn't enough when the sentence is rewritten.
*Analogy:* check a map against the road, not against another map.

## 2026-11-05 · PR #8: docs: fix three stale lines

**1. Principle: words about safety must be exact.**
PR #6's entry said "the public API runs on port 8011". Its port isn't public. In the public setup
the API listens only on this computer, and Tailscale Funnel publishes only the web app on `:3000`,
which forwards `/api/*` to it. Calling the API's port "public" would teach the opposite of the
project's rule, so the entry now says where it listens and what is public.
*Analogy:* calling the kitchen door "the entrance" sends guests through the kitchen; only the
front door is for guests.

**2. Trade-off: delete a stale warning, keep a stale to-do.**
SPEC-deploy warned that Valhalla "today listens on every interface". That was true before
`infra/docker-compose.yml` bound it to this computer only, so the warning is now simply wrong and
is removed. The ARCHITECTURE follow-ups 7 to 9 are different: they are a to-do list, and PR #6
did them. They stay, each marked done with a link to PR #6, so a reader can see what was fixed and
where.
*Analogy:* take down a "wet floor" sign once the floor is dry, but tick off a finished chore on
the list instead of tearing out the line.

**3. What could go wrong: fixing a doc by guessing.**
Each change was checked against the file it describes before it was written: the compose file's
port line, `scripts/serve-public.sh` for the API port, and PR #6's diff for follow-ups 7 to 9.
The other follow-ups were left exactly as they were: bus-stop licensing, the "reported" snow
source, crowd weights and more were the owner's decisions, and follow-ups 4 and 10 were simply
outside that task.
*Analogy:* a proofreader checks a phone number by calling it, not by guessing which digit looks
wrong.

## 2026-11-05 · PR #7: test(places): make the Photon-failure test reach Photon

**1. Principle: a test must reach the code it claims to test.**
`test_photon_failure_still_returns_local_hits` fakes a Photon outage and checks that the suggest
box still shows local hits. But it searched for "kashimayari", which already has 3 local hits, and
suggest only asks Photon when it has fewer than 3. So Photon was never called, and the test passed
whether the fallback worked or not. Now it searches "Pheonix" (one local hit) and checks that the
fake Photon was called once.
*Analogy:* a smoke-alarm test in a room with no alarm. Nothing beeps, and you write down "no fire",
when you never tested the alarm at all.

**2. Trade-off: change the test's input, not the code.**
Suggest's rule ("ask Photon only when local hits are few") is right: it keeps suggestions instant.
SPEC-place-search wants local hits in about 20 ms, and Photon takes about 300 ms per keystroke.
So the fix belongs in the test: pick an input that walks down the path we
want to check, and assert that it did. The cost is that the test now depends on the local index
having few "Pheonix" matches. If a data refresh adds more, the call-count check fails loudly
instead of quietly passing, which is the failure we want.
*Analogy:* to test the spare tyre you have to take a wheel off; checking the car with all four
wheels on tells you nothing about the spare.

**3. What could go wrong: believing a check proves more than it does.**
The proof here was a deliberate break, made in a scratch copy. The fallback was changed to crash
on a Photon failure. The old test still passed; the new one failed. The first attempt at this
check was itself wrong: the copy was missing the `data/` folder, so every test failed for an
unrelated reason, which looked like success. Reading why a test failed, not just that it failed,
caught it.
*Analogy:* a fire drill where everyone leaves because the building's power is out tells you
nothing about the alarm.

## 2026-11-05 · PR #6: docs: make the SPECs state what the code already settles

**1. Principle: a spec that disagrees with the code is worse than no spec.**
`docs/ARCHITECTURE.md` listed places where the SPECs and the code disagree. Five of them had
only one right answer, already fixed in the code: in the public setup the API listens only on
this computer, on port 8011 (see `scripts/serve-public.sh`; only the web app on `:3000` is
public), `infra/docker-compose.yml` runs only Valhalla, `pois/` and `common/`
exist, SPEC-deploy answered the hosting question, and place-search's first "Decision" was replaced
by its own v1.2 and v1.3 sections. This PR writes those facts into the SPECs.
*Analogy:* a map that shows a bridge that was torn down sends travellers into the river; a map with
a blank spot only makes them ask.

**2. Trade-off: mark the old decision as replaced, don't delete it.**
The place-search "Decision" now opens with a "Superseded" note that links to v1.2 and v1.3. The
original text stays, because why the team first chose "no lodging list" explains why the later
change was needed. The open hosting question is struck through with its answer. The cost is a
slightly longer file.
*Analogy:* a recipe card with "we now use butter, see below" written over the old margarine line,
so the next cook knows the change was on purpose.

**3. What could go wrong: settling a question that is still open.**
Some disagreements in the list are choices the owner still has to make: the holiday-versus-Saturday
crowd weight, removing `/api/crowd`, and the price and night-skiing data. Writing either answer into
a SPEC would quietly decide them. So this PR only changes lines where the code already decides
the fact, and leaves every crowd weight and open question alone.
*Analogy:* a secretary updates the address book when someone moves, but doesn't decide who gets
invited to the party.

## 2026-11-05 · PR #5: refactor(snow): hand on the checked data, not the original

**1. Principle: what was checked should be exactly what gets used.**
PR #3 checked Open-Meteo's answer but passed the original dicts on, so the snow math still read
raw data that only happened to match the check. Now `fetch_hourly` returns `HourlySeries`, the
typed series `snow/compute.py` already did its math on, built from the checked models by a small
`parse_hourly` function. Nothing unchecked can reach the math, and the type checker can see it.
*Analogy:* PR #3's clerk ticked the checklist and passed the supplier's crate on; now the clerk
unpacks into the kitchen's own labelled boxes, so the cook only ever opens boxes that were checked.

**2. Trade-off: return the kitchen's own type, not the checking models.**
`fetch_hourly` could have returned the Pydantic models themselves. That would teach the math
module Open-Meteo's names, like `temperature_2m`, and a renamed field upstream would ripple into
it. Returning `HourlySeries` keeps all of Open-Meteo's spelling in one file, `snow/openmeteo.py`.
The cost: the parsing moved out of `compute.py`, so two tests that fed it dicts now go through
`parse_hourly`, and `openmeteo.py` now imports from `compute.py`.
*Analogy:* a translator hands the team a document in the team's language, not the original with
sticky notes; if the supplier changes its wording, only the translator has to learn it.

**3. What could go wrong: a refactor that quietly changes the answers.**
A change like this should be invisible to users, and "the tests pass" is weaker proof than it
sounds. So the `/api/snow` answer and the snow that `/api/rank` uses were recorded from the
same January week before the change and compared after it: identical, byte for byte. The tests
also moved from swapping out `httpx.get` by hand to `respx`, like the rest of the suite, and a
new case checks that whole numbers such as `2` still pass the strict check.
*Analogy:* after renovating the kitchen, cook the same recipe and compare the plate to a photo
from before, instead of just checking that the oven turns on.

## 2026-11-05 · PR #4: fix(places): check the Photon response at the door

**1. Principle: the same door check, now for place search.**
Photon is the free geocoder behind the search box. Its answer used to go straight into
`to_place`, so a page of HTML, a missing `"features"` key or a point with one coordinate crashed
`/api/places/search` with a 500. Now `places/photon.py` checks the answer with small Pydantic
models where it arrives. A bad answer becomes an `UpstreamError`, like an outage: search says
"upstream unavailable" (502), and the suggest box keeps showing its own local hits.
*Analogy:* the second restaurant in the chain gets the same back-door checklist as the first.

**2. Trade-off: build the places from the checked models, not the original dicts.**
PR #3 checked the answer but passed the original dicts on, so its check had to be strict to be
safe. Here the places are built from the checked models, so what was checked is exactly what is
used. The models are still strict: the text `"137.86"`, `true` or `Infinity` as a coordinate is
refused, not converted, because a geocoder that sends those is broken and a guess would put a
hotel in the wrong place. Whole numbers like `138` still pass. The cost is a little more code:
four small models instead of reading keys straight from the dict.
*Analogy:* the clerk repacks the delivery into the kitchen's own labelled boxes, so the cook never
touches the supplier's crate.

**3. What could go wrong: a check stricter than the service, or a failure that sticks.**
If a model demanded a field Photon sometimes leaves out, normal searches would turn into 502s. So
only `properties` and `geometry` are required, and every property we read is optional, as before.
The recorded Photon answers in the tests guard this. The other trap is the cache: answers are kept
for 24 hours, so a cached failure would break that search for a day. The check runs before
anything is stored, and a test asks the same question twice to prove the second try reaches Photon.
*Analogy:* if one bad delivery is refused, the next morning's delivery should still be let in;
nobody writes "never buy fish again" on the door.

## 2026-11-05 · PR #3: fix(snow): check the Open-Meteo response at the door

**1. Principle: check what a stranger hands you at the door, not deep inside the house.**
Open-Meteo is a free service we don't control. Before, its answer went straight to the snow math,
so a missing field turned into a `KeyError` three functions later, and `/api/snow` crashed with a
500. Now `snow/openmeteo.py` checks the shape once, with small Pydantic models, right where the
answer arrives. A bad answer becomes an `UpstreamError`, the same error as an outage, so the code
that already handles outages takes over: `/api/snow` says "upstream unavailable" (502), and
`/api/rank` keeps ranking without snow.
*Analogy:* a restaurant checks a delivery at the back door. A crate of spoiled fish is refused
there, not discovered by the cook halfway through a dish.

**2. Trade-off: check only the fields we use, and hand back the original data.**
The models list the four hourly series that `snow/compute.py` reads and ignore everything else, so
a new field from Open-Meteo can't break us. After the check, the function returns the same dicts
as before, so the rest of the code and its tests didn't change. The cost: the type the rest of the
code sees is still a loose `dict`, not the checked model. Passing the model on would be cleaner,
but it would touch `snow/compute.py` and every test fake, which is a bigger change for another day.
*Analogy:* the receiving clerk ticks the boxes on the checklist and passes the crate on as it came,
instead of repacking everything into the restaurant's own boxes.

**3. What could go wrong: a check that is too strict, too loose, or a count that doesn't match.**
If the check were stricter than the service (for example, refusing `null` hours), a normal answer
would look like an outage and snow would vanish from the app. So `null` values stay allowed, as
`compute.py` already expects. A real winter week recorded from Open-Meteo is a test, so a too-strict
check fails CI. Too loose is the other trap, and the pre-merge review caught it. By default,
Pydantic quietly accepts the text `"1.5"` as a number. Because we hand on the original data, that
text would reach the math and crash it. So the models run in strict mode, and only real numbers
pass. The function also checks that it got one location per point it asked for. Without that, a
short answer would crash later with an `IndexError`.
*Analogy:* a bouncer who turns away everyone in sneakers empties the club; one who waves in a
photocopied ID lets trouble in. And someone has to count heads at the door.

## 2026-11-05 · PR #2: docs/ARCHITECTURE.md, a top-down tour

**1. Principle: describe the house that was built, not the blueprint.**
A SPEC is written before the code. Some SPECs weren't updated after the build, so the tour checks
every claim against the code, and it takes status from `tasks/todo.md`. It also follows the path users
really take. Crowd reaches the screen inside `/api/rank`, and the web app never calls `/api/crowd`.
*Analogy:* a builder's "as-built" drawing shows where the pipes really run. A plumber who trusts
the original blueprint drills into the wrong wall.

**2. Trade-off: list the mismatches, don't fix them here.**
The PR has one job: explain the project. The 10 mismatches are numbered follow-ups, each small
enough for its own PR. That makes this PR quick to review and safe to revert. The cost is that the
known problems stay in the code a while longer, and the list can go stale if nobody works through it.
*Analogy:* a home inspector writes the report and doesn't start repairs during the inspection. Each
repair is booked separately, so you can tell which fix caused a new leak.

**3. What could go wrong: data of unclear origin in a public repo.**
Some bus-stop coordinates came from Photon (OpenStreetMap, which needs attribution and share-alike),
the GSI address search, and the operator's Google My Maps pins (which Google's terms may not allow
copying). DATA-LICENSES.md says only "compiled by hand". The repo is public, so copies can spread
before anyone notices. Flagging the risk now, in writing, is cheaper than taking files down later.
The doc itself can also drift. It says which day it was checked against `main`, so a reader
knows how fresh it is.
*Analogy:* a restaurant that can't say where an ingredient came from should label it and check
with the supplier before the dish goes on the public menu.
