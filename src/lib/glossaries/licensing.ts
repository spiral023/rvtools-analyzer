import type { GlossaryEntry } from "@/lib/glossary";

/**
 * Glossar für die Seite „Licensing & Effizienz“. Zielgruppe: VMware-Administrator:innen.
 */

const RV = "RVTools";

/* ------------------------------------------------------------------ */
/*  KPIs                                                              */
/* ------------------------------------------------------------------ */
export const LICENSING_KPI: Record<string, GlossaryEntry> = {
  totalLicenses: {
    term: "Lizenzen",
    description:
      "Anzahl der von vCenter erfassten Lizenzeinträge (vSphere, vCenter, ergänzende Produkte). Basis der Auslastungs- und Ablaufbetrachtung.",
    source: `${RV} · vLicense`,
  },
  highUtil: {
    term: "Hoch (>85%)",
    description:
      "Lizenzen mit über 85 % Auslastung. Wenig Puffer bis zur Grenze – bei Wachstum oder neuen Hosts frühzeitig nachbestellen.",
    source: `${RV} · vLicense · „Used“ / „Total“`,
  },
  critUtil: {
    term: "Kritisch (>95%)",
    description:
      "Lizenzen über 95 % Auslastung. Akut knapp – ein weiterer Host oder eine CPU kann bereits eine Lizenzverletzung auslösen.",
    source: `${RV} · vLicense · „Used“ / „Total“`,
  },
  expiring: {
    term: "Mit Ablaufdatum",
    description:
      "Lizenzen mit gesetztem Ablaufdatum (nicht „Never“). Typisch für Evaluierungs- oder Term-Lizenzen – rechtzeitig verlängern, bevor Funktionen ausfallen.",
    source: `${RV} · vLicense · „Expiration Date“`,
  },
  idleVms: {
    term: "Idle VMs",
    description:
      "Ausgeschaltete VMs als Stilllegungskandidaten. Der Untertitel summiert die gebundenen vCPU und den RAM – Rückgewinnungspotenzial für Konsolidierung und Lizenzentlastung.",
    source: `${RV} · vInfo · „Powerstate“`,
  },
  clusters: {
    term: "Clusters",
    description: "Anzahl der Cluster in der Dichte-/Effizienzbetrachtung.",
    source: `${RV} · vCluster`,
  },
  datastores: {
    term: "Datastores",
    description: "Anzahl der Datastores in der Effizienzbetrachtung.",
    source: `${RV} · vDatastore`,
  },
};

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
/*  Tabelle „Idle / Stilllegungskandidaten“                           */
/* ------------------------------------------------------------------ */
export const IDLE_COLUMNS: Record<string, GlossaryEntry> = {
  vm: {
    term: "VM",
    description: "Anzeigename der ausgeschalteten VM.",
    source: `${RV} · vInfo · „VM“`,
  },
  powerState: {
    term: "Power",
    description: "Energiezustand – hier ausschließlich „poweredOff“, der Grund für die Einstufung als Kandidat.",
    source: `${RV} · vInfo · „Powerstate“`,
  },
  cpuCount: {
    term: "vCPU",
    description: "Zugewiesene virtuelle CPUs, die bei Stilllegung frei würden.",
    source: `${RV} · vInfo · „CPUs“`,
  },
  memoryMiB: {
    term: "RAM",
    description: "Konfigurierter Arbeitsspeicher, der bei Stilllegung frei würde.",
    source: `${RV} · vInfo · „Memory“`,
  },
  cluster: {
    term: "Cluster",
    description: "Cluster, in dem die VM registriert ist.",
    source: `${RV} · vInfo · „Cluster“`,
  },
  reason: {
    term: "Grund",
    description: "Warum die VM als Kandidat gilt (z.B. „Powered Off“). Vor dem Löschen fachliche Notwendigkeit prüfen.",
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
      "vCPU-Overcommit: zugewiesene vCPUs eingeschalteter VMs je physischem CPU-Thread. Höhere Werte sparen Lizenzen/Hardware, erhöhen aber das Risiko von CPU-Ready-Zeiten.",
  },
  ramUtilPct: {
    term: "RAM Util %",
    description:
      "Anteil des zugewiesenen VM-RAM an der physischen Cluster-Kapazität. Ab ~85 % (gelb) schrumpft der Puffer für Spitzen und Host-Ausfälle.",
  },
};

/* ------------------------------------------------------------------ */
/*  Tabelle „Datastore Effizienz“                                     */
/* ------------------------------------------------------------------ */
export const DS_EFFICIENCY_COLUMNS: Record<string, GlossaryEntry> = {
  datastore: {
    term: "Datastore",
    description: "Name des Datastores.",
    source: `${RV} · vDatastore · „Name“`,
  },
  provisionedMiB: {
    term: "Provisioned",
    description: "Kapazität des Datastores. Bezugsgröße für die Effizienzberechnung.",
    source: `${RV} · vDatastore · „Capacity“`,
  },
  inUseMiB: {
    term: "In Use",
    description: "Tatsächlich belegter Speicher auf dem Datastore.",
    source: `${RV} · vDatastore · „In Use“`,
  },
  freeMiB: {
    term: "Frei",
    description: "Freier Speicher auf dem Datastore. Zu wenig freier Platz gefährdet Snapshots und Thin-Provisioning-Wachstum.",
    source: `${RV} · vDatastore · „Free“`,
  },
  efficiency: {
    term: "Effizienz %",
    description:
      "Belegter Anteil an der Kapazität (In Use / Provisioned). Niedrige Werte deuten auf überdimensionierte oder untergenutzte Datastores.",
  },
};

/* ------------------------------------------------------------------ */
/*  Abschnitts-Überschriften (Sinn + Arbeitsweise)                    */
/* ------------------------------------------------------------------ */
export const LICENSING_SECTIONS: Record<string, GlossaryEntry> = {
  utilizationChart: {
    term: "Lizenzauslastung",
    description:
      "Auslastung je Lizenz als Balken (grün/gelb/rot nach Schwellwerten). Nutze die Ansicht, um Engpässe vor einer Cluster-Erweiterung zu erkennen – rote Balken zuerst adressieren, da hier bereits ein zusätzlicher Host eine Verletzung auslösen kann.",
  },
  licenseTable: {
    term: "Lizenz Details",
    description:
      "Vollständige Lizenzliste mit Einheit, Belegung, Ablauf und Features. Prüfe Einheit und Auslastung gemeinsam, um kern- vs. sockelbasierte Lizenzierung korrekt zu bewerten, und behalte Ablaufdaten für die Verlängerungsplanung im Blick.",
  },
  idleTable: {
    term: "Idle / Stilllegungskandidaten",
    description:
      "Ausgeschaltete VMs, die weiterhin Storage und ggf. Lizenzbezug binden. Arbeite die Liste als Aufräumaktion ab: fachliche Notwendigkeit klären, dann archivieren oder löschen, um vCPU, RAM und Speicher zurückzugewinnen. Ein Klick öffnet die VM-Details.",
  },
  clusterDensity: {
    term: "Cluster Dichte & Effizienz",
    description:
      "Konsolidierungsgrad je Cluster: VMs pro Host, vCPU-Overcommit und RAM-Auslastung. Nutze die Kennzahlen, um über- und unterausgelastete Cluster zu erkennen und Workloads oder Lizenzen gezielt auszubalancieren – hohe Overcommit-Werte gegen CPU-Ready-/RAM-Reserven abwägen.",
  },
  dsEfficiency: {
    term: "Datastore Effizienz",
    description:
      "Belegung im Verhältnis zur Kapazität je Datastore. Niedrige Effizienz weist auf überdimensionierten oder schlecht genutzten Speicher hin; die Übersicht hilft, Datastores zu konsolidieren und teuren Storage effizienter zu nutzen.",
  },
};
