/**
 * The Maps look's palette (docs/ux/google-maps-workflows.md T1; SPEC-game-theme v2): light
 * surfaces and blue primary actions. globals.css `:root` uses exactly these values (a test
 * checks), so the contrast test covers what the page really shows.
 */
export const TOKENS = {
  background: "#eef3f7", // snowfield
  foreground: "#22223a", // ink
  card: "#ffffff",
  "card-foreground": "#22223a",
  popover: "#ffffff",
  "popover-foreground": "#22223a",
  primary: "#1967d2", // blue primary actions
  "primary-foreground": "#ffffff",
  secondary: "#e3ebf1",
  "secondary-foreground": "#22223a",
  muted: "#e3ebf1",
  "muted-foreground": "#4a5068",
  accent: "#d5ebf7", // ice
  "accent-foreground": "#22223a",
  destructive: "#b3261e",
  border: "#b8c4ce",
  input: "#b8c4ce",
  ring: "#1967d2", // focus rings need ≥ 3:1 on panels
} as const;

export type Token = keyof typeof TOKENS;

/** Every text colour the theme puts on a background. */
export const TEXT_PAIRS: [Token, Token][] = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["muted-foreground", "muted"],
  ["muted-foreground", "card"],
  ["muted-foreground", "background"],
  ["accent-foreground", "accent"],
  ["destructive", "card"],
  ["primary", "card"],
];

/** Non-text pairs (WCAG 1.4.11): focus rings need 3:1 against what they sit on. */
export const UI_PAIRS: [Token, Token][] = [
  ["ring", "card"],
  ["ring", "background"],
  ["ring", "muted"],
];

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
