import type { GlossaryEntry } from "@/lib/glossary";

/** Erklärungen für die Kennzahlen des lokalen Wartungsfenster-Katalogs. */
export const MAINTENANCE_WINDOWS_KPI: Record<string, GlossaryEntry> = {
  definitions: {
    term: "Definierte Wartungsfenster",
    description:
      "Anzahl der lokal gespeicherten Zeitplan-Definitionen. Definitionen bleiben erhalten, auch wenn ihnen aktuell kein System zugeordnet ist.",
    source: "Lokaler Wartungsfenster-Katalog",
  },
  assignedSystems: {
    term: "Zugeordnete Systeme",
    description:
      "Systeme aus Tech-Info, deren Wartungsfensterwert einer bekannten Katalog-Definition zugeordnet werden konnte.",
    source: "Tech-Info · Wartungsfenster",
  },
  unknownValues: {
    term: "Unbekannte Fensterwerte",
    description:
      "Unterschiedliche Wartungsfensterwerte aus Tech-Info, für die keine passende lokale Definition existiert. Lege die Definition an oder korrigiere den Wert.",
    source: "Tech-Info · Wartungsfenster",
  },
  unassignedSystems: {
    term: "Systeme ohne Fensterzuordnung",
    description:
      "Systeme, deren Wartungsfensterwert keiner bekannten Definition zugeordnet werden konnte. Das umfasst leere, abweichende und nicht angelegte Werte.",
    source: "Tech-Info · Wartungsfenster",
  },
};
