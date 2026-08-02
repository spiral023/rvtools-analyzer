import { useCallback, useSyncExternalStore } from "react";
import type { RamRightsizingLevel } from "@/domain/models/types";
import {
  getStoredRamRightsizingLevel,
  saveRamRightsizingLevel,
  subscribeRamRightsizingLevel,
} from "@/lib/ramRightsizingSettings";
import { DEFAULT_RAM_RIGHTSIZING_LEVEL } from "@/domain/services/vmRamRightsizingService";

export function useRamRightsizingLevel() {
  const level = useSyncExternalStore(
    subscribeRamRightsizingLevel,
    getStoredRamRightsizingLevel,
    () => DEFAULT_RAM_RIGHTSIZING_LEVEL,
  );
  const setLevel = useCallback((next: RamRightsizingLevel) => saveRamRightsizingLevel(next), []);
  return { level, setLevel };
}
