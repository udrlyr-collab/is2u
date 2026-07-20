export type MissionInterval = { min: number; max: number };

function normalizeValue(raw: string, fallback: number): number {
  if (!/^\d+$/.test(raw.trim())) return fallback;
  return Math.min(240, Math.max(10, Number.parseInt(raw, 10)));
}

export function normalizeMissionIntervalInputs(
  minInput: string,
  maxInput: string,
  previous: MissionInterval,
  lastChanged: "min" | "max",
): MissionInterval {
  let min = normalizeValue(minInput, previous.min);
  let max = normalizeValue(maxInput, previous.max);
  if (min > max) {
    if (lastChanged === "min") max = min;
    else min = max;
  }
  return { min, max };
}
