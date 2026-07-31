import type { RowData } from "@tanstack/react-table";

/**
 * Zentrales Glossar für erklärende Tooltips.
 *
 * Zielgruppe: VMware-Administrator:innen. Jeder Eintrag erklärt einen Begriff
 * knapp in Admin-Sprache; `source` verweist – wo sinnvoll – auf das RVTools-Sheet
 * und die Originalspalte, aus der der Wert stammt.
 */
export interface GlossaryEntry {
  /** Kurzer Begriff (Eyebrow im Tooltip). */
  term: string;
  /** Erklärung in 1–3 Sätzen. Bei Überschriften auch: Sinn des Bereichs + Arbeitsweise. */
  description: string;
  /** Optionale Herkunft, z.B. `RVTools · vCPU · „Ready %"`. */
  source?: string;
}

// TanStack-Table-Spalten können eine Glossar-Erklärung als Meta tragen; die
// VirtualTable rendert daraus automatisch einen Tooltip im Spaltenkopf.
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    info?: GlossaryEntry;
    /** Überschrift, unter der die Spaltenkonfiguration der VirtualTable diese Spalte einsortiert. */
    group?: string;
  }
}

const RV = "RVTools";

/* ------------------------------------------------------------------ */
/*  Sidebar – Sinn jedes Navigationsbereichs                          */
/* ------------------------------------------------------------------ */
export const SIDEBAR_GLOSSARY: Record<string, GlossaryEntry> = {
  "/clusters": {
    term: "Cluster",
    description:
      "Cluster-Arbeitsbereich für Übersicht und Kapazität. vCenter-, Cluster- und Suchfilter gelten für beide Ansichten.",
  },
  "/overview": {
    term: "Overview",
    description:
      "Flottenweiter Einstieg: VMs, Hosts, Datastores und Health-Events der aktiven Snapshots auf einen Blick. Startpunkt für jede Analyse.",
  },
  "/upload": {
    term: "Uploads",
    description:
      "Droppe unterstützte Dateien einfach hier oder klicke für Details. RVTools-Exporte (.xlsx) und weitere Importe landen im Hintergrund in der Warteschlange – du kannst währenddessen ungestört weiterarbeiten. Je vCenter wird ein aktueller Stand gehalten; ein neuer Export ersetzt den bisherigen Stand desselben vCenters.",
  },
  "/storage-backup": {
    term: "Storage / Backup",
    description:
      "Datastores, virtuelle Disks und Gast-Partitionen sowie Backup-Frische und Snapshot-Konflikte. Für Storage-Auslastung und Datensicherungs-Lücken.",
  },
  "/network-security": {
    term: "Netzwerk",
    description:
      "Virtuelle NICs, Portgruppen, VLANs und vSwitch-Zuordnungen. Für Netzwerk-Inventar und Auffälligkeiten in der Anbindung der VMs.",
  },
  "/network-audit": {
    term: "Netzwerk-Kontrolle",
    description:
      "Gleicht Eramon-Switch-Ports gegen CDP, RVTools, Tech-Info und IPAM ab. Die Tabs führen von der Übersicht in die einzelnen Prüfungen und zeigen bestätigte Zuordnungen, Datenlücken und Widersprüche.",
    source: "Eramon · CDP-CSV · RVTools · Tech-Info · IPAM",
  },
  "/hardware": {
    term: "Hardware",
    description:
      "Physische ESXi-Hosts: Hersteller, Modelle, CPU-Bestückung, BIOS sowie HBAs und NICs. Basis für Hardware-Standardisierung und Refresh-Planung.",
  },
  "/tech-info": {
    term: "Tech-Info",
    description:
      "Ergänzende Betriebs-/CMDB-Daten je Server und Client (z.B. Pool, User, Standort, Verantwortliche), verknüpft mit den RVTools-Systemen.",
  },
  "/vcenter": {
    term: "vCenter",
    description:
      "Zwei Snapshots oder vCenter gegenüberstellen: Was ist neu, entfallen oder verändert? Für Drift-Erkennung und Vorher/Nachher-Vergleiche.",
  },
  "/hosts": {
    term: "Hosts",
    description:
      "Inventar aller ESXi-Hosts und ihre Verteilung auf aktuelle ESXi-Releases.",
  },
  "/vms": {
    term: "VMs",
    description:
      "Virtuelle Maschinen mit Inventar sowie Performance-, Snapshot-, Health- und Compliance-Details.",
  },
  "/wartungsankuendigung": {
    term: "Wartung",
    description:
      "Cluster-Zuweisungen, Verantwortliche und Wartungsfenster pflegen sowie daraus Wartungsankündigungen ableiten.",
  },
  "/wartungsfenster": {
    term: "Wartungsfenster",
    description:
      "Lokaler Katalog wiederkehrender Wartungszeiten. Ordnet Werte aus Tech-Info bekannten Zeitplänen zu und macht unbekannte Angaben sichtbar.",
    source: "Tech-Info · „Wartungsfenster“",
  },
  "/planning": {
    term: "Planung",
    description:
      "Kapazitäts- und What-if-Planung auf Cluster-Ebene: Szenarien durchspielen, bevor Workloads verschoben oder Hosts ergänzt werden.",
  },
  "/exports": {
    term: "Export & Berichte",
    description:
      "Stellt lokale XLSX-, CSV- und Markdown-Exporte aus dem aktuell gefilterten Datenbestand zusammen. Spalten, Reihenfolge, Vorlagen und optionale Pseudonymisierung werden nur im Browser verwaltet.",
  },
};

/* ------------------------------------------------------------------ */
/*  Overview – KPIs                                                    */
/* ------------------------------------------------------------------ */
export const OVERVIEW_KPI: Record<string, GlossaryEntry> = {
  vmsTotal: {
    term: "VMs Total",
    description:
      "Gesamtzahl der virtuellen Maschinen in den aktiven Snapshots. Folgt dem globalen Filter.",
    source: `${RV} · vInfo`,
  },
  poweredOn: {
    term: "Powered On",
    description:
      "Eingeschaltete VMs. Nur diese verbrauchen laufend CPU-/RAM-Ressourcen und sind für die Kapazitätsbetrachtung maßgeblich.",
    source: `${RV} · vInfo · „Powerstate"`,
  },
  poweredOff: {
    term: "Powered Off",
    description:
      "Ausgeschaltete VMs. Belegen weiterhin Storage und sind typische Kandidaten für Aufräumen oder Stilllegung.",
    source: `${RV} · vInfo · „Powerstate"`,
  },
  hosts: {
    term: "Hosts",
    description:
      "Anzahl physischer ESXi-Hosts in den aktiven Snapshots. Nicht vom globalen VM-Filter betroffen.",
    source: `${RV} · vHost`,
  },
  datastores: {
    term: "Datastores",
    description:
      "Anzahl der Datastores. Als „kritisch“ markiert werden Datastores mit weniger als 10 % freiem Speicher.",
    source: `${RV} · vDatastore · „Free %"`,
  },
  healthEvents: {
    term: "Health Events",
    description:
      "Von vCenter gemeldete Health- und Konfigurationswarnungen. Ein Wert > 0 verdient einen Blick in die Detailbereiche.",
    source: `${RV} · vHealth`,
  },
  vcpuTotal: {
    term: "vCPU gesamt",
    description: "Summe der konfigurierten vCPU über alle VMs im aktiven Filter.",
    source: `${RV} · vInfo · „CPUs“`,
  },
  ramTotal: {
    term: "RAM gesamt",
    description: "Summe des konfigurierten Arbeitsspeichers über alle VMs im aktiven Filter.",
    source: `${RV} · vInfo · „Memory“`,
  },
  clusterCount: {
    term: "Cluster",
    description: "Anzahl unterschiedlicher Cluster, denen die gefilterten VMs zugeordnet sind.",
    source: `${RV} · vInfo · „Cluster“`,
  },
};

/* ------------------------------------------------------------------ */
/*  Overview – Tabelle „Virtuelle Maschinen"                          */
/* ------------------------------------------------------------------ */
export const OVERVIEW_VM_COLUMNS: Record<string, GlossaryEntry> = {
  vmName: {
    term: "VM",
    description: "Anzeigename der VM in vCenter.",
    source: `${RV} · vInfo · „VM"`,
  },
  sysv: {
    term: "SysV",
    description:
      "Systemverantwortliche:r aus der ergänzenden Tech-Info/CMDB – kein RVTools-Feld, sondern über den VM-Namen verknüpft.",
    source: "Tech-Info",
  },
  sysvDepartment: {
    term: "Abteilung",
    description:
      "Abteilung der/des Systemverantwortlichen als Pfad „Organisation/Bereich-Abteilung“. Die Textsuche der Filterleiste greift auf dieses Feld zu: eine Suche nach der Abteilung filtert den gesamten Bestand auf deren VMs.",
    source: "Tech-Info",
  },
  powerState: {
    term: "Power",
    description: "Energiezustand der VM: eingeschaltet, ausgeschaltet oder pausiert.",
    source: `${RV} · vInfo · „Powerstate"`,
  },
  cluster: {
    term: "Cluster",
    description: "HA/DRS-Cluster, dem die VM aktuell zugeordnet ist.",
    source: `${RV} · vInfo · „Cluster"`,
  },
  host: {
    term: "Host",
    description: "ESXi-Host, auf dem die VM zum Zeitpunkt des Exports lief.",
    source: `${RV} · vInfo · „Host"`,
  },
  cpuCount: {
    term: "vCPU",
    description: "Anzahl der zugewiesenen virtuellen CPUs (nicht der genutzten).",
    source: `${RV} · vInfo · „CPUs"`,
  },
  memoryMiB: {
    term: "RAM",
    description: "Konfigurierter Arbeitsspeicher der VM (zugewiesen, nicht belegt).",
    source: `${RV} · vInfo · „Memory"`,
  },
  configStatus: {
    term: "Config",
    description:
      "vCenter-Konfigurationsstatus: green = ok, yellow = Warnung, red = Fehler in der VM-Konfiguration.",
    source: `${RV} · vInfo · „Config status"`,
  },
  osConfig: {
    term: "OS",
    description:
      "Gast-Betriebssystem laut Konfigurationsdatei (.vmx). Kann von der real installierten (Tools-)Version abweichen.",
    source: `${RV} · vInfo · „OS according to the configuration file"`,
  },
};

/* ------------------------------------------------------------------ */
/*  Overview – Tabelle „Betriebssysteme je Cluster"                   */
/* ------------------------------------------------------------------ */
export const OVERVIEW_OS_COLUMNS: Record<string, GlossaryEntry> = {
  cluster: {
    term: "Cluster",
    description: "HA/DRS-Cluster, für den die OS-Verteilung aufgeschlüsselt wird.",
    source: `${RV} · vInfo · „Cluster"`,
  },
  operatingSystem: {
    term: "Betriebssystem",
    description:
      "Gast-OS – wahlweise laut VMware Tools oder laut Konfigurationsdatei (Umschalter oben rechts).",
    source: `${RV} · vInfo`,
  },
  vmCount: {
    term: "VMs",
    description: "Anzahl der VMs mit diesem Betriebssystem im jeweiligen Cluster.",
  },
  clusterSharePct: {
    term: "Anteil im Cluster",
    description: "Prozentualer Anteil dieses Betriebssystems an allen VMs des Clusters.",
  },
};

/* ------------------------------------------------------------------ */
/*  Overview – Abschnitts-Überschriften (Sinn + Arbeitsweise)         */
/* ------------------------------------------------------------------ */
export const OVERVIEW_SECTIONS: Record<string, GlossaryEntry> = {
  averageVm: {
    term: "Durchschnittliche VM",
    description:
      "Synthetische „typische“ VM für den aktuellen Filter, in zwei Teilen: „Zugeteilt“ mittelt aus RVTools, was die VMs konfiguriert haben (vCPU, RAM, RAM-Belegung, Disks, provisionierte Kapazität, Partitionen, NICs). „Beansprucht“ zeigt aus der vROps-Zeitreihe, was sie davon tatsächlich nutzen – dieser Teil entfällt ohne Import. Alle Prozentangaben dort beziehen sich auf dieselbe Größe: die Ø konfigurierte CPU-Kapazität je VM (vCPU × MHz je Kern des Hosts), ohne bekannte Hostfrequenz entfallen sie. Ändert sich vCenter-Auswahl, Suche oder Filter, wird beides sofort auf diese Auswahl neu berechnet.",
    source: `${RV} · vInfo/vCPU/vMemory/vDisk/vPartition/vNetwork · vROps-Zeitreihe`,
  },
  averageVmDistribution: {
    term: "Verteilung über die VMs",
    description:
      "Streuung des Werts über alle VMs im Filter: die Box umschließt die mittlere Hälfte (25.–75. Perzentil), der starke Strich ist der Median, die Raute der P95, die Linie reicht von Minimum bis Maximum. Liegt der Median deutlich unter dem Mittelwert, ziehen wenige große VMs den Durchschnitt nach oben – dann ist der Median die belastbarere Größe. VMs ohne Angabe bleiben in der Streuung außen vor.",
    source: `${RV} · vInfo`,
  },
  averageVmDemandDistribution: {
    term: "Ø CPU Demand je VM",
    description:
      "Jede VM liefert ihren über den Importzeitraum gemittelten CPU Demand; die Streuung zeigt, wie unterschiedlich stark die VMs des Filters tatsächlich arbeiten. Demand ist der Bedarf inklusive verweigerter Anteile, nicht die zugeteilte Nutzung. Die zweite Zeile („davon …“) setzt dieselben Kennzahlen in Bezug zur Ø konfigurierten CPU-Kapazität je VM – eine Einordnung der Größenordnung, keine VM-genaue Auslastung, weil die Kapazität je VM unterschiedlich ist.",
    source: "vROps-Zeitreihe · VM|CPU|Demand (MHz)|Avg",
  },
  averageVmReadyDistribution: {
    term: "CPU Ready P95 je VM",
    description:
      "Anteil der Zeit, in der eine VM lauffähig war, aber auf einen physischen Kern warten musste – je VM als P95 der Stundenwerte. Ab etwa 5 % gilt der Wert als spürbare Contention; überschreitet der P95 der Verteilung diese Grenze, wird der Streifen als Warnung eingefärbt.",
    source: "vROps-Zeitreihe · VM|CPU|Ready (%)|Max",
  },
  averageVmWeekProfile: {
    term: "Wochenverlauf",
    description:
      "Stündlicher Ø CPU Demand aller gefilterten VMs über den Importzeitraum, in der Zeitzone des Imports. Über den Umschalter MHz/% wahlweise absolut oder als Anteil der Ø konfigurierten CPU-Kapazität je VM – dieselbe Bezugsgröße wie bei den Kennzahlen darüber. Wochenenden sind hinterlegt, Datenlücken bleiben als Unterbrechung sichtbar. Die gestrichelte Linie markiert die laufende Stunde: der Wert dort ist die Last, die zu genau diesem Wochentag und dieser Uhrzeit üblich war. Deckt der Import mehrere Wochen ab, markiert sie die jüngste passende Stunde.",
    source: "vROps-Zeitreihe · VM|CPU|Demand (MHz)|Avg",
  },
  averageVmWeekGrid: {
    term: "Wochenraster",
    description:
      "Dasselbe Signal auf Wochentag × Stunde gefaltet, damit wiederkehrende Lastfenster – Geschäftszeiten, Nacht-Batches, Wochenendläufe – als Muster sichtbar werden. Die Farbskala trennt am Median aller Stundenwerte: überdurchschnittliche Stunden erscheinen in der Primärfarbe (Sättigung bis zum P95), Stunden unter dem Median in neutralem Grau. Der Median als Nullpunkt ist nötig, weil der über tausende VMs gemittelte Demand nie in die Nähe der Null fällt – eine Skala von 0 bis Maximum würde alle Zellen gleich dunkel färben und das Muster verdecken. Die laufende Stunde ist umrandet, Stunden ohne Messwert bleiben leer.",
    source: "vROps-Zeitreihe · VM|CPU|Demand (MHz)|Avg",
  },
  hostsPerCluster: {
    term: "Host-Verteilung je Cluster",
    description:
      "Zeigt, wie viele Cluster jeweils dieselbe Anzahl physischer ESXi-Hosts haben. So werden typische Clustergrößen und Ausreißer sichtbar, ohne einzelne Clusternamen aufzulisten.",
  },
  osPerCluster: {
    term: "Betriebssysteme je Cluster",
    description:
      "Gruppierte VM-Anzahl nach Cluster und Gast-OS. Nutze den Umschalter, um zwischen der von den VMware Tools gemeldeten und der in der Konfiguration hinterlegten OS-Angabe zu wechseln – Abweichungen deuten auf veraltete Tools hin.",
  },
  vmTable: {
    term: "Virtuelle Maschinen",
    description:
      "Vollständige VM-Liste der aktiven Snapshots. Spalten sind sortierbar, die Ansicht ist exportierbar. Klicke eine Zeile an, um Detail-, Technik- und – falls vorhanden – Client-Informationen zu öffnen.",
  },
};
