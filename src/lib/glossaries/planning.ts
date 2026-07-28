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
  observedProfiles: {
    term: "Beobachtete VM-Profile",
    description: "Verdichtet die mit RVTools eindeutig verknüpften VM-Zeitreihen je Cluster und Resource Pool. CPU-Demand wird über alle vorhandenen VM-Stunden gemittelt; P95 ist der konservative Wert zur Übernahme in ein Fill-Up-Profil. RAM ist der konfigurierte RVTools-RAM, weil der aktuelle VM-CSV-Vertrag keine Zeitreihe der VM-Speichernutzung enthält.",
    source: "RVTools · vInfo / vROps · VM CPU Demand Avg und VM CPU Ready Max",
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
    term: "RAM GiB",
    description: "Konfigurierter Arbeitsspeicher je zusätzlicher VM in GiB. Intern wird er verlustfrei als MiB gespeichert und gegen die verfügbaren RAM-Headrooms und Reserven geprüft.",
  },
  profileP95: {
    term: "P95 GHz",
    description: "95. Perzentil der CPU-Demand in GHz je zusätzlicher VM. Das bedeutet: 95 % der betrachteten Werte liegen höchstens auf diesem Niveau; intern rechnet die Engine in MHz.",
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
    term: "CPU Demand GHz",
    description: "Historische CPU-Nachfrage des Clusters in GHz zum ungünstigsten betrachteten Normalbetriebsslot. Die importierte Quelle wird intern in MHz normalisiert.",
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
  observedScope: {
    term: "Cluster / Resource Pool",
    description: "„Gesamt“ fasst alle eindeutig verknüpften VM-Zeitreihen eines Clusters zusammen. Die übrigen Zeilen verwenden die exakte Resource-Pool-Zuweisung aus dem eingefrorenen RVTools-Snapshot.",
    source: "RVTools · vInfo · „Resource pool“",
  },
  observedVms: {
    term: "VMs",
    description: "Anzahl der zum Scope gehörenden, eindeutig verknüpften VMs. Die zweite Zahl zeigt, für wie viele davon mindestens ein CPU-Demand-Wert vorliegt.",
    source: "RVTools / vROps-VM-Zeitreihe",
  },
  observedVcpu: { term: "Ø vCPU", description: "Arithmetischer Mittelwert der konfigurierten virtuellen CPUs je VM im Scope.", source: "RVTools · vInfo · „CPUs“" },
  observedMemory: { term: "Ø RAM", description: "Arithmetischer Mittelwert des konfigurierten VM-RAMs. Dies ist keine historische VM-RAM-Auslastung.", source: "RVTools · vInfo · „Memory“" },
  observedCpuAverage: { term: "CPU Ø", description: "Über alle verfügbaren VM-Stunden im Scope gewichteter mittlerer CPU-Demand.", source: "vROps · VM CPU Demand Avg" },
  observedCpuP95: { term: "CPU P95", description: "95. Perzentil der verfügbaren VM-Stunden im Scope. Dieser konservative CPU-Demand wird beim Übernehmen als Planungswert der zusätzlichen VM verwendet.", source: "vROps · VM CPU Demand Avg" },
  observedReadyP95: { term: "Ready P95", description: "95. Perzentil von VM CPU Ready. Es beschreibt CPU-Wartezeit und dient zur Einordnung; es wird nicht in den zusätzlichen VM-Verbrauch übernommen.", source: "vROps · VM CPU Ready Max" },
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

/** Erläuterungen direkt an den editierbaren Werten einer Fill-Up-Policy. */
export const FILL_UP_POLICY_FIELDS: Record<string, GlossaryEntry> = {
  lookbackDays: { term: "Rückblick", description: "Anzahl der zurückliegenden Tage, aus denen die historische Stundenreihe für die Planungsbetrachtung berücksichtigt wird. Ein längerer Zeitraum glättet Ausreißer, kann aber ältere Lastmuster einbeziehen." },
  planningPercentile: { term: "Planungsperzentil", description: "Legt fest, welcher obere Lastwert aus dem Rückblick als Planungsniveau gilt. Bei P95 liegen 95 % der gemessenen Stunden höchstens auf diesem Niveau; die oberen 5 % sind stärker. Es begrenzt die Aufnahme zusätzlich zu den Szenario-Guardrails." },
  maxVcpuPerCoreNormal: { term: "vCPU/Core Normal", description: "Maximal zulässige virtuelle CPUs pro verbleibendem physischem Core im Normalbetrieb. Beispiel: 4,00 erlaubt bei 100 Cores höchstens 400 vCPU." },
  maxVcpuPerCoreN1: { term: "vCPU/Core N-1", description: "Maximal zulässige vCPU/Core nach Ausfall eines Hosts. Die verfügbaren Cores werden im ungünstigsten N-1-Szenario neu bestimmt." },
  maxVcpuPerCoreN2: { term: "vCPU/Core N-2", description: "Maximal zulässige vCPU/Core nach Ausfall von zwei Hosts. Der Wert wirkt nur, wenn N-2 analysiert wird; die Policy entscheidet zusätzlich, ob er hart begrenzt." },
  cpuDemandWarnPctNormal: { term: "Demand Warn Normal", description: "Warnschwelle für CPU-Demand im Normalbetrieb, bezogen auf die im jeweiligen Stunden-Slot verfügbare CPU-Kapazität." },
  cpuDemandDangerPctNormal: { term: "Demand Danger Normal", description: "Harte CPU-Demand-Grenze im Normalbetrieb. Oberhalb dieses Anteils der verfügbaren CPU-Kapazität kann kein weiterer Workload empfohlen werden." },
  cpuDemandWarnPctN1: { term: "Demand Warn N-1", description: "Warnschwelle für CPU-Demand nach Ausfall eines Hosts, gemessen gegen die verbleibende CPU-Kapazität." },
  cpuDemandDangerPctN1: { term: "Demand Danger N-1", description: "Harte CPU-Demand-Grenze nach Ausfall eines Hosts. Sie ist meist die konservativere Grenze für die Fill-Up-Empfehlung." },
  cpuDemandWarnPctN2: { term: "Demand Warn N-2", description: "Warnschwelle für CPU-Demand nach Ausfall von zwei Hosts." },
  cpuDemandDangerPctN2: { term: "Demand Danger N-2", description: "Harte CPU-Demand-Grenze nach Ausfall von zwei Hosts, sofern N-2 als harte Grenze aktiviert ist." },
  cpuReadyWarnPct: { term: "CPU Ready Warn", description: "Warnschwelle für CPU Ready der bestehenden VMs. Ready beschreibt Wartezeit auf CPU-Zuteilung; der Wert wird als reale Prozentzahl verarbeitet." },
  cpuReadyDangerPct: { term: "CPU Ready Danger", description: "Kritische CPU-Ready-Grenze. Wird sie in der historischen Betrachtung überschritten, wird zusätzliche CPU-Last nicht empfohlen." },
  cpuContentionWarnPct: { term: "Contention Warn", description: "Warnschwelle für Cluster-CPU-Contention aus vROps. Sie signalisiert konkurrierende CPU-Anforderungen im Cluster." },
  cpuContentionDangerPct: { term: "Contention Danger", description: "Kritische Grenze für Cluster-CPU-Contention aus vROps. Oberhalb dieses Werts wird der Cluster als zu umkämpft für zusätzliche Last behandelt." },
  totalRamAssignedWarnPct: { term: "Gesamt-RAM Warn", description: "Warnschwelle für die Summe des konfigurierten VM-RAMs im Verhältnis zur nach Reserven verfügbaren Host-RAM-Kapazität." },
  totalRamAssignedDangerPct: { term: "Gesamt-RAM Danger", description: "Harte Grenze für zugewiesenen VM-RAM. Sie begrenzt den Workload-Mix, bevor der Cluster seine planbare RAM-Kapazität überschreitet." },
  memoryUtilizationWarnPct: { term: "Memory Util. Warn", description: "Warnschwelle für die direkt aus vROps gelesene Speichernutzung. Sie ergänzt die Konfigurationssicht des zugewiesenen VM-RAMs." },
  memoryUtilizationDangerPct: { term: "Memory Util. Danger", description: "Kritische vROps-Speichernutzungsgrenze. Sie verhindert Empfehlungen, wenn die tatsächliche Nutzung bereits hoch ist." },
  highRamAssignedWarnPct: { term: "HIGH-RAM Warn", description: "Warnschwelle für den konfigurierten RAM der HIGH-Workloads in einem HIGH-Site-Failover-Szenario." },
  highRamAssignedDangerPct: { term: "HIGH-RAM Danger", description: "Harte Grenze für HIGH-Workload-RAM im Site-Failover. Sie sichert, dass HIGH-VMs nach Standortausfall weiter untergebracht werden können." },
  highCpuSiteWarnPct: { term: "HIGH-Site-CPU Warn", description: "Warnschwelle für CPU-Demand der HIGH-Workloads nach Ausfall eines Standorts." },
  highCpuSiteDangerPct: { term: "HIGH-Site-CPU Danger", description: "Harte CPU-Demand-Grenze für HIGH-Workloads im Standort-Failover." },
  cpuSafetyBufferPct: { term: "CPU-Sicherheitspuffer", description: "Zusätzlicher Anteil der CPU-Kapazität, der vor der Berechnung reserviert bleibt. Er wird nicht als freie Fill-Up-Kapazität ausgegeben." },
  ramSafetyBufferPct: { term: "RAM-Sicherheitspuffer", description: "Zusätzlicher Anteil der RAM-Kapazität, der vor der Berechnung reserviert bleibt. Er reduziert bewusst die planbare Kapazität." },
  ramSystemReserveMiBPerHost: { term: "RAM-Systemreserve je Host", description: "Pro Host reservierter Arbeitsspeicher für ESXi und Betriebsreserven. Die Eingabe und Anzeige erfolgen in GiB; intern speichert die Policy den Wert in MiB." },
  maxSingleVmHostCpuPct: { term: "Einzel-VM CPU je Host", description: "Maximaler Anteil der CPU-Kapazität eines einzelnen Hosts, den eine zusätzliche VM beanspruchen darf. Schützt die Platzierbarkeit vor zu großen VMs." },
  maxSingleVmHostRamPct: { term: "Einzel-VM RAM je Host", description: "Maximaler Anteil des verfügbaren RAM eines einzelnen Hosts für eine zusätzliche VM. Schützt die Platzierbarkeit vor zu großen VMs." },
  requireN1: { term: "N-1 erforderlich", description: "Macht den Ausfall eines Hosts zur verpflichtenden harten Bedingung für die Fill-Up-Empfehlung." },
  useN2AsHardLimit: { term: "N-2 als harte Grenze", description: "Wertet N-2-Verstöße als harte Begrenzung statt als reine Information. N-2 muss zusätzlich in den Eingaben aktiviert sein." },
  requireHighSiteFailover: { term: "HIGH-Site-Failover erforderlich", description: "Macht den Standort-Failover für HIGH-Workloads zu einer harten Bedingung, sofern die Standortzuordnung berechenbar ist." },
};
