import type { SafeInsets } from "@/lib/route-geo";

/**
 * The status bar's and home indicator's heights in px (SPEC-web-app v1.19), for the camera
 * fit. CSS custom properties don't resolve env() in getComputedStyle, so a probe element
 * pads itself with them and reports the result. 0 on the server and in a Safari tab.
 */
export function safeInsets(): SafeInsets {
  if (typeof document === "undefined") return { top: 0, bottom: 0 };
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;padding:var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left)";
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const insets = {
    top: Number.parseFloat(style.paddingTop) || 0,
    bottom: Number.parseFloat(style.paddingBottom) || 0,
    left: Number.parseFloat(style.paddingLeft) || 0,
    right: Number.parseFloat(style.paddingRight) || 0,
  };
  probe.remove();
  return insets;
}

/**
 * How far the page's viewport falls short of the screen, up to the status bar's height
 * (SPEC-web-app v1.20). An iPhone home-screen app with a black-translucent status bar lays
 * the page out one status bar shorter than the screen, leaving a band below every
 * `fixed inset-0` layer. 0 wherever the viewport fills the screen, and in a Safari tab.
 */
export function viewportGap({
  screenW,
  screenH,
  innerW,
  innerH,
  safeTop,
}: {
  screenW: number;
  screenH: number;
  innerW: number;
  innerH: number;
  safeTop: number;
}): number {
  // iOS keeps screen.width/height in portrait order; match the page's orientation
  const landscape = innerW > innerH;
  const [screenWide, screenTall] = landscape
    ? [Math.max(screenW, screenH), Math.min(screenW, screenH)]
    : [Math.min(screenW, screenH), Math.max(screenW, screenH)];
  // a window narrower than the screen (iPad Split View) isn't full screen: no gap
  if (innerW !== screenWide) return 0;
  return Math.min(Math.max(screenTall - innerH, 0), safeTop);
}

/** Keeps --viewport-gap on <html> current; returns the cleanup. */
export function trackViewportGap(): () => void {
  const update = () =>
    document.documentElement.style.setProperty(
      "--viewport-gap",
      `${viewportGap({
        screenW: screen.width,
        screenH: screen.height,
        innerW: innerWidth,
        innerH: innerHeight,
        // iOS only (navigator.standalone): Android's screen also counts its nav bar
        safeTop:
          "standalone" in navigator && navigator.standalone === true
            ? safeInsets().top
            : 0,
      })}px`,
    );
  update();
  // orientationchange too: resize may come before the new safe-area inset applies
  addEventListener("resize", update);
  addEventListener("orientationchange", update);
  return () => {
    removeEventListener("resize", update);
    removeEventListener("orientationchange", update);
  };
}
