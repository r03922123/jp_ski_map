"use client";

import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { useState } from "react";
import { fetchResorts } from "@/lib/api";
import { useBackToClose } from "@/lib/back-close";
import type { Quest } from "@/lib/game/quests";
import { useDailyQuests } from "@/lib/game/use-quests";

function questText(q: Quest, name: (id: string) => string): string {
  if (q.kind === "powder")
    return `${q.cm} cm fell at ${name(q.resortId)}: ride there today`;
  if (q.kind === "explore") return `Explore ${name(q.resortId)}`;
  return "Stop at a konbini on the way";
}

/** Today's quests as a list (shared by the quest log and the rider card). */
export function QuestList() {
  const quests = useDailyQuests();
  const resorts = useQuery({ queryKey: ["resorts"], queryFn: fetchResorts });
  const name = (id: string) =>
    resorts.data?.find((r) => r.id === id)?.name.en ?? id;
  if (quests.length === 0)
    return <p className="text-muted-foreground">Loading…</p>;
  return (
    <ul className="flex flex-col gap-1">
      {quests.map((q) => (
        <li key={q.id} className="flex gap-2">
          <span aria-hidden="true">{q.status === "done" ? "✔" : "◇"}</span>
          <span className={q.status === "done" ? "line-through" : ""}>
            {questText(q, name)}
            <span className="sr-only">
              {q.status === "done" ? " (done)" : " (open)"}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Today's quests (SPEC-progression), behind a button with a count of open ones. */
export function QuestLog() {
  const quests = useDailyQuests();
  const [open, setOpen] = useState(false);
  useBackToClose(open, () => setOpen(false));
  const active = quests.filter((q) => q.status === "active").length;
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Quests, ${active} open`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-8 items-center justify-center border-2 border-[var(--ink)] bg-card shadow-[2px_2px_0_var(--ink)] active:translate-y-0.5 active:shadow-none"
      >
        <ScrollText aria-hidden="true" className="size-4" />
        {active > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-2 -right-2 flex size-4 items-center justify-center bg-destructive text-[10px] text-white"
          >
            {active}
          </span>
        )}
      </button>
      {open && (
        <section
          aria-label="Today's quests"
          className="pixel-frame absolute right-0 z-30 mt-3 w-64 p-3 text-sm"
        >
          <h2 className="mb-1">Today's quests</h2>
          <QuestList />
        </section>
      )}
    </div>
  );
}
