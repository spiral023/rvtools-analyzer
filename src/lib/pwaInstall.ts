/**
 * Chrome und Edge feuern `beforeinstallprompt` einmalig kurz nach dem Laden – oft bevor die
 * Sidebar überhaupt gemountet ist. Ein Listener innerhalb einer Komponente würde das Event
 * deshalb verpassen. Der Zustand liegt daher im Modul und wird beim Import registriert;
 * Komponenten lesen ihn über `useSyncExternalStore`.
 *
 * Das Event lässt sich nur genau einmal auslösen. Nach `prompt()` verwerfen wir es und die
 * Installationsaktion verschwindet, bis der Browser sie erneut anbietet.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface PwaInstallState {
  /** Der Browser hat die Installation angeboten und sie ist noch nicht ausgelöst. */
  canInstall: boolean;
  /** Die App läuft bereits als installierte Anwendung. */
  isInstalled: boolean;
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS kennt `display-mode` in dieser Form nicht und meldet den Zustand über ein eigenes Flag.
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = detectStandalone();
let snapshot: PwaInstallState = { canInstall: false, isInstalled: installed };
const listeners = new Set<() => void>();

function publish() {
  const next: PwaInstallState = { canInstall: deferredPrompt !== null && !installed, isInstalled: installed };
  // `useSyncExternalStore` vergleicht per Object.is – ein neues Objekt je Aufruf würde
  // eine Endlosschleife auslösen. Deshalb nur bei echter Änderung ersetzen.
  if (next.canInstall === snapshot.canInstall && next.isInstalled === snapshot.isInstalled) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Ohne `preventDefault` zeigt der Browser sein eigenes Banner und liefert das Event nicht aus.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    publish();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    publish();
  });
}

export function subscribePwaInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPwaInstallState(): PwaInstallState {
  return snapshot;
}

/** Öffnet den Installationsdialog des Browsers. Liefert zurück, ob installiert wurde. */
export async function promptPwaInstall(): Promise<boolean> {
  const event = deferredPrompt;
  if (!event) return false;
  deferredPrompt = null;
  publish();

  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "accepted") {
    installed = true;
    publish();
  }
  return outcome === "accepted";
}
