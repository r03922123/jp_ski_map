/**
 * Original pixel art, defined in code (SPEC-game-theme). A frame is rows of characters:
 * "." is transparent, any other character is a key in the sprite's palette.
 * Hero frames are composed from layers (head, torso, legs, board) so every pose is the
 * same rider; tests check every row's width and every key.
 */

export type Frame = string[];
export type Sprite = {
  w: number;
  h: number;
  palette: Record<string, string>;
  frames: Frame[];
};
export type Pose = "idle" | "walk" | "ride" | "bus" | "drive";

export const POSE_FRAMES: Record<Pose, number> = {
  idle: 2,
  walk: 4,
  ride: 2,
  bus: 2,
  drive: 2,
};

export const HERO_PALETTE = {
  k: "#22223a", // outline
  p: "#ffffff", // pom
  b: "#d94a3d", // beanie (and bus stripe)
  g: "#f2b134", // goggle lens
  s: "#f1c7a0", // skin
  o: "#f08a24", // jacket
  O: "#c9661a", // jacket shade
  n: "#2c3e6b", // pants
  B: "#3a2f2f", // boots
  t: "#2bb3a3", // board
  T: "#1d7f74", // board shade
  w: "#ffffff", // snow spray
  y: "#f6d55c", // shuttle / car body
  Y: "#d9a93a", // body shade
  c: "#9cc9e6", // glass
  h: "#8a8a9a", // wheel hub
} as const;

const W = 24;

/** Rows `from` onward of a W-wide layer; shorter strings are padded with "." */
function layer(from: number, rows: string[], width = W): Frame {
  const out = Array.from({ length: width === W ? W : width }, () =>
    ".".repeat(width),
  );
  rows.forEach((r, i) => {
    out[from + i] = r.padEnd(width, ".");
  });
  return out;
}

/** Later layers draw over earlier ones, except where they are transparent. */
function stack(...layers: Frame[]): Frame {
  return layers[0].map((_, y) =>
    Array.from(layers[0][y], (_, x) => {
      for (let i = layers.length - 1; i >= 0; i--) {
        const ch = layers[i][y][x];
        if (ch !== ".") return ch;
      }
      return ".";
    }).join(""),
  );
}

function shift(frame: Frame, dy: number): Frame {
  const blank = ".".repeat(frame[0].length);
  return frame.map((_, y) => frame[y - dy] ?? blank);
}

export function mirror(frame: Frame): Frame {
  return frame.map((row) => Array.from(row).reverse().join(""));
}

// --- hero layers (facing right) ---------------------------------------------------

const HEAD = layer(0, [
  "",
  "..........kkk",
  ".........kpppk",
  "..........kkk",
  ".........kbbbbk",
  "........kbbbbbbk",
  "........kbbbbbbk",
  ".......kkkkkkkkkk",
  "........kssskgggk",
  "........ksssskkkk",
  ".........kssssk",
]);

const TORSO = layer(11, [
  "........kooooook",
  ".......kooooooook",
  "......koOoooooOook",
  "......kskooooooksk",
  ".......kkoooooookk",
]);

const TORSO_ARMS_OUT = layer(11, [
  "........kooooook",
  ".....kkkooooooookkk",
  "...kkoooOoooooOooookk",
  "...kk..kooooooook..kk",
  ".......kkoooooookk",
]);

const LEGS_BENT = layer(16, [
  "........knnnnnnnk",
  ".......knnnnknnnnk",
  ".......knnnk.knnnk",
  "......kBBBk...kBBBk",
]);

const BOARD = layer(20, [
  "..kkkkkkkkkkkkkkkkkkkk",
  ".kttttttttttttttttttttk",
  "..kTTTTTTTTTTTTTTTTTTk",
  "...kkkkkkkkkkkkkkkkkk",
]);

const SPRAY = [
  layer(16, ["w", ".w.w", "w.w", ".w"]),
  layer(16, [".w", "w..w", ".w.w", "w"]),
];

const LEGS_STRIDE = layer(16, [
  "........knnnnnnnk",
  ".......knnnkknnnk",
  "......knnnk..knnnk",
  ".....knnnk....knnnk",
  ".....knnk......knnk",
  "....kBBBk......kBBBk",
  "....kBBBBk.....kBBBBk",
  ".....kkkk.......kkkk",
]);

const LEGS_PASS = layer(16, [
  "........knnnnnnnk",
  ".........knnnnnk",
  ".........knnnnnk",
  ".........knnknnk",
  ".........knnknnk",
  "........kBBBkBBBk",
  "........kBBBkBBBBk",
  ".........kkkkkkkk",
]);

/** The board carried on the back while walking (drawn behind the body). */
const BACK_BOARD = layer(2, [
  "....kk",
  ...Array.from({ length: 17 }, () => "...kttk"),
  "....kk",
]);

const UPPER = stack(HEAD, TORSO);
const UPPER_ARMS_OUT = stack(HEAD, TORSO_ARMS_OUT);

// --- vehicles with the rider inside ------------------------------------------------

const BUS_BODY = layer(3, [
  "..kkkkkkkkkkkkkkkkkkkk",
  ".kyyyyyyyyyyyyyyyyyyyyk",
  ".kykkkkkkkkkkkkkkkkkkyk",
  ".kykcccckccckbbbkccckyk",
  ".kykcccckccckgggkccckyk",
  ".kykcccckccckssskccckyk",
  ".kykkkkkkkkkkkkkkkkkkyk",
  ".kyyyyyyyyyyyyyyyyyyyyk",
  ".kbbbbbbbbbbbbbbbbbbbbk",
  ".kyyyyyyyyyyyyyyyyyyyyk",
  ".kYYYYYYYYYYYYYYYYYYYYk",
  "..kkkkkkkkkkkkkkkkkkkk",
  "....kkk.........kkk",
  "...khhhk.......khhhk",
]);

const CAR_BODY = layer(3, [
  "",
  "......ktttttttttttk",
  ".......k...k...k",
  "......kkkkkkkkkkkk",
  ".....kycccckbbbkccck",
  "....kyycccckgggkcccyk",
  "...kyyyyyyyyyyyyyyyyyyk",
  "..kyyyyyyyyyyyyyyyyyyyyk",
  "..kYYYYYYYYYYYYYYYYYYYYk",
  "...kkkkkkkkkkkkkkkkkkkk",
  ".....kkk.........kkk",
  "....khhhk.......khhhk",
]);

const wheels = (from: number, left: number, right: number, spoke: string) =>
  layer(from, [
    `${".".repeat(left)}k${spoke}k${".".repeat(right - left - 5)}k${spoke}k`,
    `${".".repeat(left)}khhhk${".".repeat(right - left - 5)}khhhk`,
    `${".".repeat(left + 1)}kkk${".".repeat(right - left - 3)}kkk`,
  ]);

const ROAD = layer(22, ["w.w.w.w.w.w.w.w.w.w.w.w."]);
const ROAD_2 = layer(22, [".w.w.w.w.w.w.w.w.w.w.w.w"]);

export const HERO: Record<Pose, Sprite> = {
  idle: {
    w: W,
    h: W,
    palette: HERO_PALETTE,
    frames: [
      stack(LEGS_BENT, BOARD, UPPER),
      stack(LEGS_BENT, BOARD, shift(UPPER, 1)),
    ],
  },
  walk: {
    w: W,
    h: W,
    palette: HERO_PALETTE,
    frames: [
      stack(BACK_BOARD, LEGS_STRIDE, UPPER),
      stack(BACK_BOARD, LEGS_PASS, shift(UPPER, 1)),
      stack(BACK_BOARD, mirror(LEGS_STRIDE), UPPER),
      stack(BACK_BOARD, mirror(LEGS_PASS), shift(UPPER, 1)),
    ],
  },
  ride: {
    w: W,
    h: W,
    palette: HERO_PALETTE,
    frames: [
      stack(SPRAY[0], LEGS_BENT, BOARD, shift(UPPER_ARMS_OUT, 1)),
      stack(SPRAY[1], LEGS_BENT, BOARD, shift(UPPER_ARMS_OUT, 2)),
    ],
  },
  bus: {
    w: W,
    h: W,
    palette: HERO_PALETTE,
    frames: [
      stack(BUS_BODY, wheels(17, 3, 15, "hkh"), ROAD),
      stack(BUS_BODY, wheels(17, 3, 15, "khk"), ROAD_2),
    ],
  },
  drive: {
    w: W,
    h: W,
    palette: HERO_PALETTE,
    frames: [
      stack(CAR_BODY, wheels(16, 4, 16, "hkh"), ROAD),
      stack(CAR_BODY, wheels(16, 4, 16, "khk"), ROAD_2),
    ],
  },
};

// --- map icons (16×16) -------------------------------------------------------------

export const ICON_PALETTE = {
  k: "#22223a",
  p: "#ffffff",
  c: "#d5ebf7", // ice
  w: "#ffffff",
  e: "#6b7a8f", // rock
  b: "#d94a3d",
  y: "#f6d55c",
  t: "#2bb3a3",
  o: "#f08a24",
  g: "#2f5d50", // pine
} as const;

const I = 16;
const icon = (rows: string[]): Sprite => ({
  w: I,
  h: I,
  palette: ICON_PALETTE,
  frames: [layer(0, rows, I)],
});

export const ICONS = {
  /** A resort "world": a snowy peak over a number plate (digits drawn on top, rows 9–13). */
  world: icon([
    "..kkkkkkkkkkkk",
    ".kcccccccccccck",
    "kcccccckkcccccck",
    "kccccckwwkccccck",
    "kcccckwwwwkcccck",
    "kccckwwkwwwkccck",
    "kcckeeeeeeeekcck",
    "kckeeeeeeeeeekck",
    "kkeeeeeeeeeeeekk",
    "kppppppppppppppk",
    "kppppppppppppppk",
    "kppppppppppppppk",
    "kppppppppppppppk",
    "kppppppppppppppk",
    ".kppppppppppppk",
    "..kkkkkkkkkkkk",
  ]),
  stop: icon([
    "....kkkkkkk",
    "...kbbbbbbbk",
    "..kbbpppppbbk",
    "..kbpkkkkkpbk",
    "..kbpkcckckpbk",
    "..kbpkkkkkkpbk",
    "..kbppkpkppbk",
    "..kbbpppppbbk",
    "...kbbbbbbbk",
    "....kkkkkkk",
    ".......kk",
    ".......kk",
    ".......kk",
    ".......kk",
    ".....kkkkkk",
  ]),
  konbini: icon([
    "",
    "..kkkkkkkkkkkk",
    ".kbbbbbbbbbbbbk",
    ".kpbpbpbpbpbpbk",
    "..kkkkkkkkkkkk",
    "..kttttttttttk",
    "..kppppppppppk",
    "..kpcckpkcckpk",
    "..kpcckpkcckpk",
    "..kpkkkpkkkkpk",
    "..kppppppppppk",
    "..kkkkkkkkkkkk",
  ]),
  food: icon([
    "",
    ".....w..w",
    "....w..w",
    ".....w..w",
    "........k..k",
    ".......k..k",
    "..kkkkkkkkkkkk",
    ".kyyyyyyyyyyyyk",
    ".kbbbbbbbbbbbbk",
    "..kbbbbbbbbbbk",
    "...kbbbbbbbbk",
    "....kkkkkkkk",
  ]),
  star: icon([
    "",
    ".......kk",
    "......kyyk",
    "......kyyk",
    ".....kyyyyk",
    "kkkkkkyyyykkkkkk",
    ".kyyyyyyyyyyyyk",
    "..kyyyyyyyyyyk",
    "...kyyyyyyyyk",
    "...kyyyyyyyyk",
    "..kyyyykkyyyyk",
    "..kyyyk..kyyyk",
    ".kyyk......kyyk",
    ".kkk........kkk",
  ]),
  flag: icon([
    "",
    "..kk",
    "..kkkkkkkk",
    "..kkbbbbbbkk",
    "..kkbbbbbbbbkk",
    "..kkbbbbbbbbbbk",
    "..kkbbbbbbbbkk",
    "..kkbbbbbbkk",
    "..kkkkkkkk",
    "..kk",
    "..kk",
    "..kk",
    "..kk",
    "..kk",
    "kkkkkk",
  ]),
} satisfies Record<string, Sprite>;

/** A 3×5 pixel font for world numbers on the badge. */
export const DIGITS: Record<string, Frame> = {
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", ".##", "..#", "###"],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"],
  "7": ["###", "..#", ".#.", ".#.", ".#."],
  "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"],
};

/** The world badge with its number drawn on the plate. */
export function worldBadge(n: number): Sprite {
  const digits = String(n).split("");
  const width = digits.length * 4 - 1;
  const left = Math.floor((I - width) / 2);
  const plate = ICONS.world.frames[0].map((row, y) => {
    if (y < 9 || y > 13) return row;
    const chars = Array.from(row);
    digits.forEach((d, i) => {
      Array.from(DIGITS[d][y - 9]).forEach((px, x) => {
        if (px === "#") chars[left + i * 4 + x] = "k";
      });
    });
    return chars.join("");
  });
  return { ...ICONS.world, frames: [plate] };
}
