import type { RamRightsizingLevel } from "@/domain/models/types";
import { DEFAULT_RAM_RIGHTSIZING_LEVEL } from "@/domain/services/vmRamRightsizingService";

export const RAM_RIGHTSIZING_LEVEL_STORAGE_KEY = "rvtools-ram-rightsizing-level-v1";
export const RAM_RIGHTSIZING_LEVEL_CHANGED_EVENT = "rvtools-ram-rightsizing-level-changed";

const LEVELS = new Set<RamRightsizingLevel>([
  "very-conservative",
  "conservative",
  "balanced",
  "offensive",
]);

export function normalizeRamRightsizingLevel(value: unknown): RamRightsizingLevel | null {
  return typeof value === "string" && LEVELS.has(value as RamRightsizingLevel)
    ? value as RamRightsizingLevel
    : null;
}

export function getStoredRamRightsizingLevel(): RamRightsizingLevel {
  try {
    return normalizeRamRightsizingLevel(globalThis.localStorage?.getItem(RAM_RIGHTSIZING_LEVEL_STORAGE_KEY))
      ?? DEFAULT_RAM_RIGHTSIZING_LEVEL;
  } catch {
    return DEFAULT_RAM_RIGHTSIZING_LEVEL;
  }
}

export function saveRamRightsizingLevel(level: RamRightsizingLevel): void {
  try {
    globalThis.localStorage?.setItem(RAM_RIGHTSIZING_LEVEL_STORAGE_KEY, level);
    globalThis.dispatchEvent?.(new CustomEvent<RamRightsizingLevel>(RAM_RIGHTSIZING_LEVEL_CHANGED_EVENT, { detail: level }));
  } catch {
    // Die Analyse bleibt auch bei blockiertem localStorage mit dem Default nutzbar.
  }
}

export function subscribeRamRightsizingLevel(onStoreChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === RAM_RIGHTSIZING_LEVEL_STORAGE_KEY) onStoreChange();
  };
  globalThis.addEventListener?.("storage", onStorage);
  globalThis.addEventListener?.(RAM_RIGHTSIZING_LEVEL_CHANGED_EVENT, onStoreChange);
  return () => {
    globalThis.removeEventListener?.("storage", onStorage);
    globalThis.removeEventListener?.(RAM_RIGHTSIZING_LEVEL_CHANGED_EVENT, onStoreChange);
  };
}
