"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { BusPanel } from "@/components/BusPanel";
import { DestinationPicker } from "@/components/DestinationPicker";
import { DrivePanel } from "@/components/DrivePanel";
import { heroPose } from "@/components/HeroMarker";
import { ImportDialog } from "@/components/ImportDialog";
import { ModePanel } from "@/components/ModePanel";
import { PilotScreens } from "@/components/PilotScreens";
import { PinCard } from "@/components/PinCard";
import { PlaceCard } from "@/components/PlaceCard";
import { PoiList } from "@/components/PoiList";
import { SaveButton } from "@/components/SaveButton";
import { SavedPanel } from "@/components/SavedPanel";
import { SearchBox } from "@/components/SearchBox";
import { StampMoment } from "@/components/StampMoment";
import { TitleScreen } from "@/components/TitleScreen";
import {
  AddDestinationButton,
  SavedButton,
  SwapButton,
  TripCard,
} from "@/components/TripCard";
import { DestinationBox, TripPanel } from "@/components/TripPanel";
import { type Bbox, type Coord, resortsQuery } from "@/lib/api";
import { usePilotMap } from "@/lib/nav/use-pilot-map";
import { usePilotSession } from "@/lib/nav/use-pilot-session";
import { placeAt, useSaved, visibleMarkers } from "@/lib/saved-places";
import { pinPlace, tripActions } from "@/lib/trip-actions";
import { pointPlaceOf, tripPlaces } from "@/lib/trip-places";
import { DEFAULT_RANK, type RankOptions } from "@/lib/url-state";
import { useBusTrip } from "@/lib/use-bus-trip";
import { useLodging, usePois, useRanking } from "@/lib/use-lists";
import { useModeDurations, useRoutes } from "@/lib/use-routes";
import { type TripPoint, useTrip } from "@/lib/use-trip";
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
    selectedResortId,
    category,
    poiId,
    point,
    storedBusChoice,
    setBusChoice,
    filledStops,
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
  // T5: what an import added, shown at the top of Saved until it closes
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<Coord | null>(null);
  const [view, setView] = useState<{ bbox: Bbox; zoom: number } | null>(null);
  const [rankOptions, setRankOptions] = useState<RankOptions>(DEFAULT_RANK);
  useViewUrl({ trip, rankOptions, setRankOptions, setImportCode });

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

  // where drive and walk go; a Food or Konbini list picks its place per mode
  const tripTarget = point?.coord ?? (poiCategory ? poiTarget : destination);
  const target = mode === "bus" ? busStop : tripTarget;
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
  // the tabs' times need one place for every mode: a Food or Konbini list picks its place per
  // mode, and Drive heads for the ranking's nearest entrance, so a resort with several waits
  // for this start's ranking (cached, so every mode then uses that entrance; a placeholder is
  // the previous start's)
  const sharedTarget =
    point !== null ||
    (!poiCategory &&
      ((resort?.accessPoints.length ?? 0) <= 1 ||
        (ranking.data !== undefined && !ranking.isPlaceholderData)));
  const durations = useModeDurations({
    origin,
    target: sharedTarget ? tripTarget : null,
    viaStops: filledStops.map((s) => s.coord),
  });

  const routeData = routeState.status === "success" ? routeState.data : null;

  const session = usePilotSession({
    mode,
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
    ...trip,
    routeMode,
    pointPlace,
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
  const actions = tripActions(trip, {
    resorts: resorts.data,
    fromPlace,
    toPlace,
    placingStop,
    savedState,
    setFlyTo,
    setSavedOpen,
    setSavedFocus,
    setDroppedPin,
  });
  const savedMarkers = useMemo(() => visibleMarkers(savedState), [savedState]);
  const addStopRef = useRef<HTMLButtonElement>(null);
  const pinCard = droppedPin && (
    <PinCard
      name={droppedPin.name}
      onClose={() => setDroppedPin(null)}
      onStart={() => actions.pinStart(droppedPin)}
      onGo={
        // Bus has no "go here": its destination comes from the swap or another tab
        mode === "bus" ? undefined : () => actions.pinGo(droppedPin)
      }
      onAddStop={canAddStop ? () => actions.pinAddStop(droppedPin) : undefined}
      save={
        // a saved place at that spot (My hotel's lodging pin) is that place, not a new pin
        <SaveButton
          place={placeAt(savedState, droppedPin.coord) ?? pinPlace(droppedPin)}
        />
      }
    />
  );
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
                  // remounted (emptied) when the trip panel's ✕ clears the start
                  key={searchKey}
                  // the rail and ⇅ narrow this box in two bars (T78)
                  placeholder={showToBox ? "Search a start" : undefined}
                  searchIcon={!showToBox}
                  // the top card reads From → To (BC-L1): never blank while there is a start
                  label={searchLabel ?? fromPlace?.name ?? null}
                  onSelect={actions.searchStart}
                  onClear={actions.clearOrigin}
                  near={viewCentre}
                />
              }
              to={
                <DestinationBox
                  to={toPlace}
                  near={viewCentre}
                  onChoose={actions.chooseTo}
                  onClear={actions.clearTo}
                />
              }
              swap={
                <SwapButton disabled={!canSwap} onClick={actions.swapTrip} />
              }
              saveDestination={toPlace && <SaveButton place={toPlace} />}
              placeCard={
                fromPlace &&
                !destinationLoading && (
                  <PlaceCard
                    place={fromPlace}
                    showLists={mode !== "bus"}
                    category={category}
                    onDirections={actions.directionsTo}
                    onCategory={actions.pickCategory}
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
          revealKey={routeKey}
          raiseKey={`${savedOpen}|${category ?? ""}|${mode}`}
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
              onStartFrom={actions.startFrom}
              onGoHere={actions.goTo}
              onClose={() => {
                setSavedOpen(false);
                setSavedNotice(null);
              }}
              notice={savedNotice}
            />
          ) : (
            <ModePanel
              mode={mode}
              onModeChange={actions.changeMode}
              resorts={resorts.data ?? []}
              selectedResortId={selectedResortId}
              onSelectResort={actions.selectResort}
              hasOrigin={origin !== null}
              durations={durations}
              tripFirst={mode !== "bus" && tripStops.length > 0}
              placeStrip={
                <TripPanel
                  from={fromPlace}
                  stops={mode === "bus" ? [] : tripStops}
                  addStopRef={addStopRef}
                  near={viewCentre}
                  onRemoveStop={actions.removeStop}
                  onMoveStop={actions.moveStop}
                  onFillStop={fillStop}
                  onClearFrom={actions.clearFrom}
                  addDestination={
                    canAddStop && (
                      <AddDestinationButton
                        ref={addStopRef}
                        onClick={actions.addStop}
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
                      onClear: actions.clearTo,
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
                  onChange={actions.pickCategory}
                />
              }
              poiPanel={
                poiCategory ? (
                  <PoiList
                    state={poiState}
                    selectedId={poiId}
                    onSelect={actions.selectPoi}
                  />
                ) : undefined
              }
              drivePanel={
                <DrivePanel
                  options={rankOptions}
                  onOptionsChange={setRankOptions}
                  ranking={rankingState}
                  selectedResortId={selectedResortId}
                  onSelectResort={actions.selectResort}
                />
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
        onPickOrigin={actions.pickOnMap}
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
        onSelectResort={actions.selectResortOnMap}
        saved={savedMarkers}
        onSelectSaved={actions.selectSaved}
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
      <StampMoment />
      <TitleScreen />
    </main>
  );
}
