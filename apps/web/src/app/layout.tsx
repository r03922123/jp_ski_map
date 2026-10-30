import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hakuba Ski Map",
  description:
    "Bus, drive and walk to Hakuba Valley ski resorts from your hotel",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Browsers tag <html> before React hydrates (Chrome on iOS adds
    // __gcrremoteframetoken): ignore attribute differences on this element only.
    <html
      lang="en"
      className={`${geistSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
