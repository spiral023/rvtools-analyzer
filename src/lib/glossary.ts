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
      "Synthetische „typische“ VM als Mittelwert aller VMs im aktuellen Filter: vCPU-Kerne, RAM-Größe sowie Speicherbelegung (belegt/aktiv), Disks, provisionierte Kapazität, Partitionen und NICs – jeweils je VM. Ändert sich vCenter-Auswahl, Suche oder Filter, wird der Durchschnitt sofort auf diese Auswahl neu berechnet.",
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
