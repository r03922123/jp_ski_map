import type { Step } from "@/lib/api";
import type { PreparedRoute, Projection } from "@/lib/nav/project";

/** Show the maneuver after the next one ("Then ↱") when it follows this closely. */
const THEN_WITHIN_M = 300;

export type UpcomingManeuver = {
  maneuver: Step["maneuver"];
  instruction: string;
  streetNames: string[];
  /** from the user to where the maneuver happens */
  distanceM: number;
};

export type Guidance = {
  remainingM: number;
  remainingS: number;
  stepIndex: number;
  next: UpcomingManeuver | null;
  /** the maneuver after `next` when it follows closely (shown as "Then ↱") */
  after: Pick<UpcomingManeuver, "maneuver" | "instruction"> | null;
};

/** The step whose shape contains segment `index` (the last step once past the end). */
export function stepAt(r: PreparedRoute, index: number): number {
  const steps = r.route.steps;
  const found = steps.findIndex(
    (s) => s.shapeRange[0] <= index && index < s.shapeRange[1],
  );
  return found >= 0 ? found : Math.max(0, steps.length - 1);
}

/**
 * Distance and time left, and what to do next. Time left is the unfinished share of
 * the current step's Valhalla time plus every later step's, so it uses the router's
 * per-road speeds rather than one average speed.
 */
export function progress(r: PreparedRoute, p: Projection): Guidance {
  const steps = r.route.steps;
  const remainingM = Math.max(0, r.totalM - p.alongM);
  if (steps.length === 0) {
    // a line with no maneuvers (the bus line): distance only, time pro rata
    const share = r.totalM > 0 ? remainingM / r.totalM : 0;
    const remainingS = r.route.durationS * share;
    return { remainingM, remainingS, stepIndex: 0, next: null, after: null };
  }
  const si = stepAt(r, p.index);
  const step = steps[si];
  const begin = r.cum[step.shapeRange[0]];
  const end = r.cum[step.shapeRange[1]];
  const left = end > begin ? (end - p.alongM) / (end - begin) : 0;
  const later = steps.slice(si + 1).reduce((sum, s) => sum + s.durationS, 0);
  const remainingS = step.durationS * Math.min(1, Math.max(0, left)) + later;

  const nextStep = steps[si + 1];
  const next: UpcomingManeuver | null = nextStep
    ? {
        maneuver: nextStep.maneuver,
        instruction: nextStep.instruction,
        streetNames: nextStep.streetNames,
        distanceM: Math.max(0, r.cum[nextStep.shapeRange[0]] - p.alongM),
      }
    : null;
  const afterStep = steps[si + 2];
  const after =
    nextStep &&
    afterStep &&
    r.cum[afterStep.shapeRange[0]] - r.cum[nextStep.shapeRange[0]] <=
      THEN_WITHIN_M
      ? { maneuver: afterStep.maneuver, instruction: afterStep.instruction }
      : null;

  return {
    remainingM,
    remainingS,
    stepIndex: si,
    next,
    after,
  };
}
