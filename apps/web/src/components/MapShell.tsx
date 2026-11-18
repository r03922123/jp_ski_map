"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { BusPanel } from "@/components/BusPanel";
import { BusPilotView } from "@/components/BusPilotView";
import { DestinationPicker } from "@/components/DestinationPicker";
import { DrivePanel } from "@/components/DrivePanel";
import { heroPose } from "@/components/HeroMarker";
import { ImportDialog } from "@/components/ImportDialog";
import { ModePanel } from "@/components/ModePanel";
import { PilotView } from "@/components/PilotView";
import { PinCard } from "@/components/PinCard";
import { PlaceCard } from "@/components/PlaceCard";
import { PoiList } from "@/components/PoiList";
import { SaveButton } from "@/components/SaveButton";
import { SavedPanel } from "@/components/SavedPanel";
import { SearchBox } from "@/components/SearchBox";
import { StampMoment } from "@/components/StampMoment";
import { TitleScreen } from "@/components/TitleScreen";
import { AddDestinationButton, TripCard } from "@/components/TripCard";
import { DestinationBox, TripPanel } from "@/components/TripPanel";
import {
  type Bbox,
  type Coord,
  resortsQuery,
  type Suggestion,
} from "@/lib/api";
import { formatArrival } from "@/lib/format";
import { boardManually } from "@/lib/nav/bus-journey";
import { stopMatchName } from "@/lib/nav/bus-place";
import { usePilotMap } from "@/lib/nav/use-pilot-map";
import { usePilotSession } from "@/lib/nav/use-pilot-session";
import {
  kindFromSuggestion,
  type PlaceInput,
  pinId,
  type SavedPlace,
  useSaved,
  visibleMarkers,
} from "@/lib/saved-places";
import { pointPlaceOf, tripPlaces } from "@/lib/trip-places";
import { DEFAULT_RANK, type RankOptions } from "@/lib/url-state";
import { useBusTrip } from "@/lib/use-bus-trip";
import { useLodging, usePois, useRanking } from "@/lib/use-lists";
import { useRoutes } from "@/lib/use-routes";
import { type TripPoint, useTrip } from "@/lib/use-trip";
import { useViewUrl } from "@/lib/use-view-url";

// MapLibre needs WebGL and `window`, so the map is rendered in the browser only.
const MapView = dynamic(() => import("./MapView"), { ssr: false });

export function MapShell() {
  const [loaded, setLoaded] = useState(false);
  const trip = useTrip();
  const {
    mode,
    setMode,
    origin,
    setOrigin,
    originName,
    setOriginName,
    originSource,
    setOriginSource,
    searchLabel,
    setSearchLabel,
    searchKey,
    setSearchKey,
    selectedResortId,
    setSelectedResortId,
    category,
    setCategory,
    poiId,
    setPoiId,
    point,
    setPoint,
    stops,
    setStops,
    storedBusChoice,
    setBusChoice,
    newStopKey,
    filledStops,
    stopsKey,
    fillStop,
  } = trip;
  // A long-pressed point (or tapped hotel pin) and its card: touch edits the trip only
  // through the card's buttons (docs/ux/behaviour-cards.md BC-A1)
  const [droppedPin, setDroppedPin] = useState<TripPoint | null>(null);
  // Saved panel: open, and optionally focused on one place (a tapped saved marker)
  const [savedOpen, setSavedOpen] = useState(false);
  const [savedFocus, setSavedFocus] = useState<string | null>(null);
  // a shared list waiting for the user to confirm (`#import=…`)
  const [importCode, setImportCode] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<Coord | null>(null);
  const [view, setView] = useState<{ bbox: Bbox; zoom: number } | null>(null);
  const [rankOptions, setRankOptions] = useState<RankOptions>(DEFAULT_RANK);
  useViewUrl({ trip, rankOptions, setRankOptions, setImportCode });

  // Choosing a resort or nearby place replaces a saved place's "Go here".
  const selectResort = (id: string) => {
    // the To box and the Bus list follow the resort, so a bus to another one can't stay
    if (storedBusChoice?.resortId !== id) setBusChoice(null);
    setSelectedResortId(id);
    setPoint(null);
  };
  // The To box (SPEC-web-app v1.8, BC-T1): a pick there changes only the destination. A
  // resort selects it as the list does (the resorts tab, or a food tab would win); any
  // other place is a free destination with its name.
  const chooseTo = (
    place: Pick<Suggestion, "id" | "name" | "coord" | "kind">,
  ) => {
    setBusChoice(null); // it was chosen for the old destination (v1.13 rule 5)
    if (
      place.kind === "resort" &&
      resorts.data?.some((r) => r.id === place.id)
    ) {
      setCategory("resorts");
      setPoiId(null);
      selectResort(place.id);
    } else {
      // the place replaces whatever was chosen: no resort card or food row stays pressed,
      // and the link holds only the point (the same gap in Go here is D5, cluster J)
      setSelectedResortId(null);
      setPoiId(null);
      setPoint({ coord: place.coord, name: place.name });
    }
  };
  const clearTo = () => {
    setBusChoice(null);
    setSelectedResortId(null);
    setPoiId(null);
    setPoint(null);
  };
  const startFrom = (place: SavedPlace) => {
    setOrigin(place.coord);
    setOriginName(place.kind === "pin" ? null : place.name);
    setOriginSource(place);
    setSearchLabel(place.name);
    setFlyTo(place.coord);
    setSavedOpen(false);
  };
  const goTo = (place: SavedPlace) => {
    setPoint({ coord: place.coord, name: place.name });
    setSavedOpen(false);
  };

  const resorts = useQuery(resortsQuery);
  const lodgingPins = useLodging(view);
  const { ranking, rankingState } = useRanking(mode, origin, rankOptions);

  const savedState = useSaved();
  const pointPlace = pointPlaceOf(savedState, point);
  const {
    busPlace,
    busChoice,
    busStop,
    rideRoute,
    rideLeg,
    results: busResults,
    basis: busBasis,
    departAt,
    setDepartAt,
    showNight,
    setShowNight,
  } = useBusTrip({ mode, origin, originName, pointPlace, storedBusChoice });

  // Drive to the access point the ranking found nearest; otherwise the first one.
  const resort = resorts.data?.find((r) => r.id === selectedResortId);
  const nearestId = ranking.data?.find(
    (r) => r.resortId === selectedResortId,
  )?.accessPointId;
  const destination = (
    resort?.accessPoints.find((a) => a.id === nearestId) ??
    resort?.accessPoints[0]
  )?.coord;

  // In bus mode the route shown is the walk to the chosen boarding stop.
  const routeMode = mode === "bus" ? "walk" : mode;

  // Food / konbini destinations (drive and walk only; shuttles serve resorts).
  const poiCategory = category === "resorts" ? null : category;
  const { pois, poiState, selectedPoi, poiTarget } = usePois({
    mode,
    routeMode,
    origin,
    poiCategory,
    poiId,
  });

  const target =
    mode === "bus"
      ? busStop
      : (point?.coord ?? (poiCategory ? poiTarget : destination));
  // With stops (drive/walk) the route is one trip through them; no alternates then.
  const viaStops = mode === "bus" ? [] : filledStops.map((s) => s.coord);
  const {
    routes,
    routeState,
    isPending: routePending,
    activeRoute,
    setActiveRoute,
    highlight,
    setHighlight,
  } = useRoutes({ mode, routeMode, origin, target, viaStops });

  const routeData = routeState.status === "success" ? routeState.data : null;

  const {
    pilot,
    pilotRoute,
    piloting,
    reroute,
    reroutes,
    following,
    setFollowing,
    busPlan,
    busState,
    setBusState,
    busPhase,
    pastWalk,
    preview,
    busNote,
    now,
    pilotAvailable,
    proximity,
    startPilot,
    startBusPilot,
    exitPilot,
  } = usePilotSession({
    mode,
    resorts: resorts.data,
    routes,
    activeRoute,
    target,
    viaStops,
    busChoice,
    rideRoute,
  });
  // SPEC-game-theme: the rider's pose follows the trip
  const pose = heroPose({
    mode: busPlan ? "bus" : mode === "walk" ? "walk" : "drive",
    phase: pilot.phase,
    bus: busPhase ?? undefined,
  });
  const { busRide, mapPilot } = usePilotMap({
    pilot,
    piloting,
    busPlan,
    busState,
    following,
    setFollowing,
    pose,
  });
  // the one bus line the map draws (the journey's, or the chosen option's preview)
  const mapRide = busRide ?? (pilotRoute ? null : rideLeg);
  const routeLayers = [
    ...routes.map((_, i) =>
      mode === "bus" ? "walk" : i === activeRoute ? "primary" : "alternate",
    ),
    ...(rideLeg ? ["ride"] : []),
  ].join(",");

  const viewCentre = view
    ? {
        lat: (view.bbox.south + view.bbox.north) / 2,
        lng: (view.bbox.west + view.bbox.east) / 2,
      }
    : null;
  const {
    tripStops,
    placingStop,
    shownResortIds,
    fromPlace,
    toPlace,
    showToBox,
    destinationResortId,
    destinationLoading,
    canAddStop,
    canSwap,
    destinationKey,
    routeKey,
  } = tripPlaces({
    mode,
    routeMode,
    origin,
    originSource,
    point,
    pointPlace,
    stops,
    stopsKey,
    selectedResortId,
    poiId,
    poiCategory,
    resort,
    destination,
    selectedPoi,
    busPlace,
    busChoice,
    showNight,
    target,
    activeRoute,
    piloting,
    savedOpen,
    savedState,
    resorts: resorts.data,
    listsLoading: {
      resorts: resorts.isLoading,
      pois: pois.isLoading,
    },
  });
  const clearOrigin = () => {
    setOrigin(null);
    setOriginName(null);
    setOriginSource(null);
    setSearchLabel(null);
    setBusChoice(null);
    // an empty stop box would take the next tap, which is meant for the new start
    setStops((list) => list.filter((st) => st.place !== null));
  };
  const fillOpenStop = (place: PlaceInput) => {
    const open = stops.find((st) => st.place === null);
    if (open) fillStop(open.key, place);
  };
  const savedMarkers = useMemo(() => visibleMarkers(savedState), [savedState]);
  // Directions: the start becomes the destination, and From waits to be filled (rule 3)
  const directionsTo = () => {
    if (!fromPlace) return;
    chooseTo({
      id: fromPlace.id,
      name: fromPlace.name,
      coord: fromPlace.coord,
      // a resort stays a resort; anything else is a named point
      kind: fromPlace.kind === "resort" ? "resort" : "place",
    });
    clearOrigin();
    setSearchKey((k) => k + 1);
  };
  const addStopRef = useRef<HTMLButtonElement>(null);
  const addStop = () => {
    setSavedOpen(false); // the stop box lives in the trip list, which Saved replaces
    setStops((list) => [...list, { key: newStopKey(), place: null }]);
  };
  const swapTrip = () => {
    if (!fromPlace || !toPlace) return;
    setOrigin(toPlace.coord);
    setOriginName(stopMatchName(toPlace.name));
    setOriginSource(toPlace);
    setSearchLabel(toPlace.name);
    // remounted: a label equal to the last one the app set wouldn't replace a typed start
    setSearchKey((k) => k + 1);
    setPoiId(null);
    setBusChoice(null); // its stop was picked for the old start
    // a resort goes back to being selected, so a second tap restores the trip
    if (
      fromPlace.kind === "resort" &&
      resorts.data?.some((r) => r.id === fromPlace.id)
    ) {
      setCategory("resorts");
      setSelectedResortId(fromPlace.id);
      setPoint(null);
    } else {
      setSelectedResortId(null);
      setPoint({ coord: fromPlace.coord, name: fromPlace.name });
    }
    setStops((list) => [...list].reverse());
  };
  const pinPlace = (pin: {
    coord: Coord;
    name: string | null;
  }): PlaceInput => ({
    id: pinId(pin.coord),
    name: pin.name ?? "Dropped pin",
    coord: pin.coord,
    kind: "pin",
  });
  const pinCard = droppedPin && (
    <PinCard
      name={droppedPin.name}
      onClose={() => setDroppedPin(null)}
      onStart={() => {
        setOrigin(droppedPin.coord);
        setOriginName(droppedPin.name);
        setOriginSource(droppedPin.name ? pinPlace(droppedPin) : null);
        // the box shows the new start, as Google's From box does ("Dropped pin" when it
        // has no name); a fresh box, so it replaces whatever was typed before (S1)
        setSearchLabel(droppedPin.name ?? "Dropped pin");
        setSearchKey((k) => k + 1);
        setDroppedPin(null);
      }}
      onGo={
        // Bus has no "go here": its destination comes from the swap or another tab
        mode === "bus"
          ? undefined
          : () => {
              setPoint({ coord: droppedPin.coord, name: droppedPin.name });
              setDroppedPin(null);
            }
      }
      onAddStop={
        canAddStop
          ? () => {
              setStops((list) => [
                ...list,
                { key: newStopKey(), place: pinPlace(droppedPin) },
              ]);
              setDroppedPin(null);
            }
          : undefined
      }
    />
  );

  return (
    <main
      className="fixed inset-0"
      aria-labelledby="app-title"
      data-map-loaded={loaded}
      data-route-points={routeData?.geometry.coordinates.length ?? 0}
      data-route-layers={routeLayers}
      data-lodging-pins={lodgingPins.length}
      data-piloting={piloting}
      data-map-ride-stops={mapRide?.stops.length ?? 0}
    >
      <h1 id="app-title" className="sr-only">
        Hakuba Valley trip planner
      </h1>
      {busPlan && pastWalk && (
        <BusPilotView
          plan={busPlan}
          state={busState}
          now={now}
          basis={busBasis}
          onBoard={() => setBusState(boardManually)}
          onExit={exitPilot}
        />
      )}
      {pilotRoute && !pastWalk && (
        <PilotView
          status={pilot}
          mode={pilotRoute.mode}
          following={following}
          reroute={reroute}
          reroutes={reroutes}
          footnote={
            busPlan
              ? `Then ${busPlan.option.routeName} from ${busPlan.stops[0].name} at ${formatArrival(new Date(busPlan.departsAtMs), 0)}`
              : undefined
          }
          busStops={
            busPlan
              ? busPlan.stops.slice(0, busPlan.alightIndex + 1)
              : undefined
          }
          onExit={exitPilot}
          onRecenter={() => setFollowing(true)}
          now={new Date()}
          preview={preview}
        />
      )}
      {!pilotRoute && (
        <BottomSheet
          label="Directions"
          header={
            <TripCard
              twoBars={showToBox}
              from={
                <SearchBox
                  // remounted (emptied) when the trip panel's ✕ clears the start
                  key={searchKey}
                  // the rail and ⇅ narrow this box in two bars (T78)
                  placeholder={showToBox ? "Search a start" : undefined}
                  searchIcon={!showToBox}
                  // the top card reads From → To (BC-L1): never blank while there is a start
                  label={searchLabel ?? fromPlace?.name ?? null}
                  onSelect={(place) => {
                    setOrigin(place.coord);
                    setOriginName(place.name);
                    setOriginSource({
                      id: place.id,
                      name: place.name,
                      coord: place.coord,
                      kind: kindFromSuggestion(place.kind),
                    });
                    setFlyTo(place.coord);
                  }}
                  onClear={clearOrigin}
                  near={
                    view
                      ? {
                          lat: (view.bbox.south + view.bbox.north) / 2,
                          lng: (view.bbox.west + view.bbox.east) / 2,
                        }
                      : null
                  }
                />
              }
              to={
                <DestinationBox
                  to={toPlace}
                  near={viewCentre}
                  onChoose={chooseTo}
                  onClear={clearTo}
                />
              }
              swap={
                <button
                  type="button"
                  aria-label="Swap start and destination"
                  disabled={!canSwap}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-muted disabled:opacity-40"
                  onClick={swapTrip}
                >
                  <ArrowUpDown aria-hidden="true" className="size-4" />
                </button>
              }
              addDestination={
                canAddStop && (
                  <AddDestinationButton ref={addStopRef} onClick={addStop} />
                )
              }
              saveDestination={toPlace && <SaveButton place={toPlace} />}
              placeCard={
                fromPlace &&
                !destinationLoading && (
                  <PlaceCard
                    place={fromPlace}
                    showLists={mode !== "bus"}
                    category={category}
                    onDirections={directionsTo}
                    onCategory={(c) => {
                      setCategory(c);
                      setPoint(null);
                    }}
                  />
                )
              }
              saved={
                <button
                  type="button"
                  aria-label="Saved places"
                  aria-pressed={savedOpen}
                  className="flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full border bg-background px-3 text-xs font-medium shadow-sm hover:bg-muted aria-pressed:bg-amber-50"
                  onClick={() => {
                    setSavedFocus(null);
                    setSavedOpen((v) => !v);
                  }}
                >
                  <span aria-hidden="true" className="text-amber-500">
                    ★
                  </span>
                  <span className="max-md:sr-only">Saved</span>
                </button>
              }
            />
          }
          collapseKey={destinationKey}
          revealKey={routeKey}
          // with no start it would hold only the hint on how to set one (and the stops
          // a cleared start leaves, which must stay reachable)
          hiddenOnPhone={
            origin === null && !savedOpen && filledStops.length === 0
          }
        >
          {savedOpen ? (
            <SavedPanel
              focusId={savedFocus}
              canGoHere={mode !== "bus"}
              onStartFrom={startFrom}
              onGoHere={goTo}
              onClose={() => setSavedOpen(false)}
            />
          ) : (
            <ModePanel
              mode={mode}
              onModeChange={(m) => {
                setMode(m);
                // the destination may have changed on the other tab, and the bus with it
                if (m === "bus" && point) setBusChoice(null);
              }}
              resorts={resorts.data ?? []}
              selectedResortId={selectedResortId}
              onSelectResort={selectResort}
              hasOrigin={origin !== null}
              placeStrip={
                <TripPanel
                  from={fromPlace}
                  stops={mode === "bus" ? [] : tripStops}
                  addStopRef={addStopRef}
                  near={viewCentre}
                  onRemoveStop={(key) =>
                    setStops((list) => list.filter((s) => s.key !== key))
                  }
                  onFillStop={fillStop}
                  onClearFrom={() => {
                    clearOrigin();
                    setSearchKey((k) => k + 1);
                  }}
                />
              }
              onStart={
                mode === "bus" || !pilotAvailable ? undefined : startPilot
              }
              startKind={proximity === "far" ? "preview" : "start"}
              route={routeState}
              routes={routes}
              activeRoute={activeRoute}
              onSelectRoute={setActiveRoute}
              onHighlightStep={setHighlight}
              departAt={departAt ? new Date(`${departAt}:00+09:00`) : undefined}
              busPanel={
                <BusPanel
                  resorts={resorts.data ?? []}
                  result={busResults.bus}
                  // the resort itself, not a tapped bus's: that would collapse the list.
                  // Only a known one: a stale link must not say there are no shuttles
                  onlyResortId={
                    resorts.data?.some((r) => r.id === destinationResortId)
                      ? destinationResortId
                      : null
                  }
                  place={
                    busPlace && {
                      name: busPlace.name,
                      result: busResults.toPlace,
                      onClear: clearTo,
                    }
                  }
                  night={busResults.night}
                  showNight={showNight}
                  onShowNightChange={setShowNight}
                  departAt={departAt}
                  onDepartAtChange={setDepartAt}
                  selected={busChoice}
                  onSelect={setBusChoice}
                  // only once the walk to the stop is known: it is the first leg
                  onStart={
                    routePending || !pilotAvailable ? undefined : startBusPilot
                  }
                  startNote={busNote}
                />
              }
              destinationPicker={
                <DestinationPicker
                  value={category}
                  onChange={(c) => {
                    setCategory(c);
                    setPoint(null);
                  }}
                />
              }
              poiPanel={
                poiCategory ? (
                  <PoiList
                    state={poiState}
                    selectedId={poiId}
                    onSelect={(p) => {
                      setPoiId(p.id);
                      setPoint(null);
                    }}
                  />
                ) : undefined
              }
              drivePanel={
                <DrivePanel
                  options={rankOptions}
                  onOptionsChange={setRankOptions}
                  ranking={rankingState}
                  selectedResortId={selectedResortId}
                  onSelectResort={selectResort}
                />
              }
            />
          )}
        </BottomSheet>
      )}
      {/* after the sheet in the DOM, so Tab reaches the search box before the map's
          ~20 markers and links (T78); it paints below everything (z-index 0) */}
      <MapView
        resorts={resorts.data ?? []}
        shownResortIds={shownResortIds}
        selectedResortId={selectedResortId}
        origin={origin}
        destination={
          mode === "bus" ? (busPlace?.coord ?? null) : (target ?? null)
        }
        routes={
          pastWalk
            ? [] // at the stop or on the bus: the bus line is the route now
            : pilotRoute
              ? [pilotRoute]
              : routes
        }
        activeRoute={pilotRoute ? 0 : activeRoute}
        onSelectRoute={setActiveRoute}
        highlight={pilotRoute ? null : highlight}
        ride={mapRide}
        pilot={mapPilot}
        lodging={lodgingPins}
        busStop={busStop}
        flyTo={flyTo}
        onLoad={() => setLoaded(true)}
        onViewChange={setView}
        onPickOrigin={(coord) => {
          // an open stop box takes the tap (Google: type, or put a point on the map)
          if (placingStop) {
            fillOpenStop({
              id: pinId(coord),
              name: "Dropped pin",
              coord,
              kind: "pin",
            });
            return;
          }
          // both ends set: a stray click must not replace the start (v1.13 rule 8);
          // Add destination is how to change the trip from here
          if (origin && toPlace) return;
          setOrigin(coord);
          setOriginName(null);
          setOriginSource(null);
          // the From box then shows "Dropped pin", not an older label such as My hotel
          setSearchLabel(null);
        }}
        stops={
          mode === "bus"
            ? []
            : tripStops.flatMap((st) =>
                st.place
                  ? [{ coord: st.place.coord, name: st.place.name }]
                  : [],
              )
        }
        placingStop={placingStop}
        onDropPin={(coord, name) => setDroppedPin({ coord, name })}
        onMapTap={() => setDroppedPin(null)}
        droppedPin={piloting ? null : droppedPin}
        pinCard={pinCard}
        onSelectResort={(id) => {
          // while placing a stop, a resort marker is the stop, not a new destination
          const r = placingStop
            ? resorts.data?.find((x) => x.id === id)
            : undefined;
          const at = r?.accessPoints[0]?.coord;
          if (r && at) {
            fillOpenStop({
              id: r.id,
              name: r.name.en,
              coord: at,
              kind: "resort",
            });
            return;
          }
          selectResort(id);
        }}
        saved={savedMarkers}
        onSelectSaved={(id) => {
          const place = placingStop
            ? savedState.places.find((p) => p.id === id)
            : undefined;
          if (place) {
            fillOpenStop(place);
            return;
          }
          setSavedFocus(id);
          setSavedOpen(true);
        }}
      />
      {importCode && (
        <ImportDialog
          code={importCode}
          onDone={(imported) => {
            // the URL mirror above already dropped the fragment, so a reload won't ask again
            setImportCode(null);
            if (imported) setSavedOpen(true);
          }}
        />
      )}
      <StampMoment />
      <TitleScreen />
    </main>
  );
}
