import type { GlossaryEntry } from "@/lib/glossary";

export const NORMALIZED_OPTIONAL_COLUMN_GROUP = "Optionale normalisierte Felder";

/**
 * Zusatzspalten aus dem normalisierten Datenmodell bleiben standardmäßig
 * ausgeblendet, sind aber im gemeinsamen Spalten-Dialog sofort zuschaltbar.
 */
export function normalizedOptionalColumnMeta(
  term: string,
  description: string,
  source = "RVTools · normalisiertes Datenmodell",
): {
  group: string;
  initiallyVisible: false;
  info: GlossaryEntry;
} {
  return {
    group: NORMALIZED_OPTIONAL_COLUMN_GROUP,
    initiallyVisible: false,
    info: { term, description, source },
  };
}
