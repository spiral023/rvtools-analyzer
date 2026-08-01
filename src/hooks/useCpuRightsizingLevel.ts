import { useCallback, useSyncExternalStore } from "react";
import type { CpuRightsizingLevel } from "@/domain/models/types";
import {
  getStoredCpuRightsizingLevel,
  saveCpuRightsizingLevel,
  subscribeCpuRightsizingLevel,
} from "@/lib/cpuRightsizingSettings";
import { DEFAULT_CPU_RIGHTSIZING_LEVEL } from "@/domain/services/vmRightsizingService";

export function useCpuRightsizingLevel() {
  const level = useSyncExternalStore(
    subscribeCpuRightsizingLevel,
    getStoredCpuRightsizingLevel,
    () => DEFAULT_CPU_RIGHTSIZING_LEVEL,
  );
  const setLevel = useCallback((next: CpuRightsizingLevel) => saveCpuRightsizingLevel(next), []);
  return { level, setLevel };
}
