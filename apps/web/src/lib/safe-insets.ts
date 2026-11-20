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
