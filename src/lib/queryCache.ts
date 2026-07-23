/**
 * Importierte Daten ändern sich nur durch explizite Import-/Löschaktionen.
 * Eine gemeinsame Dauer verhindert, dass einzelne Hooks große Arrays früher verwerfen.
 */
export const QUERY_CACHE_DURATION_MS = 60 * 60 * 1000;

/** Große Raw-Sheet-Arrays müssen mindestens so lange wie ihre Frischezeit erhalten bleiben. */
export const RAW_QUERY_GC_MS = QUERY_CACHE_DURATION_MS;

/** Einheitliche Defaults, damit auch per setQueryData erzeugte Preload-Keys erhalten bleiben. */
export const IMPORTED_DATA_QUERY_DEFAULTS = {
  staleTime: QUERY_CACHE_DURATION_MS,
  gcTime: QUERY_CACHE_DURATION_MS,
} as const;
