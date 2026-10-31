import type { Sprite } from "@/lib/game/sprites";

/** RGBA pixels of one frame, each sprite pixel a `scale`×`scale` block. MapLibre's
 *  `addImage` and a canvas's `putImageData` both take this shape. */
export type Pixels = {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
};

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function pixels(
  sprite: Sprite,
  frame = 0,
  scale = 1,
  mirrored = false,
): Pixels {
  const width = sprite.w * scale;
  const height = sprite.h * scale;
  const data = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  const rows = sprite.frames[frame];
  for (let y = 0; y < sprite.h; y++) {
    for (let x = 0; x < sprite.w; x++) {
      const ch = rows[y][mirrored ? sprite.w - 1 - x : x];
      if (ch === ".") continue;
      const [r, g, b] = rgb(sprite.palette[ch]);
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = ((y * scale + dy) * width + x * scale + dx) * 4;
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = 255;
        }
      }
    }
  }
  return { width, height, data };
}

const cache = new Map<string, HTMLCanvasElement>();

/** A canvas holding one frame, drawn once and reused (no per-frame drawing). */
export function spriteCanvas(
  key: string,
  sprite: Sprite,
  frame: number,
  scale: number,
  mirrored = false,
): HTMLCanvasElement {
  const id = `${key}:${frame}:${scale}:${mirrored}`;
  const hit = cache.get(id);
  if (hit) return hit;
  const px = pixels(sprite, frame, scale, mirrored);
  const canvas = document.createElement("canvas");
  canvas.width = px.width;
  canvas.height = px.height;
  canvas
    .getContext("2d")
    ?.putImageData(new ImageData(px.data, px.width, px.height), 0, 0);
  cache.set(id, canvas);
  return canvas;
}
