import { beforeEach, describe, expect, it, vi } from "vitest";

type PwaInstallModule = typeof import("@/lib/pwaInstall");

/** Der Store hält seinen Zustand im Modul – jeder Test braucht deshalb eine frische Instanz. */
async function loadStore(): Promise<PwaInstallModule> {
  vi.resetModules();
  return import("@/lib/pwaInstall");
}

function dispatchInstallPrompt(prompt = vi.fn().mockResolvedValue(undefined), outcome: "accepted" | "dismissed" = "accepted") {
  const event = new Event("beforeinstallprompt") as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  };
  event.prompt = prompt;
  event.userChoice = Promise.resolve({ outcome });
  window.dispatchEvent(event);
  return { event, prompt };
}

describe("pwaInstall", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("bietet die Installation erst an, wenn der Browser sie meldet", async () => {
    const store = await loadStore();

    expect(store.getPwaInstallState()).toEqual({ canInstall: false, isInstalled: false });

    dispatchInstallPrompt();

    expect(store.getPwaInstallState()).toEqual({ canInstall: true, isInstalled: false });
  });

  it("benachrichtigt Abonnenten über den Zustandswechsel", async () => {
    const store = await loadStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribePwaInstall(listener);

    dispatchInstallPrompt();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    window.dispatchEvent(new Event("appinstalled"));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("löst den Browserdialog aus und merkt sich die Zusage", async () => {
    const store = await loadStore();
    const { prompt } = dispatchInstallPrompt();

    await expect(store.promptPwaInstall()).resolves.toBe(true);

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(store.getPwaInstallState()).toEqual({ canInstall: false, isInstalled: true });
  });

  it("verbraucht das Event auch bei Ablehnung, weil der Browser es nur einmal liefert", async () => {
    const store = await loadStore();
    dispatchInstallPrompt(vi.fn().mockResolvedValue(undefined), "dismissed");

    await expect(store.promptPwaInstall()).resolves.toBe(false);

    expect(store.getPwaInstallState()).toEqual({ canInstall: false, isInstalled: false });
    await expect(store.promptPwaInstall()).resolves.toBe(false);
  });

  it("meldet die Installation über das appinstalled-Ereignis", async () => {
    const store = await loadStore();
    dispatchInstallPrompt();

    window.dispatchEvent(new Event("appinstalled"));

    expect(store.getPwaInstallState()).toEqual({ canInstall: false, isInstalled: true });
  });
});
