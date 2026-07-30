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
  computeClusters: {
    term: "Compute-Cluster",
    description: "Alle Compute-Cluster, deren ESXi-Hosts diesen Datastore verbunden haben. Ein gemeinsam genutzter Datastore kann mehreren Clustern zugeordnet sein.",
    source: `${RV} · vDatastore „Hosts“ + vHost „Host“/„Cluster“`,
  },
  computeClusterCount: {
    term: "Anzahl Compute-Cluster",
    description: "Anzahl der unterschiedlichen Compute-Cluster, deren ESXi-Hosts diesen Datastore verbunden haben.",
    source: `${RV} · vDatastore „Hosts“ + vHost „Host“/„Cluster“`,
  },
  datastoreClusterName: {
    term: "Datastore Cluster",
    description: "Storage-DRS-/Datastore-Cluster, dem der Datastore in vCenter zugeordnet ist. Dies ist unabhängig von den Compute-Clustern der verbundenen ESXi-Hosts.",
    source: `${RV} · vDatastore · „Datastore cluster name“`,
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
      "vCPU-zu-physischem-Core-Verhältnis (nur eingeschaltete VMs). Ab 4:1 (gelb) bzw. 5:1 (rot) steigt das Risiko von CPU-Contention.",
    source: "berechnet · Σ vCPU / Σ Host-Cores",
  },
  ramRatio: {
    term: "RAM Overcommit",
    description:
      "Zugewiesener VM-RAM im Verhältnis zum physischen Cluster-RAM. Ab 0,6:1 (gelb) bzw. 0,7:1 (rot) droht Ballooning/Swapping bei realer RAM-Nutzung.",
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
  vropsCpuOvercommitRatio: {
    term: "CPU Overcommit (vROps Ist)",
    description:
      "Tatsächliches CPU-Überbuchungsverhältnis laut vROps zum Erfassungszeitpunkt – im Gegensatz zu „vCPU/Core“, das aus der statischen RVTools-Konfiguration berechnet wird. Ab 4:1 (gelb) bzw. 5:1 (rot). „—“ ohne vROps-Import.",
    source: "vROps-Dashboard-Export · Panel 7",
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
/*  Capacity – Thin-Disk-Detailtabelle (Thick-Migrationsplanung)       */
/* ------------------------------------------------------------------ */
export const CAPACITY_THIN_DISK_COLUMNS: Record<string, GlossaryEntry> = {
  vm: {
    term: "VM",
    description: "Name der virtuellen Maschine, der die Disk zugeordnet ist.",
    source: `${RV} · vDisk · „VM“`,
  },
  disk: {
    term: "Disk",
    description: "Bezeichnung der virtuellen Disk innerhalb der VM (z.B. „Hard disk 1“).",
    source: `${RV} · vDisk · „Disk“`,
  },
  capacityMiB: {
    term: "Größe",
    description: "Provisionierte Kapazität der Disk. Entspricht dem zusätzlichen Platzbedarf im schlimmsten Fall, wenn die Disk auf Thick umgestellt wird.",
    source: `${RV} · vDisk · „Capacity MiB“`,
  },
  diskPath: {
    term: "VMDK-Pfad",
    description: "Vollständiger Pfad zur VMDK-Datei auf dem Datastore ([Datastore] VM-Ordner/Datei.vmdk) – direkt für den Datastore-Browser bzw. Storage-vMotion/Inflate nutzbar.",
    source: `${RV} · vDisk · „Disk Path“`,
  },
  datastore: {
    term: "Datastore",
    description: "Aus dem VMDK-Pfad extrahierter Datastore-Name.",
    source: "berechnet · vDisk · „Disk Path“",
  },
  datastoreFreePct: {
    term: "Datastore Frei %",
    description:
      "Freier Speicher des Datastores, auf dem die Disk liegt. Vor einer Inflate-Migration (Thin→Thick auf demselben Datastore) muss mindestens die Differenz aus Größe und aktuell belegtem Speicher frei sein – bei knappem Datastore zuerst Storage vMotion auf einen anderen Datastore erwägen.",
    source: `${RV} · vDatastore · „Free %“`,
  },
  cluster: {
    term: "Cluster",
    description: "Cluster, dem der Datastore der Disk zugeordnet ist.",
    source: `${RV} · vDatastore`,
  },
  host: {
    term: "Host",
    description: "ESXi-Host, auf dem die VM aktuell läuft.",
    source: `${RV} · vInfo · „Host“`,
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
      "Gesamteinstufung (hoch/mittel/niedrig) mit Score in Klammern. Fasst CPU-/RAM-Auslastung, vCPU/Core-Overcommit, Swap/Balloon und HA-Reserve zu einer Ampel zusammen. Bei vorhandenem vROps-Import fließen zusätzlich HIGH-RP-RAM/-CPU-Nutzung und weitere Ausfallskonzept-Werte gewichtet ein; ein kritisches Site-Failover-Risiko erzwingt „hoch“. Das CPU-Overcommit (vROps Ist) bildet dieselbe Kennzahl wie vCPU/Core nur mit Live-Daten ab und fließt daher nicht zusätzlich in den Score ein — es bleibt als Vergleichswert in der Overcommit-Tabelle sichtbar. „vROps fehlt“ markiert Cluster, für die die vROps-Faktoren nicht bewertet werden konnten.",
    source: "berechnet · vHost + vCluster + vROps-Dashboard-Export",
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
      "Durchschnittliche CPU-Auslastung der Hosts. Ab 40 % (gelb) bzw. 50 % (rot) sinkt die Reserve für Lastspitzen und Host-Ausfälle.",
    source: `${RV} · vHost · „CPU usage %“`,
  },
  memoryUsagePct: {
    term: "RAM %",
    description:
      "Durchschnittliche RAM-Auslastung der Hosts. Ab 50 % (gelb) bzw. 70 % (rot) wird der Puffer für HA-Failover und Lastspitzen knapp.",
    source: `${RV} · vHost · „Memory usage %“`,
  },
  vcpuPerCore: {
    term: "vCPU/Core",
    description:
      "vCPU-Dichte je physischem Core. Ab 4:1 (gelb) bzw. 5:1 (rot) steigt das Risiko von CPU-Contention (CPU Ready).",
    source: "berechnet · Σ vCPU / Σ Cores",
  },
  ramCommitPct: {
    term: "RAM Commit %",
    description:
      "Zugesagter RAM im Verhältnis zum physischen RAM. Ab 50 % (gelb) bzw. 70 % (rot) ist der Cluster überbucht.",
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
  maxHostFailures: {
    term: "Ausfallskapazität",
    description:
      "Anzahl ESXi-Hosts, die gleichzeitig ausfallen dürfen, bevor CPU %, RAM %, vCPU/Core, RAM Commit %, HIGH-RP CPU % oder HIGH-RP RAM genutzt % in dieser Tabelle auf Rot springen — die Ist-Last verteilt sich dabei per HA auf die verbleibenden Hosts. 0 bedeutet: schon ein einzelner Host-Ausfall reißt eine Kennzahl ins Rote. Die beiden HIGH-RP-Nutzungsmetriken fließen nur ein, wenn ein vROps-Import für den Cluster vorliegt; die HIGH-RP-RAM-Zuweisung wird ausschließlich für Site-Failover bewertet.",
    source: "berechnet · vHost + vROps-Dashboard-Export",
  },
  drsEnabled: {
    term: "DRS",
    description:
      "Ob Distributed Resource Scheduler aktiv ist. „Aus“ (rot) bedeutet: kein automatischer Lastausgleich zwischen den Hosts.",
    source: `${RV} · vCluster · „DRS enabled“`,
  },
  haEnabled: {
    term: "HA",
    description:
      "Ob vSphere High Availability aktiv ist. „Aus“ (rot) bedeutet: VMs eines ausgefallenen Hosts werden nicht automatisch neu gestartet.",
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
  vropsRamAssignedHighPct: {
    term: "HIGH-RP RAM zugewiesen % (Cluster)",
    description:
      "Dem HIGH-Resource-Pool (produktive/wichtige VMs) zugewiesenes RAM im Verhältnis zur gesamten Cluster-Kapazität. Da bei Standortausfall nur ~50 % der Hosts überleben, wird es ab 45 % (gelb) bzw. ab 50 % (rot) eng für den Weiterbetrieb der HIGH-RP-VMs.",
    source: "vROps-Dashboard-Export · Panel 2",
  },
  siteFailoverRisk: {
    term: "Site-Failover",
    description:
      "Tragfähigkeit im Worst-Case: fällt ein ganzer Standort (50 % der Hosts) aus, sollen HIGH-RP-VMs weiterlaufen, STD-VMs werden per Resource-Pool-Shares zurückgedrängt. Die Ampel zeigt, ob die HIGH-RP-RAM-Zuweisung in die halbierte Cluster-Kapazität passt; ihr Tooltip zeigt die daraus resultierende Belegung und den Puffer der Restkapazität. „—“ ohne vROps-Import.",
    source: "berechnet · vROps-Dashboard-Export",
  },
  vropsCpuUsageHighPct: {
    term: "HIGH-RP CPU %",
    description:
      "CPU-Nutzung der HIGH-RP-VMs relativ zur Gesamt-Cluster-CPU-Kapazität. Analog zu HIGH-RP RAM zugewiesen % (Cluster): da bei Standortausfall nur ~50 % der Hosts überleben, wird es ab 35 % (gelb) bzw. 45 % (rot) eng für den Weiterbetrieb der HIGH-RP-VMs. Fließt mit denselben Schwellwerten in die Ausfallskapazität-Simulation ein.",
    source: "vROps-Dashboard-Export · Panel 4",
  },
  vropsRamUsageHighPct: {
    term: "HIGH-RP RAM genutzt % (RP)",
    description:
      "RAM-Nutzung der HIGH-RP-VMs relativ zu ihrem eigenen Resource-Pool-Kontingent. Ab 45 % (gelb) bzw. 50 % (rot) ist der HIGH-Pool selbst unter Druck. Fließt mit denselben Schwellwerten in die Ausfallskapazität-Simulation ein.",
    source: "vROps-Dashboard-Export · Panel 1",
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
      "Vollständige Datastore-Liste mit Kapazität, Belegung, freiem Anteil, allen verbundenen Compute-Clustern und dem separaten Storage-DRS-/Datastore-Cluster. Compute-Cluster werden über die in vDatastore gelisteten Hosts gegen vHost aufgelöst.",
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
  thinDiskDetails: {
    term: "Thin Disks – Migrationsplanung",
    description:
      "Alle Thin-provisionierten Disks einzeln mit VM, VMDK-Pfad, Datastore, Cluster und Host – die Arbeitsgrundlage, um Disks gezielt auf Thick umzustellen (Inflate oder Storage vMotion mit Formatwechsel). Sortiert nach dem knappsten Ziel-Datastore zuerst, damit riskante Konvertierungen zuerst geplant werden.",
  },
};
