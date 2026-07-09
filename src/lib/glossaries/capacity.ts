import type { GlossaryEntry } from "@/lib/glossary";

/**
 * Glossar für die Capacity-Seite (Kapazität, Auslastung, Overcommit).
 * Zielgruppe: VMware-Administrator:innen.
 */

const RV = "RVTools";

/* ------------------------------------------------------------------ */
/*  Capacity – KPIs (Storage-Übersicht)                                */
/* ------------------------------------------------------------------ */
export const CAPACITY_KPI: Record<string, GlossaryEntry> = {
  datastores: {
    term: "Datastores",
    description: "Anzahl der Datastores im aktiven Datenbestand.",
    source: `${RV} · vDatastore`,
  },
  avgFreePct: {
    term: "Ø Frei %",
    description:
      "Durchschnittlich freier Speicher über alle Datastores. Unter 25 % (gelb) bzw. 15 % (rot) sinkt der Puffer für Wachstum, Snapshots und Swap.",
    source: `${RV} · vDatastore · „Free %“`,
  },
  critDs: {
    term: "Kritisch (<10%)",
    description:
      "Datastores mit weniger als 10 % freiem Speicher. Akutes Risiko: bei vollem Datastore stoppen betroffene VMs. Kurzfristig entlasten oder erweitern.",
    source: `${RV} · vDatastore · „Free %“`,
  },
  warnDs: {
    term: "Warnung (<20%)",
    description:
      "Datastores mit 10–20 % freiem Speicher. Noch unkritisch, aber beobachten und in die Kapazitätsplanung aufnehmen.",
    source: `${RV} · vDatastore · „Free %“`,
  },
  maxCpuOC: {
    term: "Max CPU Overcommit",
    description:
      "Höchstes vCPU-zu-Core-Verhältnis über alle Cluster. Werte über 3:1 (gelb) bzw. 5:1 (rot) erhöhen das Risiko von CPU-Contention (CPU Ready).",
    source: "berechnet · Σ vCPU / Σ Cores",
  },
  maxRamOC: {
    term: "Max RAM Overcommit",
    description:
      "Höchstes Verhältnis von zugewiesenem VM-RAM zu physischem Host-RAM. Über 1,0 (gelb) bzw. 1,5 (rot) droht Ballooning/Swapping, wenn Gäste ihren RAM tatsächlich nutzen.",
    source: "berechnet · Σ VM-RAM / Σ Host-RAM",
  },
  rpRisks: {
    term: "RP Risiken",
    description:
      "Resource Pools mit auffälliger Konfiguration – etwa gesetzte Limits ohne erweiterbare Reservierung. Können VMs unbemerkt ausbremsen.",
    source: `${RV} · vRP`,
  },
  storageEfficiency: {
    term: "Speicherwirkungsgrad",
    description:
      "Verhältnis von tatsächlich belegtem zu provisioniertem Speicher (in-use / provisioned). Ein niedriger Wert zeigt viel Thin-Provisioning-Überhang – bequem, aber ein Overcommit-Risiko am Storage.",
    source: "berechnet · Σ In Use / Σ Provisioned",
  },
};

/* ------------------------------------------------------------------ */
/*  Capacity – KPIs (Cluster-Risiken)                                  */
/* ------------------------------------------------------------------ */
export const CAPACITY_RISK_KPI: Record<string, GlossaryEntry> = {
  criticalCapacity: {
    term: "Capacity Risiken hoch",
    description:
      "Cluster mit Risiko-Einstufung „hoch“ aus dem Capacity-Score (u.a. CPU-/RAM-Auslastung, Overcommit, Swap/Balloon, HA-Reserve). Vorrangig prüfen.",
    source: "berechnet · vHost + vCluster",
  },
  mediumCapacity: {
    term: "Capacity Risiken mittel",
    description:
      "Cluster mit Risiko-Einstufung „mittel“. Beobachten und in die mittelfristige Planung aufnehmen.",
    source: "berechnet · vHost + vCluster",
  },
  hotHosts: {
    term: "Hot Hosts",
    description:
      "Summe der Hosts über alle Cluster, deren CPU- oder RAM-Auslastung im kritischen Bereich liegt. Kandidaten für Lastausgleich (DRS) oder Entlastung.",
    source: "berechnet · vHost",
  },
  maxSwapBalloon: {
    term: "Max Swap+Balloon",
    description:
      "Höchster Anteil geswappten und geballonten RAMs über alle Cluster. Über 2 % (gelb) bzw. 5 % (rot) ist ein deutliches Zeichen für RAM-Knappheit auf den Hosts.",
    source: "berechnet · vHost",
  },
  avgVcpuPerCore: {
    term: "Ø vCPU/Core",
    description:
      "Durchschnittliche vCPU-Dichte je physischem Core über alle Cluster. Über 4:1 (gelb) bzw. 6:1 (rot) steigt die Gefahr von CPU-Contention.",
    source: "berechnet · Σ vCPU / Σ Cores",
  },
};

/* ------------------------------------------------------------------ */
/*  Capacity – Datastore-Tabelle                                       */
/* ------------------------------------------------------------------ */
export const CAPACITY_DS_COLUMNS: Record<string, GlossaryEntry> = {
  name: {
    term: "Datastore",
    description: "Name des Datastores.",
    source: `${RV} · vDatastore · „Name“`,
  },
  type: {
    term: "Typ",
    description: "Datastore-Typ, z.B. VMFS, NFS oder vSAN.",
    source: `${RV} · vDatastore · „Type“`,
  },
  capacityMiB: {
    term: "Kapazität",
    description: "Bruttokapazität des Datastores.",
    source: `${RV} · vDatastore · „Capacity MiB“`,
  },
  inUseMiB: {
    term: "Belegt",
    description: "Aktuell belegter Speicher auf dem Datastore.",
    source: `${RV} · vDatastore · „In Use MiB“`,
  },
  freeMiB: {
    term: "Frei",
    description: "Absolut freier Speicher auf dem Datastore.",
    source: `${RV} · vDatastore · „Free MiB“`,
  },
  freePct: {
    term: "Frei %",
    description:
      "Freier Speicher in Prozent. Unter 20 % (gelb) bzw. 10 % (rot) wird der Datastore kritisch – Wachstum, Snapshots und Swap brauchen Puffer.",
    source: `${RV} · vDatastore · „Free %“`,
  },
  clusterName: {
    term: "Cluster",
    description: "Cluster, dem der Datastore zugeordnet ist (sofern eindeutig).",
    source: `${RV} · vDatastore`,
  },
};

/* ------------------------------------------------------------------ */
/*  Capacity – Cluster-Overcommit-Tabelle                              */
/* ------------------------------------------------------------------ */
export const CAPACITY_CLUSTER_COLUMNS: Record<string, GlossaryEntry> = {
  name: {
    term: "Cluster",
    description: "Name des HA/DRS-Clusters.",
    source: `${RV} · vCluster · „Name“`,
  },
  cpuRatio: {
    term: "vCPU/Core",
    description:
      "vCPU-zu-physischem-Core-Verhältnis (nur eingeschaltete VMs). Über 3:1 (gelb) bzw. 5:1 (rot) steigt das Risiko von CPU-Contention.",
    source: "berechnet · Σ vCPU / Σ Host-Cores",
  },
  ramRatio: {
    term: "RAM Overcommit",
    description:
      "Zugewiesener VM-RAM im Verhältnis zum physischen Cluster-RAM. Über 1,0 (gelb) bzw. 1,5 (rot) droht Ballooning/Swapping bei realer RAM-Nutzung.",
    source: "berechnet · Σ VM-RAM / Cluster-RAM",
  },
  vCpuSum: {
    term: "vCPUs",
    description: "Summe der zugewiesenen vCPUs aller eingeschalteten VMs im Cluster.",
    source: `${RV} · vInfo · „CPUs“`,
  },
  cores: {
    term: "Cores",
    description: "Summe der physischen CPU-Cores aller Hosts im Cluster.",
    source: `${RV} · vHost · „# Cores“`,
  },
  ramAllocGiB: {
    term: "RAM Alloc",
    description: "Summe des den VMs zugewiesenen Arbeitsspeichers im Cluster.",
    source: `${RV} · vInfo · „Memory“`,
  },
  ramTotalGiB: {
    term: "RAM Total",
    description: "Physisch verfügbarer Arbeitsspeicher des Clusters (Summe der Hosts).",
    source: `${RV} · vCluster · „Total memory“`,
  },
};

/* ------------------------------------------------------------------ */
/*  Capacity – Resource-Pool-Tabelle                                   */
/* ------------------------------------------------------------------ */
export const CAPACITY_RP_COLUMNS: Record<string, GlossaryEntry> = {
  name: {
    term: "Resource Pool",
    description: "Name des Resource Pools.",
    source: `${RV} · vRP · „Resource Pool name“`,
  },
  path: {
    term: "Pfad",
    description: "Hierarchischer Pfad des Resource Pools innerhalb des Clusters.",
    source: `${RV} · vRP · „Resource Pool path“`,
  },
  status: {
    term: "Status",
    description: "vCenter-Status des Resource Pools: green, yellow oder red.",
    source: `${RV} · vRP · „Status“`,
  },
  vms: {
    term: "VMs",
    description: "Anzahl der VMs im Resource Pool.",
    source: `${RV} · vRP · „# VMs“`,
  },
  cpuLimit: {
    term: "CPU Limit",
    description:
      "Oberes CPU-Limit des Pools in MHz. „Unlimited“ bedeutet kein Limit. Ein hartes Limit kann VMs künstlich ausbremsen.",
    source: `${RV} · vRP · „CPU limit“`,
  },
  cpuReservation: {
    term: "CPU Res. MHz",
    description: "Fest reservierte CPU-Leistung des Pools in MHz.",
    source: `${RV} · vRP · „CPU reservation“`,
  },
  cpuExpandable: {
    term: "CPU Expand.",
    description:
      "Ob die CPU-Reservierung erweiterbar ist (expandable reservation). „Nein“ in Kombination mit einem Limit kann Ressourcenengpässe verursachen.",
    source: `${RV} · vRP · „CPU expandableReservation“`,
  },
  memLimit: {
    term: "Mem Limit",
    description:
      "Oberes RAM-Limit des Pools in MiB. „Unlimited“ bedeutet kein Limit. Ein hartes Limit erzwingt Ballooning/Swapping in den VMs.",
    source: `${RV} · vRP · „Mem limit“`,
  },
  memReservation: {
    term: "Mem Res. MiB",
    description: "Fest reservierter Arbeitsspeicher des Pools in MiB.",
    source: `${RV} · vRP · „Mem reservation“`,
  },
  memExpandable: {
    term: "Mem Expand.",
    description:
      "Ob die RAM-Reservierung erweiterbar ist. „Nein“ in Kombination mit einem Limit kann VMs den benötigten RAM entziehen.",
    source: `${RV} · vRP · „Mem expandableReservation“`,
  },
  risk: {
    term: "Risiko",
    description:
      "Abgeleitete Einstufung: „hoch“ bei hartem Limit ohne erweiterbare Reservierung, „mittel“ bei einem der beiden Faktoren.",
    source: "berechnet",
  },
};

/* ------------------------------------------------------------------ */
/*  Capacity – Thin-Provisioning-Tabelle                               */
/* ------------------------------------------------------------------ */
export const CAPACITY_THIN_COLUMNS: Record<string, GlossaryEntry> = {
  datastore: {
    term: "Datastore",
    description:
      "Bezugsgröße für die Thin-Bewertung. Da vDisk keinen Datastore-Namen trägt, werden Thin-Disks global gezählt und gegen den knappsten Datastore bewertet.",
  },
  freePct: {
    term: "Frei % (knappster DS)",
    description:
      "Freier Speicher des knappsten Datastores. Er bestimmt, wie viel Puffer für das Vollschreiben der Thin-Disks bleibt.",
    source: `${RV} · vDatastore · „Free %“`,
  },
  thinDisks: {
    term: "Thin Disks",
    description: "Anzahl der Thin-provisionierten virtuellen Disks im Bestand.",
    source: `${RV} · vDisk · „Thin“`,
  },
  totalThinMiB: {
    term: "Thin Kapaz.",
    description:
      "Summe der provisionierten Kapazität aller Thin-Disks. Das ist der maximal mögliche Storage-Bedarf, wenn alle Thin-Disks vollgeschrieben werden.",
    source: `${RV} · vDisk · „Capacity MiB“`,
  },
  risk: {
    term: "Risiko",
    description:
      "Abgeleitete Einstufung aus Thin-Menge und freiem Speicher des knappsten Datastores. „hoch“, wenn wenig Platz und viele Thin-Disks zusammenkommen.",
    source: "berechnet",
  },
};

/* ------------------------------------------------------------------ */
/*  Capacity – Cluster-Capacity-Health-Tabelle                         */
/* ------------------------------------------------------------------ */
export const CAPACITY_HEALTH_COLUMNS: Record<string, GlossaryEntry> = {
  cluster: {
    term: "Cluster",
    description: "Name des Clusters (aus den Host-Zuordnungen abgeleitet).",
    source: `${RV} · vHost · „Cluster“`,
  },
  datacenter: {
    term: "Datacenter",
    description: "Datacenter, dem der Cluster zugeordnet ist.",
    source: `${RV} · vHost · „Datacenter“`,
  },
  risk: {
    term: "Risiko",
    description:
      "Gesamteinstufung (hoch/mittel/niedrig) mit Score in Klammern. Fasst CPU-/RAM-Auslastung, Overcommit, Swap/Balloon und HA-Reserve zu einer Ampel zusammen.",
    source: "berechnet · vHost + vCluster",
  },
  hosts: {
    term: "Hosts",
    description: "Anzahl der ESXi-Hosts im Cluster.",
    source: `${RV} · vHost`,
  },
  totalCores: {
    term: "Cores",
    description: "Summe der physischen CPU-Cores aller Hosts im Cluster.",
    source: `${RV} · vHost · „# Cores“`,
  },
  totalVms: {
    term: "VMs",
    description: "Anzahl der VMs im Cluster.",
    source: `${RV} · vHost`,
  },
  cpuUsagePct: {
    term: "CPU %",
    description:
      "Durchschnittliche CPU-Auslastung der Hosts. Über 75 % (gelb) bzw. 85 % (rot) sinkt die Reserve für Lastspitzen und Host-Ausfälle.",
    source: `${RV} · vHost · „CPU usage %“`,
  },
  memoryUsagePct: {
    term: "RAM %",
    description:
      "Durchschnittliche RAM-Auslastung der Hosts. Über 80 % (gelb) bzw. 90 % (rot) wird der Puffer für HA-Failover und Lastspitzen knapp.",
    source: `${RV} · vHost · „Memory usage %“`,
  },
  vcpuPerCore: {
    term: "vCPU/Core",
    description:
      "vCPU-Dichte je physischem Core. Über 4:1 (gelb) bzw. 6:1 (rot) steigt das Risiko von CPU-Contention (CPU Ready).",
    source: "berechnet · Σ vCPU / Σ Cores",
  },
  ramCommitPct: {
    term: "RAM Commit %",
    description:
      "Zugesagter RAM im Verhältnis zum physischen RAM. Über 140 % (gelb) bzw. 180 % (rot) ist der Cluster stark überbucht.",
    source: "berechnet · vHost",
  },
  ramActivePct: {
    term: "RAM Active %",
    description:
      "Anteil des tatsächlich aktiv genutzten RAMs. Über 80 % (gelb) bzw. 90 % (rot) ist der physische RAM real ausgelastet – anders als reines Commit ein hartes Signal.",
    source: "berechnet · vHost",
  },
  swapBalloonPct: {
    term: "Swap+Balloon %",
    description:
      "Anteil geswappten und geballonten RAMs. Über 2 % (gelb) bzw. 5 % (rot) leidet die Performance unter RAM-Knappheit.",
    source: "berechnet · vHost",
  },
  hotHosts: {
    term: "Hot Hosts",
    description:
      "Anzahl kritisch ausgelasteter Hosts im Verhältnis zur Gesamtzahl (z.B. 2/8). Ein hoher Anteil deutet auf schlechten Lastausgleich oder generelle Überlast hin.",
    source: "berechnet · vHost",
  },
  drsEnabled: {
    term: "DRS",
    description:
      "Ob Distributed Resource Scheduler aktiv ist. Ohne DRS erfolgt kein automatischer Lastausgleich zwischen den Hosts.",
    source: `${RV} · vCluster · „DRS enabled“`,
  },
  haEnabled: {
    term: "HA",
    description:
      "Ob vSphere High Availability aktiv ist. Ohne HA werden VMs eines ausgefallenen Hosts nicht automatisch neu gestartet.",
    source: `${RV} · vCluster · „HA enabled“`,
  },
  clusterHostDelta: {
    term: "Δ Hosts",
    description:
      "Abweichung zwischen den in vHost gezählten und den in vCluster gemeldeten Hosts. Ein Wert ungleich 0 deutet auf Inkonsistenzen oder Hosts im Wartungsmodus hin.",
    source: "berechnet · vHost vs. vCluster",
  },
  clusterMemoryDeltaPct: {
    term: "Δ RAM %",
    description:
      "Prozentuale Abweichung zwischen aggregiertem Host-RAM und dem in vCluster gemeldeten RAM. Große Abweichungen (>5 %) deuten auf Inkonsistenzen im Export hin.",
    source: "berechnet · vHost vs. vCluster",
  },
};

/* ------------------------------------------------------------------ */
/*  Capacity – Abschnitts-Überschriften                                */
/* ------------------------------------------------------------------ */
export const CAPACITY_SECTIONS: Record<string, GlossaryEntry> = {
  dsHeadroom: {
    term: "Datastore Headroom (Frei %)",
    description:
      "Die 15 knappsten Datastores nach freiem Speicher. Rote Balken (<10 %) sind akut, gelbe (<20 %) beobachten. Nutze die Ansicht, um Aufräum- oder Erweiterungsbedarf zu priorisieren, bevor ein Datastore vollläuft.",
  },
  hostDensity: {
    term: "Host Dichte (VMs vs. vCPU/Core)",
    description:
      "Jeder Punkt ist ein Host: X = VMs, Y = vCPU/Core, Punktgröße = RAM. Rote/gelbe Punkte oberhalb der Referenzlinie sind dicht gepackt. So erkennst du überladene Hosts und ungenutzte Reserven für den Lastausgleich.",
  },
  clusterRisk: {
    term: "Cluster Capacity Risk Score",
    description:
      "Aggregierter Risiko-Score je Cluster aus vHost- und vCluster-Daten. Rote Balken (≥60) zuerst prüfen, gelbe (≥30) beobachten. Der Score bündelt Auslastung, Overcommit und Reserve zu einer Rangliste.",
  },
  clusterCapacityHealth: {
    term: "Cluster Capacity Health",
    description:
      "Kennzahlen je Cluster als Tabelle: Auslastung, Overcommit, Swap/Balloon, DRS/HA und Score. Klick auf eine Zeile öffnet die Cluster-Detailansicht. Startpunkt, um von der Ampel zur konkreten Ursache zu kommen.",
  },
  clusterOvercommit: {
    term: "Cluster Overcommit",
    description:
      "Zeigt je Cluster das vCPU/Core- und das RAM-Overcommit-Verhältnis mit den zugrunde liegenden Summen. Hilft zu entscheiden, wo noch Workloads Platz haben und wo Konsolidierung riskant wäre. Klick öffnet die Detailansicht.",
  },
  datastoreDetails: {
    term: "Datastore Details",
    description:
      "Vollständige Datastore-Liste mit Kapazität, Belegung und Frei %, aufsteigend nach Frei % sortiert. Grundlage für Storage-Balancing und Erweiterungsentscheidungen.",
  },
  resourcePool: {
    term: "Resource Pool Pressure",
    description:
      "Resource Pools mit Limits und Reservierungen samt Risikoeinstufung. Harte Limits ohne erweiterbare Reservierung bremsen VMs unbemerkt aus – hier findest du solche Fehlkonfigurationen.",
  },
  thinRisk: {
    term: "Thin-Provisioning Risiko",
    description:
      "Menge und Kapazität der Thin-Disks gegen den freien Speicher des knappsten Datastores. Zeigt das Overcommit-Risiko am Storage: Werden viele Thin-Disks vollgeschrieben, kann der Datastore volllaufen.",
  },
};
