import type { MetadataRoute } from "next";
import { ICON_BACKGROUND } from "@/lib/game/sprite-icon";

// SPEC-web-app v1.16: Add to Home Screen opens the app in its own window, without browser
// bars. No service worker: offline mode is still "Ask first".
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hakuba Ski Map",
    short_name: "Hakuba",
    description:
      "Bus, drive and walk to Hakuba Valley ski resorts from your hotel",
    start_url: "/",
    display: "standalone",
    background_color: ICON_BACKGROUND,
    theme_color: "#eef3f7",
    icons: [192, 512].map((n) => ({
      src: `/icon/${n}`,
      sizes: `${n}x${n}`,
      type: "image/png",
    })),
  };
}
