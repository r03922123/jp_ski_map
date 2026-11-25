"use client";

import type { SortKey } from "@/lib/api";
import { type RankOptions, SORT_KEYS } from "@/lib/url-state";

const SORT_LABELS: Record<(typeof SORT_KEYS)[number], string> = {
  walk_time: "Walk time",
  runs: "Total runs",
  area: "Skiable area",
  run_length: "Run length",
};

const MAX_WALK_OPTIONS = [10, 15, 20, 30, 45];

export function SortControls({
  value,
  onChange,
}: {
  value: RankOptions;
  onChange: (next: RankOptions) => void;
}) {
  const set = (patch: Partial<RankOptions>) => onChange({ ...value, ...patch });
  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      <div className="flex flex-col gap-1">
        <label htmlFor="sort-by" className="font-medium">
          Sort by
        </label>
        <select
          id="sort-by"
          className="rounded-md border bg-background px-2 py-1.5"
          value={value.sort}
          onChange={(e) => set({ sort: e.target.value as SortKey })}
        >
          {SORT_KEYS.map((key) => (
            <option key={key} value={key}>
              {SORT_LABELS[key]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="max-walk" className="font-medium">
          Max walk
        </label>
        <select
          id="max-walk"
          className="rounded-md border bg-background px-2 py-1.5"
          value={value.maxWalkMin ?? ""}
          onChange={(e) =>
            set({ maxWalkMin: e.target.value ? Number(e.target.value) : null })
          }
        >
          <option value="">Any</option>
          {MAX_WALK_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </div>
      <fieldset className="flex flex-col justify-end gap-1">
        <legend className="sr-only">Filters</legend>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.nightSkiing}
            onChange={(e) => set({ nightSkiing: e.target.checked })}
          />
          Night skiing
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.hvPass}
            onChange={(e) => set({ hvPass: e.target.checked })}
          />
          Hakuba Valley pass
        </label>
      </fieldset>
    </div>
  );
}
