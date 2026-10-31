"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Hero } from "@/components/HeroMarker";

/** A session cookie: the title shows once per browser session (SPEC-web-app v1.6). */
export const TITLE_COOKIE = "hakuba_title";
const SHARED = /(^|[?&])(from|resort|dest|skip-title)(=|&|$)/;

/** The title screen only greets a bare visit: never a shared link, never twice. */
export function shouldShowTitle({
  search,
  hash,
  cookie,
}: {
  search: string;
  hash: string;
  cookie: string;
}): boolean {
  if (cookie.split(/;\s*/).includes(`${TITLE_COOKIE}=seen`)) return false;
  if (SHARED.test(search)) return false;
  return !/^#(import|rider)=/.test(hash);
}

const FLAKES = Array.from({ length: 24 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: (i * 0.7) % 6,
  size: 2 + (i % 3) * 2,
}));

export function TitleScreen() {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const start = useRef<HTMLButtonElement>(null);
  // the browser decides (cookie, URL): after mount, so the server HTML never differs
  useEffect(() => {
    setOpen(
      shouldShowTitle({
        search: window.location.search,
        hash: window.location.hash,
        cookie: document.cookie,
      }),
    );
  }, []);
  useEffect(() => {
    if (open) start.current?.focus();
  }, [open]);
  if (!open) return null;
  const begin = () => {
    // biome-ignore lint/suspicious/noDocumentCookie: a session cookie, read on this device only
    document.cookie = `${TITLE_COOKIE}=seen; path=/; SameSite=Lax`;
    setOpen(false);
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="title-screen fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 overflow-hidden bg-[#2c3e6b] text-[#fffaf0]"
    >
      {FLAKES.map((f, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed decoration
          key={i}
          aria-hidden="true"
          className="title-flake absolute top-[-10px] bg-white"
          style={{
            left: `${f.left}%`,
            width: f.size,
            height: f.size,
            animationDelay: `${f.delay}s`,
          }}
        />
      ))}
      <Hero pose="ride" alt="" scale={5} />
      <h1 id={titleId} className="text-center text-4xl tracking-widest">
        Hakuba Valley
      </h1>
      <p className="text-center">A snowboarder's trip planner · 10 worlds</p>
      <button
        ref={start}
        type="button"
        onClick={begin}
        className="title-start border-4 border-[#fffaf0] px-6 py-2 text-xl"
      >
        Tap to start
      </button>
    </div>
  );
}
