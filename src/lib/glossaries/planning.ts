import type { GlossaryEntry } from "@/lib/glossary";

/**
 * Glossar für die Seite „Planung“.
 *
 * Zielgruppe: VMware-Administrator:innen. Die Planung spielt What-if-Szenarien
 * durch: VMs werden Ziel-Clustern zugewiesen und die Auswirkung auf CPU-/RAM-
 * Auslastung und Overcommit vor der eigentlichen Migration bewertet.
 */

/* ------------------------------------------------------------------ */
/*  Planung – Tabelle „VM-Auswahl“                                   */
/* ------------------------------------------------------------------ */
export const PLANNING_COLUMNS: Record<string, GlossaryEntry> = {
  vmName: {
    term: "VM",
    description: "Anzeigename der VM. Über die Auswahl-Spalte links werden VMs für ein Szenario markiert.",
    source: `RVTools · vInfo · „VM“`,
  },
  cluster: {
    term: "Cluster",
    description: "Aktuelles HA/DRS-Cluster der VM – der Ausgangspunkt („Vorher“) für eine geplante Verschiebung.",
    source: `RVTools · vInfo · „Cluster“`,
  },
  host: {
    term: "Host",
    description: "ESXi-Host, auf dem die VM zum Zeitpunkt des Exports lief.",
    source: `RVTools · vInfo · „Host“`,
  },
  powerState: {
    term: "Power",
    description:
      "Energiezustand der VM. Nur eingeschaltete VMs verbrauchen laufend Ressourcen und wirken sich im What-if auf die Cluster-Auslastung aus.",
    source: `RVTools · vInfo · „Powerstate“`,
  },
  cpuCount: {
    term: "vCPU",
    description: "Anzahl zugewiesener virtueller CPUs. Bestimmt den vCPU-Zuwachs im Ziel-Cluster nach der Verschiebung.",
    source: `RVTools · vInfo · „CPUs“`,
  },
  memoryMiB: {
    term: "RAM GiB",
    description: "Konfigurierter Arbeitsspeicher der VM in GiB. Bestimmt den RAM-Zuwachs im Ziel-Cluster nach der Verschiebung.",
    source: `RVTools · vInfo · „Memory“`,
  },
};

/* ------------------------------------------------------------------ */
/*  Planung – Abschnitts-Überschriften                               */
/* ------------------------------------------------------------------ */
export const PLANNING_SECTIONS: Record<string, GlossaryEntry> = {
  groups: {
    term: "Gruppen",
    description:
      "Zeigt, welche VMs im aktiven Szenario welchem Ziel-Cluster zugewiesen sind. Über „Laden“ holst du eine Gruppe zurück in die VM-Auswahl, um sie zu ändern; das Papierkorb-Symbol entfernt die Zuweisung wieder.",
  },
  whatIf: {
    term: "What-If Zusammenfassung",
    description:
      "Vergleicht je Ziel-Cluster den Ist-Zustand („Vorher“) mit dem geplanten Zustand nach den Verschiebungen („Nachher“) – CPU-/RAM-Auslastung, vCPU/Core und RAM-Commit. So erkennst du Overcommit-Risiken, bevor du migrierst; die vollständige Gegenüberstellung öffnet der Button „What-If“.",
  },
  vmSelection: {
    term: "VM-Auswahl",
    description:
      "Quelle für dein Szenario: Hier VMs markieren (Shift-Klick wählt einen Bereich) und anschließend über die Auswahl-Leiste einem Ziel-Cluster zuweisen. Der globale Filter oben schränkt die Liste ein.",
  },
};
