import { spriteIcon } from "@/lib/game/sprite-icon";

// Served at /icon/192 and /icon/512; app/manifest.ts points at these paths
export function generateImageMetadata() {
  return [192, 512].map((n) => ({
    id: String(n),
    size: { width: n, height: n },
    contentType: "image/png",
  }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  return spriteIcon(Number(await id));
}
