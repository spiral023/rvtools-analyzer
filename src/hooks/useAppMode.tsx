import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getUiState, putUiState } from "@/data/db";
import type { AppMode, AppModeState, SysvScopePreference } from "@/domain/models/types";
import {
  APP_MODE_STATE_CHANGED_EVENT,
  APP_MODE_UI_STATE_ID,
  createDefaultAppModeState,
  normalizeAppModeState,
} from "@/lib/appMode";
import { normalizeSysvScopePreference } from "@/lib/sysvScope";

interface AppModeContextValue {
  mode: AppMode;
  lastSysvScope: SysvScopePreference;
  isHydrated: boolean;
  sysvScopeDialogOpen: boolean;
  activateMode: (mode: AppMode, options?: { openSysvScopeDialog?: boolean }) => Promise<void>;
  saveLastSysvScope: (scope: SysvScopePreference) => Promise<void>;
  openSysvScopeDialog: () => void;
  closeSysvScopeDialog: () => void;
}

const AppModeContext = createContext<AppModeContextValue | null>(null);

async function persistAppModeState(state: AppModeState): Promise<void> {
  const existing = await getUiState(APP_MODE_UI_STATE_ID);
  await putUiState({
    ...(existing ?? { id: APP_MODE_UI_STATE_ID, theme: "dark" }),
    id: APP_MODE_UI_STATE_ID,
    appModeState: state,
  });
}

export function AppModeProvider({ children }: { children: ReactNode }) {
  const stateRef = useRef<AppModeState>(createDefaultAppModeState());
  const stateRevisionRef = useRef(0);
  const [state, setState] = useState<AppModeState>(() => stateRef.current);
  const [isHydrated, setIsHydrated] = useState(false);
  const [sysvScopeDialogOpen, setSysvScopeDialogOpen] = useState(false);

  const loadStoredState = useCallback(async () => {
    const revisionBeforeRead = stateRevisionRef.current;
    const stored = await getUiState(APP_MODE_UI_STATE_ID);
    // Ein schneller Import darf nicht durch eine noch laufende Initial-Hydrierung
    // wieder mit dem davor gespeicherten Modus überschrieben werden.
    if (revisionBeforeRead !== stateRevisionRef.current) return;
    const next = normalizeAppModeState(stored?.appModeState);
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void loadStoredState()
      .catch(() => {
        if (cancelled) return;
        const fallback = createDefaultAppModeState();
        stateRef.current = fallback;
        setState(fallback);
      })
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [loadStoredState]);

  useEffect(() => {
    const handleExternalChange = () => {
      void loadStoredState();
    };
    globalThis.addEventListener?.(APP_MODE_STATE_CHANGED_EVENT, handleExternalChange);
    return () => globalThis.removeEventListener?.(APP_MODE_STATE_CHANGED_EVENT, handleExternalChange);
  }, [loadStoredState]);

  const saveState = useCallback(async (next: AppModeState) => {
    stateRevisionRef.current += 1;
    await persistAppModeState(next);
    stateRef.current = next;
    setState(next);
  }, []);

  const activateMode = useCallback(async (
    mode: AppMode,
    options?: { openSysvScopeDialog?: boolean },
  ) => {
    const next: AppModeState = {
      ...stateRef.current,
      mode,
      updatedAt: new Date().toISOString(),
    };
    await saveState(next);
    if (options?.openSysvScopeDialog && mode === "sysv") setSysvScopeDialogOpen(true);
  }, [saveState]);

  const saveLastSysvScope = useCallback(async (scope: SysvScopePreference) => {
    const next: AppModeState = {
      ...stateRef.current,
      lastSysvScope: normalizeSysvScopePreference(scope),
      updatedAt: new Date().toISOString(),
    };
    await saveState(next);
  }, [saveState]);

  const openSysvScopeDialog = useCallback(() => setSysvScopeDialogOpen(true), []);
  const closeSysvScopeDialog = useCallback(() => setSysvScopeDialogOpen(false), []);

  const value = useMemo<AppModeContextValue>(() => ({
    mode: state.mode,
    lastSysvScope: state.lastSysvScope,
    isHydrated,
    sysvScopeDialogOpen,
    activateMode,
    saveLastSysvScope,
    openSysvScopeDialog,
    closeSysvScopeDialog,
  }), [activateMode, closeSysvScopeDialog, isHydrated, openSysvScopeDialog, saveLastSysvScope, state.lastSysvScope, state.mode, sysvScopeDialogOpen]);

  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>;
}

export function useAppMode(): AppModeContextValue {
  const context = useContext(AppModeContext);
  if (!context) throw new Error("useAppMode must be used within an AppModeProvider");
  return context;
}

/** Ermöglicht isolierte Komponenten-Tests außerhalb des Providers. */
export function useOptionalAppMode(): AppModeContextValue | null {
  return useContext(AppModeContext);
}
