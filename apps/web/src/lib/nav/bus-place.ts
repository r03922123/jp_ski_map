/**
 * The shuttle list on screen is either resorts or a place (SPEC-web-app v1.11). A chosen
 * bus only means something while the list it came from is showing: a way-back shuttle
 * has no resort, and its stop isn't where any resort is.
 */
export function busChoiceFor<T extends { resortId: string | null }>(
  choice: T | null,
  hasPlace: boolean,
): T | null {
  return choice && (choice.resortId === null) === hasPlace ? choice : null;
}

const PLACEHOLDER_NAMES = new Set(["Dropped pin", "Chosen place"]);

/** A place's name for matching it to its own bus stop, or null when it has no real name. */
export function stopMatchName(name: string | null | undefined): string | null {
  return name && !PLACEHOLDER_NAMES.has(name) ? name : null;
}
