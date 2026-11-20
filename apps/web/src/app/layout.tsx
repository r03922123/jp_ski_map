import type { Metadata, Viewport } from "next";
import { DotGothic16 } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

// SPEC-game-theme: a pixel font that also covers Japanese (stop and hotel names). Self-hosted
// at build; Japanese glyphs load on demand by unicode-range.
const pixelFont = DotGothic16({
  variable: "--font-sans",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hakuba Ski Map",
  description:
    "Bus, drive and walk to Hakuba Valley ski resorts from your hotel",
  // shared by link with friends, not listed: strangers would spend the free upstreams' budgets
  robots: { index: false, follow: false },
  // SPEC-web-app v1.16: the home-screen icon opens full screen on iOS
  // v1.19: the home-screen app draws under the status bar (white clock, see the fade below)
  appleWebApp: {
    capable: true,
    title: "Hakuba",
    statusBarStyle: "black-translucent",
  },
};

// v1.19: the page runs under the status bar and home indicator; --safe-* keep controls out
export const viewport: Viewport = { viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Browsers tag <html> before React hydrates (Chrome on iOS adds
    // __gcrremoteframetoken): ignore attribute differences on this element only.
    <html
      lang="en"
      className={`${pixelFont.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="h-full">
        <Providers>{children}</Providers>
        {/* keeps the white status-bar clock readable over a light map (v1.19) */}
        <div
          aria-hidden="true"
          data-status-fade
          className="pointer-events-none fixed inset-x-0 top-0 z-50 h-(--safe-top) bg-linear-to-b from-black/55 via-black/40 via-70% to-transparent"
        />
      </body>
    </html>
  );
}
