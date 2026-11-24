import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hakuba Ski Map",
  description: "Bus and walk to Hakuba Valley ski resorts from your hotel",
  // shared by link with friends, not listed: strangers would spend the free upstreams' budgets
  robots: { index: false, follow: false },
  // SPEC-web-app v1.16: the home-screen icon opens full screen on iOS
  // Request edge-to-edge map content when launched from the iPhone Home Screen.
  appleWebApp: {
    capable: true,
    title: "Hakuba",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#eef3f7",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Browsers tag <html> before React hydrates (Chrome on iOS adds
    // __gcrremoteframetoken): ignore attribute differences on this element only.
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
