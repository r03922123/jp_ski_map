import { ImageResponse } from "next/og";
import { HERO } from "@/lib/game/sprites";

export const ICON_BACKGROUND = "#2c3e6b"; // navy (it was the title screen's, removed in web-app v1.30)

/** The idle rider on navy, as a square PNG for the home screen (SPEC-web-app v1.16). */
export function spriteIcon(size: number): ImageResponse {
  const { palette, frames } = HERO.idle;
  const frame = frames[0];
  // ~70% of the square, so iOS corner rounding and Android masks don't clip the rider
  const px = Math.floor((size * 0.7) / frame.length);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: ICON_BACKGROUND,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        {frame.map((row, y) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are fixed pixel art
          <div key={y} style={{ display: "flex" }}>
            {[...row].map((c, x) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: columns are fixed pixel art
                key={x}
                style={{
                  width: px,
                  height: px,
                  background: palette[c] ?? "transparent",
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>,
    { width: size, height: size },
  );
}
