# Learning log

One entry per merged PR: the few "whys" worth remembering, in plain words. Newest on top.

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
