"use client";

import type { SortKey } from "@/lib/api";
import { type RankOptions, SORT_KEYS } from "@/lib/url-state";

export const SORT_LABELS: Record<SortKey, string> = {
  drive_time: "Drive time",
  fresh_snow: "Fresh snow",
  snow_depth: "Snow depth",
  crowd: "Crowd (estimated)",
  terrain_size: "Terrain size",
  vertical: "Vertical drop",
  price: "Ticket price",
};

const MAX_DRIVE_OPTIONS = [10, 15, 20, 30, 45];

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
        <label htmlFor="ski-date" className="font-medium">
          Date
        </label>
        <input
          id="ski-date"
          type="date"
          className="rounded-md border bg-background px-2 py-1"
          value={value.date ?? ""}
          onChange={(e) => set({ date: e.target.value || null })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="max-drive" className="font-medium">
          Max drive
        </label>
        <select
          id="max-drive"
          className="rounded-md border bg-background px-2 py-1.5"
          value={value.maxDriveMin ?? ""}
          onChange={(e) =>
            set({ maxDriveMin: e.target.value ? Number(e.target.value) : null })
          }
        >
          <option value="">Any</option>
          {MAX_DRIVE_OPTIONS.map((m) => (
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
