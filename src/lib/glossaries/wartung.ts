import type { GlossaryEntry } from "@/lib/glossary";

/**
 * Glossar für die Seite „Wartungsankündigung“.
 *
 * Zielgruppe: VMware-Administrator:innen. Die Seite leitet aus den aktiven
 * Snapshots die betroffenen Cluster/Systeme ab und erzeugt daraus eine
 * kopierbare Wartungs-Mail an die Verantwortlichen.
 */

/* ------------------------------------------------------------------ */
/*  Wartungsankündigung – KPIs                                       */
/* ------------------------------------------------------------------ */
export const WARTUNG_KPI: Record<string, GlossaryEntry> = {
  cluster: {
    term: "Cluster",
    description:
      "Anzahl der Cluster im aktiven Snapshot-Scope, die als Wartungseinheit zur Verfügung stehen. Jedes Cluster kann Zuweisungen (Fenster, Verantwortliche) tragen.",
    source: "berechnet",
  },
  selektiert: {
    term: "Selektiert",
    description:
      "Aktuell angehakte Cluster. Nur diese fließen in die Wartungsankündigung ein – die Auswahl bestimmt Empfänger und Wartungszeiträume der erzeugten Mail.",
    source: "berechnet",
  },
  spezial: {
    term: "Spezial",
    description:
      "Als „Spezial“ markierte Cluster – z. B. besonders sensible oder abweichend zu behandelnde Umgebungen. Der Typ wird in den Cluster-Zuweisungen gepflegt und in der Mail hervorgehoben.",
    source: "berechnet",
  },
  ohneEmpfaenger: {
    term: "Ohne Empfänger",
    description:
      "Cluster ohne Verantwortliche und ohne zusätzliche Mail-Adresse. Für diese kann keine To-Adresse erzeugt werden – vor dem Versand die Zuweisungen ergänzen.",
    source: "berechnet",
  },
};

/* ------------------------------------------------------------------ */
/*  Wartungsankündigung – Tabelle „Cluster im aktiven Snapshot-Scope“ */
/* ------------------------------------------------------------------ */
export const WARTUNG_COLUMNS: Record<string, GlossaryEntry> = {
  name: {
    term: "Name",
    description: "Name des Clusters, für den Wartungsfenster und Verantwortliche gepflegt werden.",
    source: `RVTools · vCluster · „Name“`,
  },
  hosts: {
    term: "Hosts",
    description: "Anzahl physischer ESXi-Hosts im Cluster – Umfang der Wartung auf Host-Ebene.",
    source: `RVTools · vHost`,
  },
  totalVms: {
    term: "VMs",
    description:
      "Anzahl virtueller Maschinen im Cluster. Grobmaß für die Anzahl potenziell betroffener Systeme während des Wartungsfensters.",
    source: `RVTools · vInfo`,
  },
  type: {
    term: "Typ",
    description:
      "Wartungsklasse des Clusters: „Normal“ oder „Spezial“. Wird in den Cluster-Zuweisungen gesetzt und steuert die Darstellung in der Ankündigung.",
    source: "Zuweisung (lokal gepflegt)",
  },
  windows: {
    term: "Wartungsfenster",
    description:
      "Hinterlegte wiederkehrende Wartungsfenster des Clusters (z. B. „Werktags 22:00-05:00 Uhr“). Dienen als Vorschlag für den konkreten Zeitraum in der Mail.",
    source: "Zuweisung (lokal gepflegt)",
  },
  contacts: {
    term: "Verantwortliche",
    description:
      "Empfänger der Ankündigung: hinterlegte Verantwortliche sowie zusätzliche Mail-Adressen. Speisen sich aus den Cluster-Zuweisungen und der Tech-Info.",
    source: "Zuweisung / Tech-Info",
  },
};

/* ------------------------------------------------------------------ */
/*  Wartungsankündigung – Abschnitts-Überschriften                   */
/* ------------------------------------------------------------------ */
export const WARTUNG_SECTIONS: Record<string, GlossaryEntry> = {
  clusterTable: {
    term: "Cluster im aktiven Snapshot-Scope",
    description:
      "Alle Cluster der aktiven Snapshots als Ausgangspunkt der Wartungsplanung. Klicke eine Zeile an, um im Panel rechts Fenster und Verantwortliche zu pflegen, hake dann die zu wartenden Cluster an und erzeuge oben rechts über „Wartungsankündigung“ die fertige Mail. Mehrfachauswahl erlaubt Bulk-Bearbeitung.",
  },
};
