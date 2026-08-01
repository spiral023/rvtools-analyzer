import type { CpuRightsizingLevel } from "@/domain/models/types";
import { DEFAULT_CPU_RIGHTSIZING_LEVEL } from "@/domain/services/vmRightsizingService";

export const CPU_RIGHTSIZING_LEVEL_STORAGE_KEY = "rvtools-cpu-rightsizing-level-v1";
export const CPU_RIGHTSIZING_LEVEL_CHANGED_EVENT = "rvtools-cpu-rightsizing-level-changed";

const LEVELS = new Set<CpuRightsizingLevel>([
  "very-conservative",
  "conservative",
  "balanced",
  "offensive",
]);

export function normalizeCpuRightsizingLevel(value: unknown): CpuRightsizingLevel | null {
  return typeof value === "string" && LEVELS.has(value as CpuRightsizingLevel)
    ? value as CpuRightsizingLevel
    : null;
}

export function getStoredCpuRightsizingLevel(): CpuRightsizingLevel {
  try {
    return normalizeCpuRightsizingLevel(globalThis.localStorage?.getItem(CPU_RIGHTSIZING_LEVEL_STORAGE_KEY))
      ?? DEFAULT_CPU_RIGHTSIZING_LEVEL;
  } catch {
    return DEFAULT_CPU_RIGHTSIZING_LEVEL;
  }
}

export function saveCpuRightsizingLevel(level: CpuRightsizingLevel): void {
  try {
    globalThis.localStorage?.setItem(CPU_RIGHTSIZING_LEVEL_STORAGE_KEY, level);
    globalThis.dispatchEvent?.(new CustomEvent<CpuRightsizingLevel>(CPU_RIGHTSIZING_LEVEL_CHANGED_EVENT, { detail: level }));
  } catch {
    // Die Analyse bleibt auch bei blockiertem localStorage mit dem Default nutzbar.
  }
}

export function subscribeCpuRightsizingLevel(onStoreChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === CPU_RIGHTSIZING_LEVEL_STORAGE_KEY) onStoreChange();
  };
  globalThis.addEventListener?.("storage", onStorage);
  globalThis.addEventListener?.(CPU_RIGHTSIZING_LEVEL_CHANGED_EVENT, onStoreChange);
  return () => {
    globalThis.removeEventListener?.("storage", onStorage);
    globalThis.removeEventListener?.(CPU_RIGHTSIZING_LEVEL_CHANGED_EVENT, onStoreChange);
  };
}
