export const hrs = (n: number) => `${Math.round(n * 10) / 10}h`;
export const signedPct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n))}%`;
