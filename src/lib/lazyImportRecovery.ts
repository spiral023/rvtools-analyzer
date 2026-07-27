const RECOVERY_KEY = "rvtools:lazy-import-recovery";

/** Erkennt Fehler, die durch nicht mehr verfügbare Vite-Code-Splitting-Chunks entstehen. */
export function isLazyImportFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch dynamically imported module|importing a module script failed|expected a javascript-or-wasm module script/i.test(message);
}

/**
 * Entfernt einmalig einen veralteten PWA-Cache, aktualisiert den Service Worker
 * und lädt die aktuelle Anwendung. IndexedDB-Daten bleiben dabei erhalten.
 */
export async function recoverFromLazyImportFailure(): Promise<void> {
  if (sessionStorage.getItem(RECOVERY_KEY)) return;
  sessionStorage.setItem(RECOVERY_KEY, "1");

  try {
    await Promise.all((await caches.keys()).map((cacheName) => caches.delete(cacheName)));
    const registrations = await navigator.serviceWorker?.getRegistrations();
    await Promise.allSettled((registrations ?? []).map((registration) => registration.update()));
  } finally {
    window.location.reload();
  }
}
