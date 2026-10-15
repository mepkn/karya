import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { formatClock, liveElapsed } from "@shared/execute";

/** brief §7c: the running slice's time left in the browser tab, e.g. `▶ 42:10 · PROJ-104`. */
export function useTimerTitle() {
  const active = useQuery(api.slices.active);
  useEffect(() => {
    if (!active) {
      document.title = "Karya";
      return;
    }
    const update = () => {
      const left = active.allocatedSeconds - liveElapsed(active, Date.now());
      document.title = `▶ ${formatClock(left)} · ${active.jiraKey}`;
    };
    update();
    const id = setInterval(update, 1000);
    return () => {
      clearInterval(id);
      document.title = "Karya";
    };
  }, [active]);
}
