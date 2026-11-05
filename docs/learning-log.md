# Learning log

One entry per merged PR: the few "whys" worth remembering, in plain words. Newest on top.

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

## 2026-11-05 · fix(snow): check the Open-Meteo response at the door

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
