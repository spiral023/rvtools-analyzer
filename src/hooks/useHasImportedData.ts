import { useQuery } from "@tanstack/react-query";
import { hasImportedData } from "@/data/db";

export const HAS_IMPORTED_DATA_QUERY_KEY = ["hasImportedData"] as const;

/**
 * Ob überhaupt ein Datenbestand in der Anwendung liegt – die Weiche zwischen
 * Startbildschirm und Analyse.
 *
 * Die Frage ist bewusst weiter gefasst als „gibt es RVTools-Snapshots": auch ein
 * reiner Netzwerk- oder vROps-Import ist ein Bestand, mit dem sich arbeiten lässt.
 * Import und Löschung rufen beide `queryClient.invalidateQueries()` auf, wodurch
 * diese Abfrage ohne eigenes Signal aktuell bleibt.
 */
export function useHasImportedData() {
  const query = useQuery({
    queryKey: HAS_IMPORTED_DATA_QUERY_KEY,
    queryFn: hasImportedData,
  });

  return {
    /** Erst nach der ersten Antwort aussagekräftig – bis dahin `false`. */
    hasImportedData: query.data ?? false,
    isResolved: !query.isPending,
  };
}
