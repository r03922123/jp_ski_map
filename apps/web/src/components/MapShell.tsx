"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { BusPanel } from "@/components/BusPanel";
import { heroPose } from "@/components/HeroMarker";
import { ImportDialog } from "@/components/ImportDialog";
import { ModePanel } from "@/components/ModePanel";
import { PilotScreens } from "@/components/PilotScreens";
import { PinCard } from "@/components/PinCard";
import { PlaceCard } from "@/components/PlaceCard";
import { RankingPanel } from "@/components/RankingPanel";
import { SaveButton } from "@/components/SaveButton";
import { SavedPanel } from "@/components/SavedPanel";
import { SearchBox } from "@/components/SearchBox";
import { StampMoment } from "@/components/StampMoment";
import {
  AddDestinationButton,
  SavedButton,
  SwapButton,
  TripCard,
} from "@/components/TripCard";
import { DestinationBox, TripPanel } from "@/components/TripPanel";
import { type Bbox, type Coord, resortsQuery } from "@/lib/api";
import { useBackToClose } from "@/lib/back-close";
import { usePilotMap } from "@/lib/nav/use-pilot-map";
import { usePilotSession } from "@/lib/nav/use-pilot-session";
import { placeAt, useSaved, visibleMarkers } from "@/lib/saved-places";
import { shownTrip } from "@/lib/trip-places";
import { DEFAULT_RANK, type RankOptions } from "@/lib/url-state";
import { useBusTrip } from "@/lib/use-bus-trip";
import { useLodging, useRanking } from "@/lib/use-lists";
import { useMapCard } from "@/lib/use-map-card";
import { useModeDurations, useRoutes } from "@/lib/use-routes";
import { pinPlace, type TripEvent, useTrip } from "@/lib/use-trip";
import { useViewUrl } from "@/lib/use-view-url";

// MapLibre needs WebGL and `window`, so the map is rendered in the browser only.
const MapView = dynamic(() => import("./MapView"), { ssr: false });

export function MapShell() {
  const [loaded, setLoaded] = useState(false);
  const trip = useTrip();
  const {
    mode,
    origin,
    originName,
    searchLabel,
    searchKey,
    focusedSearchKey,
    filledStops,
  } = trip;
  // Saved panel: open, and optionally focused on one place (a tapped saved marker)
  const [savedOpen, setSavedOpen] = useState(false);
  const [savedFocus, setSavedFocus] = useState<string | null>(null);
  // a shared list waiting for the user to confirm (`#import=…`)
  const [importCode, setImportCode] = useState<string | null>(null);
  // T5: what an import added, shown at the top of Saved until it closes, by any route (its
  // ✕, the Saved toggle, Start from, Go here, Add destination; review of #118)
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!savedOpen) setSavedNotice(null);
  }, [savedOpen]);
  const [flyTo, setFlyTo] = useState<Coord | null>(null);
  const [view, setView] = useState<{ bbox: Bbox; zoom: number } | null>(null);
  const [rankOptions, setRankOptions] = useState<RankOptions>(DEFAULT_RANK);
  const linkRead = useViewUrl({
    trip,
    rankOptions,
    setRankOptions,
    setImportCode,
  });

  const resorts = useQuery(resortsQuery);
  const lodgingPins = useLodging(view);
  const { ranking, rankingState } = useRanking(mode, origin, rankOptions);

  const savedState = useSaved();
  // Night bus: the shown trip reads it (night buses draw no trip), then the bus answers
  const [showNight, setShowNight] = useState(false);
  const {
    selectedResortId,
    routeMode,
    target,
    sharedTarget,
    destinationMarker,
    busPlace,
    busChoice,
    busStop,
    onlyResortId,
    fromPlace,
    toPlace,
    showToBox,
    tripStops,
    stopBoxOpen,
    shownResortIds,
    hasDestination,
    destinationLoading,
    canAddStop,
    canSwap,
    destinationKey,
    routeKey,
  } = shownTrip(trip, { resorts, ranking, savedState, showNight });
  const {
    rideRoute,
    rideLeg,
    results: busResults,
    basis: busBasis,
    departAt,
    setDepartAt,
    freeOnly,
    setFreeOnly,
  } = useBusTrip({
    mode,
    origin,
    originName,
    busPlace,
    busChoice,
    busStop,
    showNight,
  });

  // With stops (walk) the route is one trip through them; no alternates then.
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
  const durations = useModeDurations({
    origin,
    target: sharedTarget,
    viaStops: filledStops.map((s) => s.coord),
  });

  const routeData = routeState.status === "success" ? routeState.data : null;

  const session = usePilotSession({
    resorts: resorts.data,
    routes,
    activeRoute,
    target,
    viaStops,
    busChoice,
    rideRoute,
  });
  const {
    pilot,
    pilotRoute,
    piloting,
    following,
    setFollowing,
    busPlan,
    busState,
    busPhase,
    pastWalk,
    busNote,
    pilotAvailable,
    proximity,
    startPilot,
    startBusPilot,
  } = session;
  // SPEC-game-theme: the rider's pose follows the trip
  const pose = heroPose({
    mode: busPlan ? "bus" : "walk",
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
  // An open stop box takes map taps only while it is on screen (SPEC-web-app v1.4).
  const placingStop = stopBoxOpen && !piloting && !savedOpen;
  const world = {
    resorts: resorts.data,
    savedPlaces: savedState.places,
    fromPlace,
    toPlace,
    placingStop,
  };
  // the panel an edit opens is the shell's to open
  const edit = (event: TripEvent) => {
    const opens = trip.edit(event, world);
    if (opens?.panel === "resortCard") card.openResort(opens.id);
    if (opens?.panel === "saved") {
      setSavedFocus(opens.id);
      setSavedOpen(true);
    }
  };
  const clearTo = () => edit({ type: "destinationCleared" });
  const chooseResort = (id: string) => edit({ type: "resortChosen", id });
  const toEmptiedSinceLink = useRef(false);
  if (linkRead && !hasDestination) toEmptiedSinceLink.current = true;
  useBackToClose(hasDestination && toEmptiedSinceLink.current, clearTo);
  useBackToClose(savedOpen, () => setSavedOpen(false));
  useBackToClose(piloting, session.exitPilot);
  const card = useMapCard({
    resorts: resorts.data,
    piloting,
    pinCard: (pin, close) => {
      // the pin card's buttons edit the trip and close the card
      const pinEdit = (event: TripEvent) => () => {
        edit(event);
        close();
      };
      return (
        <PinCard
          name={pin.name}
          coord={pin.coord}
          onClose={close}
          onStart={pinEdit({ type: "startSet", start: { by: "pin", pin } })}
          onGo={
            // Bus has no "go here": its destination comes from the swap or another tab
            mode === "bus"
              ? undefined
              : pinEdit({ type: "pointChosen", point: pin })
          }
          onAddStop={
            canAddStop
              ? pinEdit({ type: "stopAdded", place: pinPlace(pin) })
              : undefined
          }
          save={
            // a saved place at that spot (My hotel's lodging pin) is that place, not a new pin
            <SaveButton
              place={placeAt(savedState, pin.coord) ?? pinPlace(pin)}
            />
          }
        />
      );
    },
  });
  const savedMarkers = useMemo(() => visibleMarkers(savedState), [savedState]);
  const addStopRef = useRef<HTMLButtonElement>(null);
  // the sheet shows DirectionsPanel, whose sticky ETA + Start row is the landscape bar
  const slimSheet =
    !savedOpen && origin !== null && mode !== "bus" && routeData !== null;

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
      <PilotScreens session={session} basis={busBasis} />
      {!pilotRoute && (
        <BottomSheet
          label="Directions"
          header={
            <TripCard
              twoBars={showToBox}
              from={
                <SearchBox
                  // remounted when an action replaces the start (Directions, swap, Start here)
                  key={searchKey}
                  autoFocus={searchKey === focusedSearchKey}
                  // the rail and ⇅ narrow this box in two bars (T78)
                  placeholder={showToBox ? "Search a start" : undefined}
                  searchIcon={!showToBox}
                  // the top card reads From → To (BC-L1): never blank while there is a start
                  label={searchLabel ?? fromPlace?.name ?? null}
                  onSelect={(place) => {
                    edit({ type: "startSet", start: { by: "search", place } });
                    setFlyTo(place.coord);
                  }}
                  onClear={() => edit({ type: "startCleared" })}
                  near={viewCentre}
                />
              }
              to={
                <DestinationBox
                  to={toPlace}
                  near={viewCentre}
                  onChoose={(place) =>
                    edit({ type: "destinationChosen", place })
                  }
                  onClear={clearTo}
                />
              }
              swap={
                <SwapButton
                  disabled={!canSwap}
                  onClick={() => edit({ type: "swapped" })}
                />
              }
              saveDestination={toPlace && <SaveButton place={toPlace} />}
              placeCard={
                fromPlace &&
                !destinationLoading && (
                  <PlaceCard
                    place={fromPlace}
                    onDirections={() => edit({ type: "directions" })}
                  />
                )
              }
              saved={
                <SavedButton
                  open={savedOpen}
                  compact={showToBox}
                  onClick={() => {
                    setSavedFocus(null);
                    setSavedOpen((v) => !v);
                  }}
                />
              }
            />
          }
          collapseKey={destinationKey}
          revealKey={routeKey && `${routeKey}|${activeRoute}`}
          raiseKey={`${savedOpen}|${mode}`}
          // with no start it would hold only the hint on how to set one (and the stops
          // a cleared start leaves, which must stay reachable)
          hiddenOnPhone={
            origin === null && !savedOpen && filledStops.length === 0
          }
          slim={slimSheet}
        >
          {savedOpen ? (
            <SavedPanel
              focusId={savedFocus}
              canGoHere={mode !== "bus"}
              onStartFrom={(place) => {
                edit({ type: "startSet", start: { by: "saved", place } });
                setFlyTo(place.coord);
                setSavedOpen(false);
              }}
              onGoHere={(place) => {
                edit({
                  type: "pointChosen",
                  point: { coord: place.coord, name: place.name },
                });
                setSavedOpen(false);
              }}
              onClose={() => setSavedOpen(false)}
              notice={savedNotice}
            />
          ) : (
            <ModePanel
              mode={mode}
              onModeChange={(m) => edit({ type: "modeChanged", mode: m })}
              resorts={resorts.data ?? []}
              selectedResortId={selectedResortId}
              onSelectResort={chooseResort}
              hasOrigin={origin !== null}
              durations={durations}
              tripFirst={tripStops.length > 0}
              placeStrip={
                <TripPanel
                  stops={tripStops}
                  addStopRef={addStopRef}
                  near={viewCentre}
                  onRemoveStop={(key) => edit({ type: "stopRemoved", key })}
                  onMoveStop={(key, by) => edit({ type: "stopMoved", key, by })}
                  onFillStop={(key, place) =>
                    edit({ type: "stopFilled", key, place })
                  }
                  addDestination={
                    canAddStop && (
                      <AddDestinationButton
                        ref={addStopRef}
                        onClick={() => {
                          // the stop box lives in the trip list, which Saved replaces
                          setSavedOpen(false);
                          edit({ type: "stopAdded", place: null });
                        }}
                      />
                    )
                  }
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
                  onlyResortId={onlyResortId}
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
                  freeOnly={freeOnly}
                  onFreeOnlyChange={(on) => {
                    setFreeOnly(on);
                    if (on) edit({ type: "paidBusesHidden" });
                  }}
                  departAt={departAt}
                  onDepartAtChange={setDepartAt}
                  selected={busChoice}
                  onSelect={(bus) => edit({ type: "busTapped", bus })}
                  // only once the walk to the stop is known: it is the first leg
                  onStart={
                    routePending || !pilotAvailable ? undefined : startBusPilot
                  }
                  startNote={busNote}
                />
              }
              // a failed ranking falls back to the plain picker: choosing a resort needs no ranking
              rankingPanel={
                rankingState.status === "error" ? undefined : (
                  <RankingPanel
                    options={rankOptions}
                    onOptionsChange={setRankOptions}
                    ranking={rankingState}
                    fetching={ranking.isFetching}
                    selectedResortId={selectedResortId}
                    onSelectResort={chooseResort}
                  />
                )
              }
            />
          )}
        </BottomSheet>
      )}
      {/* after the sheet in the DOM, so Tab reaches the search box before the map's
          ~20 markers and links (T78); it paints below everything (z-index 0) */}
      <MapView
        slimSheet={slimSheet}
        resorts={resorts.data ?? []}
        // an open stop box is choosing again, and a resort can be tapped as the stop
        shownResortIds={placingStop ? undefined : shownResortIds}
        selectedResortId={selectedResortId}
        origin={origin}
        destination={destinationMarker}
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
          // the open stop box takes the click; it closes the card, as a finger's tap does
          card.close();
          edit({ type: "mapTapped", coord });
        }}
        stops={tripStops.flatMap((st) =>
          st.place ? [{ coord: st.place.coord, name: st.place.name }] : [],
        )}
        placingStop={placingStop}
        card={card.onMap}
        onDropPin={card.dropPin}
        onMapTap={card.close}
        onSelectSkiLine={card.selectLine}
        onSelectResort={(id) => edit({ type: "resortTapped", id })}
        saved={savedMarkers}
        onSelectSaved={(id) => edit({ type: "savedTapped", id })}
      />
      {importCode && (
        <ImportDialog
          code={importCode}
          onDone={(added) => {
            // the URL mirror above already dropped the fragment, so a reload won't ask again
            setImportCode(null);
            if (added) {
              setSavedNotice(added);
              setSavedOpen(true);
            }
          }}
        />
      )}
      {card.view}
      <StampMoment />
    </main>
  );
}
