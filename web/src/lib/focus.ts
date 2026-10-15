import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

/** The user's daily focus hours from Settings, or undefined while loading. */
export function useDailyFocusHours(): number | undefined {
  return useQuery(api.settings.viewer)?.dailyFocusHours;
}
