import type { Metadata } from "next";
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
};

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
      </body>
    </html>
  );
}
