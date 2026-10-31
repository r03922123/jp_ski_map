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
};

/** One frame of an in-code pixel sprite (SPEC-game-theme), crisp at any scale. */
export function PixelSprite({
  id,
  sprite,
  frame = 0,
  scale = 2,
  mirrored = false,
  alt,
  className = "",
}: Props) {
  return (
    // biome-ignore lint/performance/noImgElement: a few-hundred-byte data URL drawn in code; next/image has nothing to optimise
    <img
      src={spriteUrl(id, sprite, frame, 1, mirrored)}
      alt={alt}
      width={sprite.w * scale}
      height={sprite.h * scale}
      className={`[image-rendering:pixelated] ${className}`}
    />
  );
}
