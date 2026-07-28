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
      "Vergleicht je Ziel-Cluster den Ist-Zustand („Vorher“) mit dem geplanten Zustand nach den Verschiebungen („Nachher“) – CPU-/RAM-Auslastung, vCPU/Core, RAM-Commit sowie (bei vROps-Import) die HIGH-RP-RAM-Zuweisung und die Site-Failover-Ampel. So erkennst du Overcommit- und Ausfallskonzept-Risiken, bevor du migrierst; die vollständige Gegenüberstellung steht direkt oberhalb dieser Zusammenfassung.",
  },
  vmSelection: {
    term: "VM-Auswahl",
    description:
      "Quelle für dein Szenario: Hier VMs markieren (Shift-Klick wählt einen Bereich) und anschließend über die Auswahl-Leiste einem Ziel-Cluster zuweisen. Der globale Filter oben schränkt die Liste ein.",
  },
};

/* ------------------------------------------------------------------ */
/*  Fill Up – Eingaben, Ergebnisse und Clustervergleich              */
/* ------------------------------------------------------------------ */
export const FILL_UP_UI: Record<string, GlossaryEntry> = {
  capacity: {
    term: "Fill-Up-Kapazität",
    description:
      "Ermittelt, wie viele definierte zusätzliche VMs ein Cluster in historischen Lastspitzen noch aufnehmen kann. Grundlage sind vROps-Zeitreihen, eingefrorene RVTools-Beziehungen und die wirksame Kapazitäts-Policy; die Berechnung läuft ausschließlich lokal im Browser.",
  },
  timeSeriesImport: {
    term: "Zeitreihenimport",
    description:
      "Vollständiger, zusammengehöriger VM-, Cluster- und Host-Export aus vROps. Das Stundenraster und der beim Import gewählte RVTools-Snapshot bleiben für die Auswertung eingefroren.",
    source: "vROps · VM-, Cluster- und Host-Zeitreihen",
  },
  n2: {
    term: "N-2 analysieren",
    description:
      "Berechnet zusätzlich den Verlust von zwei Hosts. Ob ein Verstoß dabei die Empfehlung wirklich begrenzt, entscheidet die aktive Policy mit „N-2 als harte Grenze“.",
  },
  highShare: {
    term: "Zusätzlicher HIGH-Anteil",
    description:
      "Anteil der neu hinzugedachten VMs, die mit dem HIGH-Profil gerechnet werden. Er beschreibt nur den zusätzlichen Workload – nicht die aktuelle HIGH/STD-Verteilung im Cluster.",
  },
  workloadProfiles: {
    term: "Typische zusätzliche VM",
    description:
      "Definiert synthetische VM-Profile für die Fill-Up-Empfehlung. Der CPU-Wert ist der P95-Demand, damit kurzzeitige Spitzen im Planungswert berücksichtigt werden.",
  },
  profileName: {
    term: "Profilname",
    description: "Frei wählbare Bezeichnung der synthetischen zusätzlichen VM. Sie wird in Ergebnissen und gespeicherten Analyzer-Runs verwendet.",
  },
  profileClass: {
    term: "Klasse",
    description: "HIGH-Profile zählen in HIGH-spezifischen Szenarien und Site-Failover mit; STD-Profile werden im gemeinsamen Workload-Mix berücksichtigt.",
  },
  profileVcpu: {
    term: "vCPU",
    description: "Konfigurierte virtuelle CPUs je zusätzlicher VM. Der Wert fließt in die vCPU/Core-Guardrails ein.",
  },
  profileMemory: {
    term: "RAM MiB",
    description: "Konfigurierter Arbeitsspeicher je zusätzlicher VM. Er wird gegen die verfügbaren RAM-Headrooms und Reserven geprüft.",
  },
  profileP95: {
    term: "P95 MHz",
    description: "95. Perzentil der CPU-Demand in MHz je zusätzlicher VM. Das bedeutet: 95 % der betrachteten Werte liegen höchstens auf diesem Niveau.",
  },
  dataQuality: {
    term: "Datenstand & Vertrauensniveau",
    description:
      "Zeigt Zeitraum, Datenqualität und daraus abgeleitetes Vertrauen der ausgewählten Zeitreihe. Blockierende Befunde verhindern belastbare Szenarien; Warnungen schränken die Aussagekraft ein.",
  },
  dataObjects: {
    term: "Objekte",
    description: "Anzahl der im Dateisatz erkannten VM-, Cluster- und Host-Zeitreihen.",
    source: "vROps-Import",
  },
  blockingFindings: {
    term: "Blockierende Befunde",
    description: "Datenprobleme, die eine belastbare Fill-Up-Berechnung verhindern oder ein Ergebnis als nicht berechenbar markieren.",
  },
  warnings: {
    term: "Warnungen",
    description: "Nicht blockierende Auffälligkeiten wie teilweise fehlende Zeitreihenwerte. Sie bleiben im Ergebnis sichtbar und senken gegebenenfalls das Vertrauensniveau.",
  },
  clusterComparison: {
    term: "Clustervergleich",
    description:
      "Verdichtete Gegenüberstellung aller berechenbaren Cluster. Jede Spalte bezieht sich auf die ungünstigste historische Stunde des jeweiligen Szenarios; ein Klick öffnet den Verlauf und die aktiven Guardrails.",
  },
  details: {
    term: "Cluster-Details",
    description: "Zeigt die für den ausgewählten Cluster maßgeblichen Kennzahlen, Guardrails und den historischen Verlauf der direkt importierten Clusterzeitreihe.",
  },
  sharedMix: {
    term: "Gemeinsamer Mix",
    description: "Maximale Anzahl zusätzlicher VMs mit dem oben eingestellten HIGH/STD-Anteil. Der Wert wird durch die engste aktive harte Guardrail begrenzt.",
  },
  n1Loss: {
    term: "N-1-Verlust",
    description: "Relativer Verlust an aufnehmbarer Kapazität, wenn ein Host im Cluster ausfällt. Die Auswertung nutzt die ungünstigste zulässige Host-Entfernung.",
  },
  cpuDemand: {
    term: "CPU Demand",
    description: "Historische CPU-Nachfrage des Clusters in MHz zum ungünstigsten betrachteten Normalbetriebsslot.",
    source: "vROps · Cluster CPU Demand Avg",
  },
  assignedMemory: {
    term: "RAM zugewiesen",
    description: "Berechnete Summe des konfigurierten VM-RAMs im betrachteten Slot. Sie wird getrennt von der vROps-Speicherauslastung gegen die Policy geprüft.",
    source: "RVTools · vInfo · „Memory“",
  },
  guardrails: {
    term: "Aktive Guardrails",
    description: "Grenzwerte der wirksamen Policy, die die Empfehlung begrenzen. „hart“ bedeutet: Ein Verstoß reduziert die mögliche VM-Anzahl; „Info“ dient nur der Einordnung.",
  },
  historicalTrend: {
    term: "Historischer Verlauf",
    description: "Direkt importierte Cluster-CPU-Demand und Speichernutzung über den ausgewählten Zeitraum. Die Szenarioberechnung sucht darin je Szenario den ungünstigsten Stundenwert.",
    source: "vROps · Cluster-Zeitreihen",
  },
  runHistory: {
    term: "Gespeicherte Analyzer-Runs",
    description: "Lokale, unveränderliche Momentaufnahmen aus Import, Policy, Workload-Profilen und Ergebnis. Sie ermöglichen den Vergleich späterer Planungsstände ohne Serverpersistenz.",
  },
};

export const FILL_UP_COLUMNS: Record<string, GlossaryEntry> = {
  cluster: {
    term: "Cluster",
    description: "RVTools-Cluster, für den die vROps-Objekte eindeutig zugeordnet und die Kapazität berechnet wurden. Die zweite Zeile grenzt denselben Clusternamen vCenter-sicher ein.",
    source: "RVTools · vCluster / vROps-Import",
  },
  scope: {
    term: "Hosts / Sites",
    description: "Anzahl der in die Berechnung einbezogenen Hosts und Anzahl unterschiedlicher Standortkennungen. Sites werden für HIGH-Site-Failover benötigt.",
    source: "RVTools · vHost / lokale Standortzuordnung",
  },
  policy: {
    term: "Policy",
    description: "Wirksame Version der Kapazitäts-Policy für diesen Cluster – einschließlich einer möglichen lokalen Clusterzuweisung und deren Einzel-Overrides.",
    source: "Kapazitäts-Policy (lokal gepflegt)",
  },
  mix: {
    term: "Mix +VM",
    description: "Maximale Anzahl zusätzlicher VMs im eingestellten HIGH/STD-Mix. Der Wert gilt nur, solange keine aktive harte Guardrail verletzt wird.",
  },
  headroom: {
    term: "Unabhängig",
    description: "Separate Obergrenzen für zusätzliche vCPU und RAM. Sie kombinieren die Ressourcen nicht zu einem VM-Mix und sind deshalb als Diagnose neben „Mix +VM“ ausgewiesen.",
  },
  n1: {
    term: "N-1",
    description: "Status nach Ausfall eines Hosts. Erfüllt bedeutet, dass alle aktiven harten Guardrails im ungünstigsten N-1-Slot eingehalten werden.",
  },
  n2: {
    term: "N-2",
    description: "Status nach Ausfall zweier Hosts. „Info“ bedeutet, dass N-2 zwar gerechnet wurde, die Policy es aber nicht als harte Begrenzung verwendet.",
  },
  site: {
    term: "HIGH Site",
    description: "Schlechtester Status aller berechenbaren Standort-Failover-Szenarien für HIGH-Workloads. Voraussetzung sind mindestens zwei eindeutig zuordenbare Sites.",
  },
  limiter: {
    term: "Limiter",
    description: "Die Guardrail, die den gemeinsamen zusätzlichen VM-Mix aktuell zuerst begrenzt, inklusive des Szenarios, in dem sie wirkt.",
  },
};
