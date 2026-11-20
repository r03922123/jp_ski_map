# Google Maps interaction design across Hakuba workflows

Draft for owner approval, 2026-11-20. Takeover phase is tidy.

## Outcome

A consistent map interface from finding a place to completing a journey. Use the existing
Google Maps observations in behaviour-cards.md and SPEC-maps-ios-ux.md as evidence.
The following details are proposed Hakuba design decisions.

Use a readable sans-serif font, light surfaces, rounded controls, restrained shadows,
blue primary actions and clear selected states throughout the working interface.
Replace the pixel frames on controls, sheets and place markers. Retain useful ski-resort
icons and snow, crowd, shuttle and timetable information.

The map fills the available screen. Keep search at its current safe-area position.
Check the Home Screen status bar on a cold launch, with the keyboard open and after
rotation. Native status-bar rendering remains a device acceptance check.

## Workflow design

| Workflow | Proposed experience | Pass condition |
| --- | --- | --- |
| Open and explore | Immediate map, one search bar, Saved access, clear location control. Compact resort labels distinguish the selected place. | Useful controls remain reachable at 390 px and 320 px. |
| Search or paste a Maps link | Focused search surface with clear Back and Clear actions, readable suggestions and explicit loading, empty and error states. | Selecting, cancelling and clearing preserve the expected trip state and keyboard focus. |
| Select a place or drop a pin | Place sheet with name, relevant details and prominent Directions, plus Save and Set start actions. | Each action works from search, markers and a dropped pin. |
| Plan directions | Compact From/To card with swap, then Drive, Walk and Bus with available travel times. | Editing either endpoint, swapping and returning to the map preserve valid state and URL sharing. |
| Compare drive or walk routes | ETA, arrival and distance first, route alternatives below, steps expandable, Start easy to reach. | Selected map route and selected option agree; route stays clear of panels. |
| Compare resorts and nearby places | Clear rows with names, travel times and relevant ski conditions. Filters have visible active states. | Sorting, date changes and categories work without hiding the selection. |
| Plan a shuttle journey | Departure time and boarding stop first, walking leg and ride timeline next, alternatives and timetable source available. | Published versus estimated information remains clear; missed departures and no-service states are usable. |
| Add or reorder stops | Ordered stop list with handles and remove actions, followed by updated trip totals. | Reorder, remove and return to the trip preserve the correct route. |
| Saved places and lists | Lists to places to place details, consistent Back action, visible hotel designation, notes, sharing and import feedback. | Existing saved data works; return-to-hotel and shared-list import journeys pass. |
| Drive and walk navigation | High-contrast next instruction, distance and maneuver at top; ETA and exit controls below; recenter after map exploration. | GPS loss, rerouting, preview, arrival and exit work and remain readable. |
| Bus navigation | Distinct walk, wait, board, ride, alight and arrived states with the next action visible. | Manual boarding and progression through every journey stage work. |
| Desktop and landscape | Same workflow in a left panel, with map alongside and controls clear of safe areas. | No horizontal overflow, clipped actions or inaccessible attribution. |

## Shared behavior

- A draggable sheet has low, middle and expanded positions, plus accessible controls for changing height.
- Back returns one workflow step. Closing a place or route has explicit, consistent behavior.
- Search inputs and primary controls have at least 44 px touch targets and visible keyboard focus.
- Loading, empty, permission-denied and recoverable failure states offer an appropriate next action.
- Map attribution stays available through a comfortably sized information button.
- Data estimates and source labels remain attached to the information they qualify.
- Use existing APIs, route logic and local saved-place storage.

## Delivery and evidence

Implement in small reviewed commits, normally around 300 changed lines each.

1. Shared typography, surfaces, controls and map markers.
2. Explore, search, place selection and the bottom sheet.
3. Endpoints, modes, route comparison, ranking and stops.
4. Shuttle planning and journey stages.
5. Saved lists, import, share and return to hotel.
6. Navigation, error states, desktop and landscape verification.

For each slice, run relevant existing unit and journey tests, typecheck and Biome.
Add a regression test when behavior changes. Capture before and after views at the
same viewport and verify key interactions on the connected iPhone.
Use e2e/journeys for endpoint editing, alternatives, stops, bus timing, saved lodging
and resilience. Run layout-share checks for map and panel fit.

Final acceptance requires screenshots of every workflow above, working keyboard and
Back behavior, a cold Home Screen launch with map behind the clock and search in its
original position, a fresh reviewer and owner approval before merge.

The earlier single-bar preview is a direction sample. This spec expands the design
to all working screens. Production release follows approval of the completed result.
