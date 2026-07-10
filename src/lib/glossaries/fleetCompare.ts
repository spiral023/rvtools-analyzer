import type { GlossaryEntry } from "@/lib/glossary";

/**
 * Glossar für die Seite „Fleet Compare“.
 *
 * Zielgruppe: VMware-Administrator:innen. Fleet Compare stellt die vCenter mit
 * ihrem jeweils aktuellen Stand gegenüber, um Größe, Auslastung und Risiko der
 * Umgebungen zu vergleichen.
 */

const RV = "RVTools";

/* ------------------------------------------------------------------ */
/*  Fleet Compare – KPIs                                              */
/* ------------------------------------------------------------------ */
export const FLEET_KPI: Record<string, GlossaryEntry> = {
  vcenter: {
    term: "vCenter",
    description:
      "Anzahl der verglichenen vCenter. Verglichen wird je vCenter der aktuelle Stand – für einen fairen Blick auf getrennte Umgebungen.",
    source: "berechnet",
  },
  vmsTotal: {
    term: "VMs Gesamt",
    description:
      "Summe aller virtuellen Maschinen über alle verglichenen vCenter hinweg. Grobmaß für die Gesamtgröße der Flotte.",
    source: `${RV} · vInfo`,
  },
  hostsTotal: {
    term: "Hosts Gesamt",
    description:
      "Summe aller physischen ESXi-Hosts über alle vCenter. Zusammen mit „VMs Gesamt“ ein schneller Konsolidierungs-Indikator.",
    source: `${RV} · vHost`,
  },
  healthIssues: {
    term: "Health Issues",
    description:
      "Von vCenter gemeldete Health- und Konfigurationswarnungen, summiert über alle vCenter. Ein Wert > 0 verdient einen Blick in die betroffene Umgebung.",
    source: `${RV} · vHealth`,
  },
  securityDrift: {
    term: "Security Drift",
    description:
      "Anzahl der Portgruppen mit unsicheren vSwitch-Einstellungen („Allow Promiscuous“ oder „Mac Changes“ aktiv), summiert über alle vCenter. Weist auf abweichende Netzwerk-Härtung hin.",
    source: `${RV} · dvPort · „Allow Promiscuous“ / „Mac Changes“`,
  },
  riskTotal: {
    term: "Risiko Total",
    description:
      "Summe der Risiko-Scores aller vCenter. Der Score gewichtet Health-Events, kritische Datastores, offene VM-Snapshots, Security-Drift und CPU-Overcommit – je höher, desto dringender der Handlungsbedarf.",
    source: "berechnet",
  },
};

/* ------------------------------------------------------------------ */
/*  Fleet Compare – Tabelle „Fleet Übersicht“                        */
/* ------------------------------------------------------------------ */
export const FLEET_COLUMNS: Record<string, GlossaryEntry> = {
  displayName: {
    term: "vCenter",
    description: "Anzeigename des vCenter, dessen aktueller Stand in dieser Zeile ausgewertet wird.",
    source: "berechnet",
  },
  vmCount: {
    term: "VMs",
    description: "Anzahl aller virtuellen Maschinen in diesem vCenter.",
    source: `${RV} · vInfo`,
  },
  poweredOn: {
    term: "Powered On",
    description:
      "Eingeschaltete VMs dieses vCenter. Nur diese verbrauchen laufend CPU-/RAM-Ressourcen und gehen in Overcommit-Berechnungen ein.",
    source: `${RV} · vInfo · „Powerstate“`,
  },
  hostCount: {
    term: "Hosts",
    description: "Anzahl physischer ESXi-Hosts in diesem vCenter.",
    source: `${RV} · vHost`,
  },
  clusterCount: {
    term: "Cluster",
    description: "Anzahl der HA/DRS-Cluster in diesem vCenter.",
    source: `${RV} · vCluster`,
  },
  totalRamGiB: {
    term: "RAM",
    description: "Physischer Gesamt-Arbeitsspeicher aller Cluster dieses vCenter in GiB.",
    source: `${RV} · vCluster · „Total memory“`,
  },
  avgDsFree: {
    term: "Ø DS Frei",
    description:
      "Durchschnittlicher freier Speicher über alle Datastores dieses vCenter. Ampel: rot < 15 %, gelb < 25 %, sonst grün.",
    source: `${RV} · vDatastore · „Free %“`,
  },
  cpuOvercommit: {
    term: "CPU OC",
    description:
      "CPU-Overcommit: zugewiesene vCPUs eingeschalteter VMs geteilt durch physische CPU-Threads. Ab etwa 3:1 (gelb) bzw. 5:1 (rot) steigt das Contention-Risiko.",
    source: "berechnet",
  },
  snapshotCount: {
    term: "Snapshots",
    description:
      "Anzahl offener VM-Snapshots in diesem vCenter. Alte Snapshots belegen Storage und können Performance und Backups beeinträchtigen.",
    source: `${RV} · vSnapshot`,
  },
  securityDrift: {
    term: "Sec. Drift",
    description:
      "Portgruppen mit unsicheren vSwitch-Einstellungen („Allow Promiscuous“ oder „Mac Changes“ aktiv) in diesem vCenter.",
    source: `${RV} · dvPort · „Allow Promiscuous“ / „Mac Changes“`,
  },
  healthIssues: {
    term: "Health",
    description: "Von vCenter gemeldete Health-/Konfigurationswarnungen in diesem vCenter.",
    source: `${RV} · vHealth`,
  },
  riskScore: {
    term: "Risiko Score",
    description:
      "Gewichteter Risiko-Score dieses vCenter (max. 100) aus Health-Events, kritischen Datastores, offenen Snapshots, Security-Drift und CPU-Overcommit. Ampel: rot > 50, gelb > 25.",
    source: "berechnet",
  },
};

/* ------------------------------------------------------------------ */
/*  Fleet Compare – Abschnitts-Überschriften                         */
/* ------------------------------------------------------------------ */
export const FLEET_SECTIONS: Record<string, GlossaryEntry> = {
  compareChart: {
    term: "vCenter Vergleich",
    description:
      "Stellt VMs, Hosts und Datastores der verglichenen vCenter nebeneinander. Nutze das Diagramm, um auf einen Blick die Größenverhältnisse einzuordnen und Ausreißer zu erkennen, bevor du in die Detailtabelle darunter gehst.",
  },
  fleetTable: {
    term: "Fleet Übersicht",
    description:
      "Kennzahlen aller vCenter in einer sortierbaren Tabelle. Sortiere nach „Risiko Score“ oder einer einzelnen Metrik, um die kritischste Umgebung zu finden, und arbeite die auffälligen Werte (rote/gelbe Ampeln) gezielt ab.",
  },
  singleTable: {
    term: "Aktueller vCenter",
    description:
      "Kennzahlen des einzigen vorhandenen vCenter. Ein echter Fleet-Vergleich wird erst möglich, sobald Exporte von mindestens zwei verschiedenen vCentern hochgeladen sind.",
  },
};
