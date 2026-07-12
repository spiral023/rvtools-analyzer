export type HotHostSeverity = "ok" | "warn" | "crit";

export function getHotHostSeverity(hotHosts: number, totalHosts: number): HotHostSeverity {
  if (hotHosts <= 0 || totalHosts <= 0) return "ok";
  return hotHosts / totalHosts > 0.5 ? "crit" : "warn";
}
