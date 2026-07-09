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
  modelDetail: {
    term: "Modelle und Varianten im Detail",
    description:
      "Jede Karte bündelt Hosts einer identischen Hardware-Variante samt CPU-, Core- und RAM-Eckdaten. Klicke einen Host-Namen an, um HBAs, NICs und laufende VMs im Detail zu öffnen. Grundlage für Standardisierung und Refresh-Planung.",
  },
};
