import type { GlossaryEntry } from "@/lib/glossary";

/** Glossar für Lizenzdetails im vCenter-Bereich und die Cluster-Dichte. */

const RV = "RVTools";

/* ------------------------------------------------------------------ */
/*  Tabelle „Lizenz Details“                                          */
/* ------------------------------------------------------------------ */
export const LICENSING_COLUMNS: Record<string, GlossaryEntry> = {
  name: {
    term: "Lizenz",
    description: "Produkt-/Editionsname der Lizenz laut vCenter.",
    source: `${RV} · vLicense · „Name“`,
  },
  key: {
    term: "Key",
    description: "Lizenzschlüssel (meist maskiert). Identifiziert die Lizenz eindeutig.",
    source: `${RV} · vLicense · „Key“`,
  },
  costUnit: {
    term: "Einheit",
    description:
      "Abrechnungseinheit der Lizenz, z.B. CPU-Sockel, Cores oder Instanzen. Bestimmt, wie „Total“ und „Verwendet“ zu lesen sind.",
    source: `${RV} · vLicense · „Cost Unit“`,
  },
  total: {
    term: "Total",
    description: "Verfügbare Kapazität der Lizenz in ihrer Einheit (z.B. Anzahl Sockel).",
    source: `${RV} · vLicense · „Total“`,
  },
  used: {
    term: "Verwendet",
    description: "Aktuell belegte Einheiten der Lizenz.",
    source: `${RV} · vLicense · „Used“`,
  },
  usedPct: {
    term: "Auslastung",
    description:
      "Verhältnis Verwendet zu Total. Gelb ab 85 %, rot ab 95 % – ab hier droht bei Erweiterung eine Lizenzverletzung.",
  },
  expiration: {
    term: "Ablauf",
    description: "Ablaufdatum der Lizenz. „Never“ = unbefristet; ein Datum erfordert Verlängerungsplanung.",
    source: `${RV} · vLicense · „Expiration Date“`,
  },
  features: {
    term: "Features",
    description: "Im Lizenzumfang enthaltene Funktionen (gekürzt dargestellt). Zeigt die Edition und ihre Feature-Grenzen.",
    source: `${RV} · vLicense · „Features“`,
  },
};

/* ------------------------------------------------------------------ */
/*  Tabelle „Cluster Dichte & Effizienz“                              */
/* ------------------------------------------------------------------ */
export const CLUSTER_DENSITY_COLUMNS: Record<string, GlossaryEntry> = {
  cluster: {
    term: "Cluster",
    description: "HA/DRS-Cluster, für den Dichte und Auslastung berechnet werden.",
    source: `${RV} · vCluster`,
  },
  hosts: {
    term: "Hosts",
    description: "Anzahl der ESXi-Hosts im Cluster – Nenner für die VM-Dichte.",
    source: `${RV} · vHost · „Cluster“`,
  },
  vmsPerHost: {
    term: "VMs/Host",
    description:
      "Durchschnittliche Anzahl eingeschalteter VMs je Host. Kennzahl für Konsolidierungsgrad; sehr hohe Werte können HA-Reserven und Performance gefährden.",
  },
  vcpuPerCore: {
    term: "vCPU/Core",
    description:
      "vCPU-Overcommit: zugewiesene vCPUs eingeschalteter VMs je physischem Core. Ab 4:1 (gelb) bzw. 5:1 (rot) steigt das Risiko von CPU-Ready-Zeiten.",
  },
  ramUtilPct: {
    term: "RAM Util %",
    description:
      "Anteil des zugewiesenen VM-RAM an der physischen Cluster-Kapazität. Ab 50 % (gelb) bzw. 70 % (rot) schrumpft der Puffer für Spitzen und Host-Ausfälle.",
  },
  vropsAvgVmsPerHost: {
    term: "VMs/Host (vROps Ist)",
    description:
      "Tatsächliche durchschnittliche Anzahl laufender VMs je Host laut vROps zum Erfassungszeitpunkt – Ist-Wert neben dem aus RVTools berechneten „VMs/Host“. „—“ ohne vROps-Import.",
    source: "vROps-Dashboard-Export · Panel 6",
  },
};

/* ------------------------------------------------------------------ */
/*  Abschnitts-Überschriften (Sinn + Arbeitsweise)                    */
/* ------------------------------------------------------------------ */
export const LICENSING_SECTIONS: Record<string, GlossaryEntry> = {
  licenseTable: {
    term: "Lizenz Details",
    description:
      "Vollständige Lizenzliste mit Einheit, Belegung, Ablauf und Features. Prüfe Einheit und Auslastung gemeinsam, um kern- vs. sockelbasierte Lizenzierung korrekt zu bewerten, und behalte Ablaufdaten für die Verlängerungsplanung im Blick.",
  },
  clusterDensity: {
    term: "Cluster Dichte & Effizienz",
    description:
      "Konsolidierungsgrad je Cluster: VMs pro Host, vCPU-Overcommit und RAM-Auslastung. Nutze die Kennzahlen, um über- und unterausgelastete Cluster zu erkennen und Workloads oder Lizenzen gezielt auszubalancieren – hohe Overcommit-Werte gegen CPU-Ready-/RAM-Reserven abwägen.",
  },
};
