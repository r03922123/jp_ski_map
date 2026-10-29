import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerLeftUp,
  CornerRightUp,
  type LucideIcon,
  MapPin,
  Merge,
  MoveUpLeft,
  MoveUpRight,
  Navigation,
  RotateCw,
  Ship,
  Undo2,
} from "lucide-react";
import type { Maneuver } from "@/lib/api";

const ICONS: Record<Maneuver, LucideIcon> = {
  depart: Navigation,
  arrive: MapPin,
  straight: ArrowUp,
  "slight-left": ArrowUpLeft,
  left: ArrowLeft,
  "sharp-left": ArrowDownLeft,
  "slight-right": ArrowUpRight,
  right: ArrowRight,
  "sharp-right": ArrowDownRight,
  uturn: Undo2,
  roundabout: RotateCw,
  merge: Merge,
  "ramp-left": CornerLeftUp,
  "ramp-right": CornerRightUp,
  "keep-left": MoveUpLeft,
  "keep-right": MoveUpRight,
  ferry: Ship,
};

export function ManeuverIcon({ maneuver }: { maneuver: Maneuver }) {
  const Icon = ICONS[maneuver] ?? ArrowUp;
  return (
    <Icon
      aria-hidden="true"
      data-maneuver={maneuver}
      className="size-5 shrink-0 text-muted-foreground"
    />
  );
}
