"use client";

import { ResortList } from "@/components/ResortList";
import { SortControls } from "@/components/SortControls";
import type { RankedResort } from "@/lib/api";
import type { RankOptions } from "@/lib/url-state";

export type RankingState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; data: RankedResort[] };

export function DrivePanel({
  options,
  onOptionsChange,
  ranking,
  selectedResortId,
  onSelectResort,
}: {
  options: RankOptions;
  onOptionsChange: (next: RankOptions) => void;
  ranking: RankingState;
  selectedResortId: string | null;
  onSelectResort: (resortId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SortControls value={options} onChange={onOptionsChange} />
      {ranking.status === "loading" && (
        <p className="text-sm text-muted-foreground">Ranking resorts…</p>
      )}
      {ranking.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          Couldn't rank resorts right now. Please try again shortly.
        </p>
      )}
      {ranking.status === "success" &&
        (ranking.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No resorts match these filters.
            {options.nightSkiing &&
              " The night-skiing filter shows only resorts confirmed to run night skiing; resorts whose night skiing isn't known yet are left out."}
          </p>
        ) : (
          <ResortList
            resorts={ranking.data}
            selectedId={selectedResortId}
            onSelect={(id) => onSelectResort(id)}
          />
        ))}
    </div>
  );
}
