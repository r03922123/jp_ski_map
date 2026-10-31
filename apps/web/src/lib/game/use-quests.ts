"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchResorts, fetchSnow } from "@/lib/api";
import {
  questOf,
  questsFor,
  syncQuests,
  todaysQuests,
} from "@/lib/game/quests";
import { riderStore, useRider } from "@/lib/game/rider";
import { jstDate } from "@/lib/game/stamps";
import { useNow } from "@/lib/use-now";

/**
 * Today's quests (SPEC-progression). The day's set is saved once the resort catalog and
 * the snow data have settled (snow failing just means no powder quest today).
 */
export function useDailyQuests() {
  const rider = useRider();
  const resorts = useQuery({ queryKey: ["resorts"], queryFn: fetchResorts });
  const snow = useQuery({
    queryKey: ["snow"],
    queryFn: fetchSnow,
    retry: false,
  });
  // the clock is read after mount (an unstable value while rendering); the minute tick
  // also rolls today's quests over at midnight JST
  const now = useNow(60_000);
  const date = now.getTime() === 0 ? null : jstDate(now);
  const settled = date !== null && resorts.isSuccess && !snow.isPending;
  useEffect(() => {
    if (!settled || !date || !resorts.data) return;
    const fresh = snow.data?.map((s) => ({
      resortId: s.resortId,
      cm: s.newSnowCm.past24h ?? 0,
    }));
    riderStore.update((s) =>
      syncQuests(s, date, questsFor(date, s, resorts.data, fresh ?? null)),
    );
  }, [settled, date, resorts.data, snow.data]);
  if (!date) return [];
  return todaysQuests(rider, date).map((q) => ({
    ...questOf(q.id),
    status: q.status,
  }));
}
