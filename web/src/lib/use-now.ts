import { useEffect, useState } from "react";

/** The current time, refreshed every `ms` while `enabled` (timers only tick on the client). */
export function useNow(enabled: boolean, ms = 200): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [enabled, ms]);
  return now;
}
