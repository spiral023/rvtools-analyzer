import type { GlossaryEntry } from "@/lib/glossary";

/**
 * Glossar für die Seite „Hardware“.
 *
 * Zielgruppe: VMware-Administrator:innen. Die Seite arbeitet mit KPIs,
 * zwei Diagrammen und einer Modell-/Varianten-Kartenübersicht (keine Tabellen).
 */

const RV = "RVTools";

/* ------------------------------------------------------------------ */
/*  KPIs                                                               */
/* ------------------------------------------------------------------ */
export const HARDWARE_KPI: Record<string, GlossaryEntry> = {
  hosts: {
    term: "ESXi Hosts",
    description:
      "Anzahl der physischen ESXi-Hosts im aktuellen Filter. Grundgesamtheit der Hardware-Analyse.",
    source: `${RV} · vHost`,
  },
  variants: {
    term: "Hardware-Varianten",
    description:
      "Anzahl unterschiedlicher Hardware-Konfigurationen, gebildet aus Hersteller, Modell, CPU-Modell, Core-Anzahl und CPU-Takt (RAM optional). Weniger Varianten = besser standardisierte Flotte.",
  },
  vendors: {
    term: "Hersteller",
    description: "Anzahl unterschiedlicher Hardware-Hersteller. Ein Indikator für die Heterogenität des Host-Bestands.",
    source: `${RV} · vHost · „Vendor“`,
  },
  vms: {
    term: "VMs gesamt",
    description:
      "Summe der auf den gefilterten Hosts laufenden VMs. Hilft, Konsolidierungsgrad und Last je Hardware-Variante einzuordnen.",
    source: `${RV} · vHost · „# VMs“`,
  },
};

/* ------------------------------------------------------------------ */
/*  Spalten der Varianten-Übersicht                                    */
/* ------------------------------------------------------------------ */
export const HARDWARE_VARIANT_COLUMNS: Record<string, GlossaryEntry> = {
  model: {
    term: "Variante",
    description: "Hardware-Modell der Variante. Mehrere Modellbezeichnungen desselben Profils werden mit „/“ zusammengefasst.",
    source: `${RV} · vHost · „Model“`,
  },
  cpuModel: {
    term: "CPU-Modell",
    description: "CPU-Typ der Variante. Teil der Varianten-Signatur.",
    source: `${RV} · vHost · „CPU Model“`,
  },
  vendor: {
    term: "Hersteller",
    description: "Hardware-Hersteller der Variante.",
    source: `${RV} · vHost · „Vendor“`,
  },
  hosts: {
    term: "Hosts",
    description: "Anzahl der ESXi-Hosts mit dieser Hardware-Variante.",
  },
  clusters: {
    term: "Cluster",
    description: "Anzahl der Cluster, in denen Hosts dieser Variante Mitglied sind. Die Clusternamen erscheinen beim Überfahren der Zelle.",
  },
  coresPerHost: {
    term: "Cores/Host",
    description: "Physische CPU-Kerne je Host dieser Variante.",
    source: `${RV} · vHost · „# Cores“`,
  },
  ghzPerHost: {
    term: "GHz/Host",
    description: "CPU-Taktfrequenz je Host dieser Variante.",
    source: `${RV} · vHost · „Speed“`,
  },
  ramPerHost: {
    term: "RAM/Host",
    description: "Arbeitsspeicher je Host. Bei abweichenden RAM-Größen innerhalb der Variante werden alle Werte bzw. der Bereich angezeigt.",
    source: `${RV} · vHost · „# Memory“`,
  },
  totalCores: {
    term: "Cores Σ",
    description: "Physische CPU-Kerne aller Hosts der Variante (Cores je Host × Anzahl Hosts).",
  },
  totalGhz: {
    term: "GHz Σ",
    description: "Grobe Rechenkapazität der Variante: Cores gesamt × CPU-Takt.",
  },
  totalRam: {
    term: "RAM Σ",
    description: "Summe des Arbeitsspeichers aller Hosts der Variante.",
  },
  totalVms: {
    term: "VMs Σ",
    description: "Summe der VMs, die auf Hosts dieser Variante laufen.",
    source: `${RV} · vHost · „# VMs“`,
  },
};

/* ------------------------------------------------------------------ */
/*  Abschnitts-Überschriften (Sinn + Arbeitsweise)                     */
/* ------------------------------------------------------------------ */
export const HARDWARE_SECTIONS: Record<string, GlossaryEntry> = {
  modelDistribution: {
    term: "Host-Modellvarianten Verteilung",
    description:
      "Anzahl der Hosts je Hardware-Variante (Modell · Cores · RAM). Nutze das Diagramm, um dominante Plattformen und Einzelstücke zu erkennen – lange Ausläufer mit nur einem Host sind Standardisierungs- oder Refresh-Kandidaten.",
  },
  vendorDistribution: {
    term: "Hersteller",
    description:
      "Verteilung der Hosts nach Hersteller. Zeigt die Abhängigkeit von einzelnen Lieferanten und hilft bei Support-, Wartungsvertrags- und Beschaffungsentscheidungen.",
  },
  variantSummary: {
    term: "Varianten-Übersicht",
    description:
      "Sortierbare Tabelle aller Hardware-Varianten mit Werten je Host (Cores, Takt, RAM) und Gesamtwerten je Variante (Cores, GHz, RAM, VMs). GHz gesamt = Cores gesamt × CPU-Takt, als grobe Rechenkapazität. Klicke eine Zeile für die Detailansicht der Variante.",
  },
  modelDetail: {
    term: "Modelle und Varianten im Detail",
    description:
      "Jede Karte bündelt Hosts einer identischen Hardware-Variante samt CPU-, Core- und RAM-Eckdaten. Klicke einen Host-Namen an, um HBAs, NICs und laufende VMs im Detail zu öffnen. Grundlage für Standardisierung und Refresh-Planung.",
  },
};
