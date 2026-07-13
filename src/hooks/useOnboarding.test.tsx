import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ONBOARDING_STORAGE_KEY,
  OnboardingProvider,
  useOnboarding,
} from "@/hooks/useOnboarding";

describe("OnboardingProvider", () => {
  beforeEach(() => localStorage.clear());

  it("öffnet beim ersten Aufruf automatisch", () => {
    const { result } = renderHook(() => useOnboarding(), { wrapper: OnboardingProvider });

    expect(result.current.open).toBe(true);
    expect(result.current.page).toBe(0);
  });

  it("öffnet nach dem Schließen beim nächsten Mount nicht automatisch", () => {
    const first = renderHook(() => useOnboarding(), { wrapper: OnboardingProvider });
    act(() => first.result.current.dismiss());
    first.unmount();

    const second = renderHook(() => useOnboarding(), { wrapper: OnboardingProvider });

    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe("seen");
    expect(second.result.current.open).toBe(false);
  });

  it("startet manuell wieder auf Seite eins, ohne den Seen-Status zu löschen", () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "seen");
    const { result } = renderHook(() => useOnboarding(), { wrapper: OnboardingProvider });

    act(() => result.current.openOnboarding());

    expect(result.current.open).toBe(true);
    expect(result.current.page).toBe(0);
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe("seen");
  });

  it("begrenzt die Navigation auf vier Seiten und merkt die Richtung", () => {
    const { result } = renderHook(() => useOnboarding(), { wrapper: OnboardingProvider });

    act(() => {
      result.current.next();
      result.current.next();
      result.current.next();
      result.current.next();
    });
    expect(result.current.page).toBe(3);
    expect(result.current.direction).toBe("forward");

    act(() => result.current.previous());
    expect(result.current.page).toBe(2);
    expect(result.current.direction).toBe("backward");
  });
});
