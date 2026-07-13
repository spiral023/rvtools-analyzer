import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const ONBOARDING_STORAGE_KEY = "rvtools-analyzer:onboarding:v1";
export const ONBOARDING_PAGE_COUNT = 4;
export type OnboardingDirection = "forward" | "backward";

interface OnboardingContextValue {
  open: boolean;
  page: number;
  direction: OnboardingDirection;
  openOnboarding: () => void;
  dismiss: () => void;
  next: () => void;
  previous: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

function isSeen(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) === "seen";
  } catch {
    return false;
  }
}

function storeSeen(): void {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "seen");
  } catch {
    // Die App bleibt bei blockiertem localStorage nutzbar.
  }
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(() => !isSeen());
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState<OnboardingDirection>("forward");

  const openOnboarding = useCallback(() => {
    setDirection("forward");
    setPage(0);
    setOpen(true);
  }, []);

  const dismiss = useCallback(() => {
    storeSeen();
    setOpen(false);
  }, []);

  const next = useCallback(() => {
    setDirection("forward");
    setPage((current) => Math.min(current + 1, ONBOARDING_PAGE_COUNT - 1));
  }, []);

  const previous = useCallback(() => {
    setDirection("backward");
    setPage((current) => Math.max(current - 1, 0));
  }, []);

  const value = useMemo(
    () => ({ open, page, direction, openOnboarding, dismiss, next, previous }),
    [direction, dismiss, next, open, openOnboarding, page, previous],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return context;
}
