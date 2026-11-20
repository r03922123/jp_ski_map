"use client";

import { useCallback, useEffect, useState } from "react";
import { safeInsets } from "@/lib/safe-insets";

// SPEC-web-app v1.21: a diagnostic page for the owner's iPhone. Added to the home screen on
// its own, it shows which viewport numbers iOS reports there, and coloured columns that end
// where each CSS height ends, so one screenshot shows which one reaches the screen's edge.
const COLUMNS = [
  { label: "inset-0", style: { top: 0, bottom: 0 }, color: "#d33" },
  { label: "100vh", style: { top: 0, height: "100vh" }, color: "#e80" },
  { label: "100lvh", style: { top: 0, height: "100lvh" }, color: "#2a2" },
  { label: "100dvh", style: { top: 0, height: "100dvh" }, color: "#26c" },
  { label: "100svh", style: { top: 0, height: "100svh" }, color: "#93c" },
  {
    label: "+safeTop",
    style: { top: 0, bottom: "calc(0px - env(safe-area-inset-top))" },
    color: "#333",
  },
] as const;

function measure() {
  const heights = [...document.querySelectorAll<HTMLElement>("[data-col]")].map(
    (el) =>
      `${el.dataset.col} ${Math.round(el.getBoundingClientRect().height)}`,
  );
  const nav = navigator as Navigator & { standalone?: boolean };
  const s = safeInsets();
  return [
    `standalone: navigator ${String(nav.standalone)}, media ${matchMedia("(display-mode: standalone)").matches}`,
    `screen ${screen.width}×${screen.height}  dpr ${devicePixelRatio}`,
    `inner ${innerWidth}×${innerHeight}  client ${document.documentElement.clientHeight}`,
    `visualViewport ${Math.round(visualViewport?.height ?? -1)}  offsetTop ${Math.round(visualViewport?.offsetTop ?? -1)}`,
    `safe top ${s.top} bottom ${s.bottom} left ${s.left} right ${s.right}`,
    `--viewport-gap ${getComputedStyle(document.documentElement).getPropertyValue("--viewport-gap") || "unset"}`,
    `heights: ${heights.join(", ")}`,
  ];
}

export default function ViewportCheck() {
  const [lines, setLines] = useState<string[]>([]);
  const update = useCallback(() => setLines(measure()), []);

  useEffect(() => {
    update();
    const late = setTimeout(update, 1000); // after iOS settles the safe areas
    addEventListener("resize", update);
    return () => {
      clearTimeout(late);
      removeEventListener("resize", update);
    };
  }, [update]);

  return (
    <main className="fixed inset-0 bg-[#eef3f7]">
      {COLUMNS.map((c, i) => (
        <div
          key={c.label}
          data-col={c.label}
          aria-hidden="true"
          className="fixed flex items-end justify-center text-[10px] text-white"
          style={{
            ...c.style,
            left: `${i * 16 + 1}%`,
            width: "15%",
            background: c.color,
          }}
        >
          {c.label}
        </div>
      ))}
      <div className="fixed inset-x-3 top-[30%] bg-white/95 p-3 text-xs text-black">
        <h1 className="mb-2 text-sm">Viewport check</h1>
        {lines.map((l) => (
          <p key={l} className="break-all">
            {l}
          </p>
        ))}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="border border-black px-2"
            onClick={update}
          >
            Measure again
          </button>
        </div>
      </div>
    </main>
  );
}
