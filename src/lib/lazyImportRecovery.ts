// Erholung von einem veralteten Build im Browser.
//
// Jede Route liegt in einem eigenen, per Content-Hash benannten Chunk. Nach
// einem Deploy ändern sich diese Dateinamen. Ein Client, der noch die alte
// index.html hält – ein seit Stunden offener Tab, ein Zwischencache oder ein
// Firmen-Proxy – fordert beim Wechsel auf eine bisher nicht geladene Route
// einen Chunk an, den es nicht mehr gibt.

const RECOVERY_KEY = "rvtools:lazy-import-recovery";
const CACHE_BUST_PARAM = "_rebuild";

// Ein Reload braucht Zeit. Innerhalb dieses Fensters wird kein zweiter Versuch
// gestartet – so erzeugt ein dauerhaft defektes Deployment keine Endlosschleife,
// sondern erreicht die Fehlerseite.
const RETRY_COOLDOWN_MS = 60_000;

// Jeder Browser formuliert den gescheiterten Chunk-Import anders. Vor allem
// Firefox ("error loading …") weicht von Chrome ("Failed to fetch …") ab.
const LAZY_IMPORT_FAILURE_PATTERNS = [
  // Chrome/Edge: "Failed to fetch dynamically imported module: …"
  // Firefox:     "error loading dynamically imported module: …"
  /dynamically imported module/i,
  // Safari
  /importing a module script failed/i,
  // Der SPA-Fallback liefert HTML unter einer .js-Adresse. Je nach Browser
  // meldet das der Modul-Loader statt der Netzwerkschicht.
  /failed to load module script/i,
  /expected a javascript(-or-wasm)? module script/i,
];

/** Erkennt Fehler, die durch nicht mehr verfügbare Vite-Code-Splitting-Chunks entstehen. */
export function isLazyImportFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return LAZY_IMPORT_FAILURE_PATTERNS.some((pattern) => pattern.test(message));
}

function hasRecentlyRecovered(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RECOVERY_KEY) ?? "0");
    return Date.now() - last < RETRY_COOLDOWN_MS;
  } catch {
    // Ohne sessionStorage lässt sich eine Reload-Schleife nicht ausschließen.
    // Dann lieber nicht neu laden und den Fehler sichtbar machen.
    return true;
  }
}

function markRecovery(): void {
  try {
    sessionStorage.setItem(RECOVERY_KEY, String(Date.now()));
  } catch {
    // Siehe hasRecentlyRecovered – hier ist nichts mehr zu retten.
  }
}

function reloadWithCacheBust(): void {
  const url = new URL(window.location.href);
  url.searchParams.set(CACHE_BUST_PARAM, Date.now().toString(36));
  // replace() statt assign(), damit die Fehlerseite nicht im Verlauf landet.
  window.location.replace(url.toString());
}

/**
 * Meldet den Service Worker ab, verwirft dessen Caches und lädt die aktuelle
 * Anwendung. IndexedDB-Daten bleiben dabei erhalten.
 *
 * Ein einfaches location.reload() genügt hier nicht: Der Service Worker liefert
 * die alte index.html aus seinem Precache weiter, und ein Proxy kann die
 * fehlerhafte Antwort ebenfalls noch vorhalten. Genau deshalb hilft in der
 * Praxis oft nur Strg+Shift+R.
 */
export async function recoverFromLazyImportFailure(): Promise<void> {
  if (hasRecentlyRecovered()) return;
  markRecovery();

  try {
    if ("caches" in window) {
      await Promise.all((await caches.keys()).map((cacheName) => caches.delete(cacheName)));
    }

    // Abmelden statt aktualisieren: Schlägt die Installation eines neuen
    // Workers fehl – etwa weil während des Deploys HTML statt eines Chunks
    // ausgeliefert wurde – bleibt sonst der alte Worker mitsamt alter
    // index.html aktiv. Beim nächsten Start registriert sich der Worker neu.
    const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.allSettled(registrations.map((registration) => registration.unregister()));
  } finally {
    reloadWithCacheBust();
  }
}

// Der Parameter hat seinen Zweck erfüllt, sobald die Seite geladen ist. Er wird
// entfernt, bevor der Router die Adresse auswertet.
function clearCacheBustParam(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(CACHE_BUST_PARAM)) return;

  url.searchParams.delete(CACHE_BUST_PARAM);
  window.history.replaceState(window.history.state, "", url.toString());
}

/**
 * Fängt fehlgeschlagene Chunk-Ladevorgänge ab, die außerhalb einer Route
 * auftreten und damit keine Router-ErrorBoundary erreichen – etwa beim
 * Vorladen im Hintergrund. Vite meldet diese über "vite:preloadError".
 */
export function registerStaleBuildRecovery(): void {
  clearCacheBustParam();

  // Das Event wird bewusst nicht per preventDefault() abgefangen: So bleibt der
  // ursprüngliche Fehler erhalten, erreicht die ErrorBoundary und landet im
  // Fehlerbericht, falls die Erholung nicht greift.
  window.addEventListener("vite:preloadError", () => {
    void recoverFromLazyImportFailure();
  });
}
