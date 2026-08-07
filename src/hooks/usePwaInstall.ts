import { useSyncExternalStore } from "react";
import { getPwaInstallState, promptPwaInstall, subscribePwaInstall, type PwaInstallState } from "@/lib/pwaInstall";

export interface UsePwaInstallResult extends PwaInstallState {
  install: () => Promise<boolean>;
}

/** Liest den Installationszustand aus dem Modul-Store in `@/lib/pwaInstall`. */
export function usePwaInstall(): UsePwaInstallResult {
  const state = useSyncExternalStore(subscribePwaInstall, getPwaInstallState, getPwaInstallState);
  return { ...state, install: promptPwaInstall };
}
