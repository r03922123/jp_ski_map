import { useSyncExternalStore } from "react";
import { spriteUrl } from "@/lib/game/render";
import type { Sprite } from "@/lib/game/sprites";

type Props = {
  /** cache key: one canvas per key, frame and facing */
  id: string;
  sprite: Sprite;
  frame?: number;
  /** display size in CSS pixels per sprite pixel; the browser scales it up crisply */
  scale?: number;
  mirrored?: boolean;
  /** "" for decoration next to a text label */
  alt: string;
  className?: string;
  /** test and styling hooks, e.g. data-pose */
  data?: Record<`data-${string}`, string | number>;
};

const noop = () => () => {};

/**
 * One frame of an in-code pixel sprite (SPEC-game-theme), crisp at any scale. The data
 * URL needs a canvas, so it only exists in the browser: the server (and hydration) render
 * the image without a source, then React fills it in, with no mismatch.
 */
export function PixelSprite({
  id,
  sprite,
  frame = 0,
  scale = 2,
  mirrored = false,
  alt,
  className = "",
  data,
}: Props) {
  const client = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  return (
    // biome-ignore lint/performance/noImgElement: a few-hundred-byte data URL drawn in code; next/image has nothing to optimise
    <img
      src={client ? spriteUrl(id, sprite, frame, 1, mirrored) : undefined}
      alt={alt}
      width={sprite.w * scale}
      height={sprite.h * scale}
      className={`[image-rendering:pixelated] ${className}`}
      {...data}
    />
  );
}
