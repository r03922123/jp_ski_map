import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import type { SkiLine, SkiLineFeature } from "@/components/map/SkiLinesLayer";
import { ResortCard } from "@/components/ResortCard";
import { SkiLineCard } from "@/components/SkiLineCard";
import { type Coord, type Resort, skiLinesQuery } from "@/lib/api";
import type { CameraWishes } from "@/lib/map-camera";
import { routeBounds } from "@/lib/route-geo";
import { resortSummary } from "@/lib/ski-stats";
import type { TripPoint } from "@/lib/use-trip";

/**
 * What the map's one card is about: a dropped pin (or a tapped hotel pin), whose buttons are
 * touch's only way to edit the trip (docs/ux/behaviour-cards.md BC-A1); a tapped run or lift
 * (SPEC-ski-runs v1.1) with the point picked on its height profile (v1.4); or a resort (v1.4).
 * A pick replaces it whole, so the profile's point goes with its card.
 */
export type Picked =
  | { kind: "pin"; pin: TripPoint }
  | { kind: "line"; line: SkiLine; ring: Coord | null }
  // fromCard: opened from the run or lift card's resort name, which unmounts with it
  | { kind: "resort"; resortId: string; fromCard: boolean };

/**
 * What the open card puts on the map (MapView's `card`): Google's red pin, or the run, lift
 * or resort outlined, with the profile's ring, and the frame of its whole lines once they
 * have loaded (v1.5).
 */
export type CardOnMap =
  | { kind: "pin"; at: Coord }
  | { kind: "line"; id: string; ring: Coord | null; frame: SkiFrame | null }
  | { kind: "resort"; id: string; frame: SkiFrame | null };

type SkiFrame = NonNullable<CameraWishes["ski"]>;

type Shown = { card: Picked; lines: SkiLineFeature[]; onMap: CardOnMap };

/**
 * The card as this render shows it: what it puts on the map, and the whole lines it is about
 * (its run or lift, or all its resort's), none until the ski-lines query has loaded. While
 * navigating no card shows.
 */
export function shownCard(
  picked: Picked | null,
  { lines = [], piloting }: { lines?: SkiLineFeature[]; piloting: boolean },
): Shown | null {
  if (piloting || !picked) return null;
  if (picked.kind === "pin")
    return {
      card: picked,
      lines: [],
      onMap: { kind: "pin", at: picked.pin.coord },
    };
  const id = picked.kind === "line" ? picked.line.id : picked.resortId;
  const own = lines.filter((f) =>
    picked.kind === "line"
      ? f.properties.id === id
      : f.properties.resortId === id,
  );
  // whole, unlike a tap's tile-clipped geometry; an area frames by its outline
  const frame =
    own.length > 0
      ? {
          key: picked.kind === "line" ? id : `resort:${id}`,
          bounds: routeBounds(
            own.flatMap((f) =>
              f.geometry.type === "LineString"
                ? f.geometry.coordinates
                : f.geometry.coordinates[0],
            ),
          ),
        }
      : null;
  return {
    card: picked,
    lines: own,
    onMap:
      picked.kind === "line"
        ? { kind: "line", id, ring: picked.ring, frame }
        : { kind: "resort", id, frame },
  };
}

/**
 * The map's one card: which is open, the whole ski lines it reads, what it puts on the map,
 * and the card to render. A pin card's buttons edit the trip, so the caller draws it.
 */
export function useMapCard({
  resorts,
  piloting,
  pinCard,
}: {
  resorts: Resort[] | undefined;
  piloting: boolean;
  pinCard: (pin: TripPoint, close: () => void) => ReactNode;
}) {
  const [picked, setPicked] = useState<Picked | null>(null);
  // the whole lines, for the ski cards' profile, resort sums and frame (v1.4, v1.5); asked
  // for when the first one opens, then kept (a disabled query still hands back what it has)
  const skiLines = useQuery({
    ...skiLinesQuery,
    enabled: picked !== null && picked.kind !== "pin",
  });
  const shown = shownCard(picked, {
    lines: skiLines.data?.features,
    piloting,
  });
  const close = () => setPicked(null);
  const resortOf = (id: string) => resorts?.find((r) => r.id === id);

  function view({ card, lines }: Shown): ReactNode {
    switch (card.kind) {
      case "pin":
        return pinCard(card.pin, close);
      case "line":
        return (
          <SkiLineCard
            // a fresh chart for another line: its picked point was on the old one
            key={card.line.id}
            line={card.line}
            full={lines[0]}
            resortName={
              resortOf(card.line.resortId)?.name.en ?? card.line.resortId
            }
            onResort={() =>
              setPicked({
                kind: "resort",
                resortId: card.line.resortId,
                fromCard: true,
              })
            }
            onClose={close}
            onPoint={(ring) =>
              setPicked((p) =>
                p?.kind === "line" && p.line.id === card.line.id ? { ...p, ring } : p,
              )
            }
          />
        );
      case "resort": {
        const resort = resortOf(card.resortId);
        return (
          resort && (
            <ResortCard
              name={resort.name}
              website={resort.website}
              summary={
                skiLines.data
                  ? resortSummary(lines.map((f) => f.properties))
                  : null
              }
              failed={skiLines.isError}
              focusOnOpen={card.fromCard}
              onClose={close}
            />
          )
        );
      }
    }
  }

  return {
    /** what the open card puts on the map; null with none open or while navigating */
    onMap: shown?.onMap ?? null,
    /** the open card, or null */
    view: shown && view(shown),
    dropPin: (coord: Coord, name: string | null) =>
      setPicked({ kind: "pin", pin: { coord, name } }),
    selectLine: (line: SkiLine) =>
      setPicked({ kind: "line", line, ring: null }),
    /** a tapped resort chip's card, which the trip's rules open */
    openResort: (resortId: string) =>
      setPicked({ kind: "resort", resortId, fromCard: false }),
    close,
  };
}
