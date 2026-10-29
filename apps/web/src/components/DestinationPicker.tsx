"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DestinationCategory } from "@/lib/url-state";

const LABELS: Record<DestinationCategory, string> = {
  resorts: "⛷ Resorts",
  food: "🍜 Food",
  convenience: "🏪 Konbini",
};

/** Segmented control: route to a ski resort, a restaurant, or a convenience store. */
export function DestinationPicker({
  value,
  onChange,
}: {
  value: DestinationCategory;
  onChange: (category: DestinationCategory) => void;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(v) => onChange(v as DestinationCategory)}
    >
      <TabsList aria-label="Destination type" className="w-full">
        {(Object.keys(LABELS) as DestinationCategory[]).map((c) => (
          <TabsTrigger key={c} value={c}>
            {LABELS[c]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
