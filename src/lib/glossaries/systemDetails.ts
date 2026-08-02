import type { GlossaryEntry } from "@/lib/glossary";

const RV = "RVTools";
const VROPS = "vROps-Zeitreihenimport";

/** Glossar für die interaktiven Systemakten von Cluster und ESXi-Host. */
export const SYSTEM_DETAIL_SECTIONS: Record<string, GlossaryEntry> = {
  utilizationTrend: {
    term: "Auslastungsverlauf",
    description:
      "Der Verlauf zeigt die historische CPU- und Speicherauslastung aus dem vROps-Import. Die CPU-Linie ist der Demand-Mittelwert; das Band macht die innerhalb der Aggregation erfasste Spannweite bis zum Peak sichtbar. Prozentwerte beziehen sich auf die konfigurierte Kapazität des jeweiligen Objekts. Ein einzelner Peak ist noch kein Engpass – wiederkehrende Spitzen zusammen mit CPU Ready oder RAM-Druck sind aussagekräftiger.",
    source: `${VROPS} · CPU Demand · Memory Utilization`,
  },
  clusterCapacity: {
    term: "Cluster-Kapazität",
    description:
      "Stellt physische Kapazität, konfigurierte VM-Ressourcen und die Auslastung nebeneinander. vCPU/Core und RAM Commit beschreiben Overcommit, nicht automatisch eine aktuelle Performance-Störung; dafür zusätzlich CPU-/RAM-Auslastung, Ready sowie Swap/Balloon prüfen.",
    source: `${RV} · vCluster · vHost · vInfo`,
  },
  hostCapacity: {
    term: "Host-Kapazität",
    description:
      "Zeigt, welche physische CPU- und RAM-Kapazität der ESXi-Host bereitstellt und wie viel davon durch laufende VMs konfiguriert ist. Ein hoher vCPU/Core- oder RAM-Commit-Wert ist ein Planungs- und Reservehinweis; er beweist allein noch keine Contention.",
    source: `${RV} · vHost · vInfo`,
  },
  clusterHosts: {
    term: "ESXi-Hosts im Cluster",
    description:
      "Die Liste zeigt die Cluster-Nodes mit Hardware, Kapazität und Verbindungszustand. Vergleiche ungleich verteilte VM-Anzahlen und unterschiedliche CPU-Generationen, bevor du DRS- oder vMotion-Maßnahmen planst.",
    source: `${RV} · vHost`,
  },
  clusterDatastores: {
    term: "Datastores im Cluster",
    description:
      "Gemeinsam erreichbare Datastores des Clusters, nach freiem Speicher sortiert. Wenig freier Speicher begrenzt Wachstum, Snapshots und Swap; er sagt allein nichts über Storage-Latenz aus.",
    source: `${RV} · vDatastore`,
  },
  clusterVms: {
    term: "Laufende VMs im Cluster",
    description:
      "Eingeschaltete Workloads im Cluster mit ihrer konfigurierten Ressourcenbelegung. Die Summe ist die Grundlage für vCPU/Core und RAM Commit; sie ist nicht mit dem tatsächlich genutzten Demand gleichzusetzen.",
    source: `${RV} · vInfo`,
  },
  hostHbas: {
    term: "Host Bus Adapter",
    description:
      "Physische Storage-Pfade des Hosts inklusive Status, Treiber, Modell und WWN. Auffällige oder uneinheitliche Pfade zuerst gegen VMware HCL, Firmware und Fabric-Zuordnung prüfen.",
    source: `${RV} · vHBA`,
  },
  hostNics: {
    term: "Netzwerkadapter",
    description:
      "Physische Uplinks des Hosts mit Speed, Switch-/Port-Zuordnung und Treiber. Abweichungen von der Cluster-Mehrheit sind oft wichtiger als die reine Anzahl der NICs.",
    source: `${RV} · vNIC`,
  },
  hostVms: {
    term: "Laufende VMs auf dem Host",
    description:
      "Eingeschaltete VMs, die beim Export auf diesem ESXi-Host liefen. Die Tabelle hilft, Hostdichte und die betroffenen Workloads für einen Lastausgleich einzugrenzen.",
    source: `${RV} · vInfo · „Host“`,
  },
};

export const CLUSTER_DETAIL_FIELDS: Record<string, GlossaryEntry> = {
  hosts: {
    term: "Hosts",
    description: "Anzahl der physischen ESXi-Hosts im Cluster. Die Zahl beschreibt Inventar, nicht automatisch die für HA verbleibende Reserve.",
    source: `${RV} · vCluster/vHost`,
  },
  effectiveHosts: {
    term: "Effektive Hosts",
    description: "Von vCenter als für die Kapazitätsbetrachtung wirksam gemeldete Hosts. Ein niedrigerer Wert als die Hostzahl reduziert die verfügbare HA-/Capacity-Reserve.",
    source: `${RV} · vCluster · „Effective hosts“`,
  },
  runningVms: {
    term: "Laufende VMs",
    description: "Eingeschaltete VMs im Cluster. Aus ihrer konfigurierten vCPU- und RAM-Summe werden die Overcommit-Kennzahlen dieses Dialogs berechnet.",
    source: `${RV} · vInfo · „Powerstate“`,
  },
  cpuUsage: {
    term: "CPU-Auslastung",
    description: "Durchschnitt der CPU-Usage-Werte der Cluster-Hosts aus der RVTools-Momentaufnahme. Ein Snapshot ist eine Momentaufnahme; für wiederkehrende Lastspitzen den vROps-Verlauf verwenden.",
    source: `${RV} · vHost · „CPU usage %“`,
  },
  memoryUsage: {
    term: "RAM-Auslastung",
    description: "Durchschnitt der RAM-Usage-Werte der Cluster-Hosts aus der RVTools-Momentaufnahme. Hohe Werte zusammen mit Swap/Balloon sprechen für echten Speicherdruck; Commit allein tut das nicht.",
    source: `${RV} · vHost · „Memory usage %“`,
  },
  vcpuPerCore: {
    term: "vCPU / Core",
    description: "Konfigurierte vCPU der laufenden VMs geteilt durch physische CPU-Cores. Werte über 1 sind normales Overcommit; höhere Werte erhöhen das Risiko von CPU Ready, beweisen aber noch keine Wartezeit.",
    source: "berechnet · Σ VM-vCPU / Σ Host-Cores",
  },
  datastoreFree: {
    term: "Datastore frei",
    description: "Durchschnittlich freier Speicher der im Cluster gefundenen Datastores. Unter 20 % beobachten, unter 10 % zeitnah entlasten oder erweitern – abhängig von Wachstum, Snapshots und Swap-Bedarf.",
    source: `${RV} · vDatastore · „Free %“`,
  },
  ha: {
    term: "HA",
    description: "vSphere High Availability startet VMs eines ausgefallenen Hosts auf anderen Cluster-Nodes neu. „Aus“ bedeutet, dass dieser automatische Wiederanlauf nicht zur Verfügung steht.",
    source: `${RV} · vCluster · „HA enabled“`,
  },
  drs: {
    term: "DRS",
    description: "Distributed Resource Scheduler verteilt Workloads innerhalb des Clusters nach Kapazität und Regeln. „Aus“ bedeutet, dass dieser automatische Lastausgleich fehlt.",
    source: `${RV} · vCluster · „DRS enabled“`,
  },
  cpuCores: {
    term: "CPU-Kerne",
    description: "Summe der physischen CPU-Cores aller Hosts. Diese Größe ist die Basis für CPU-Kapazität und vCPU/Core; Hyper-Threading-Threads werden nicht als zusätzliche physische Cores gezählt.",
    source: `${RV} · vHost · „# Cores“`,
  },
  cpuThreads: {
    term: "CPU-Threads",
    description: "Logische CPU-Threads der Hosts. Sie erhöhen die Scheduling-Möglichkeiten, ersetzen aber keine physischen Cores und sind nicht die Bezugsgröße von vCPU/Core in dieser Ansicht.",
    source: `${RV} · vHost · „# Threads“`,
  },
  cpuCapacity: {
    term: "CPU-Kapazität",
    description: "Nominelle CPU-Kapazität des Clusters in MHz. Sie dient als Größenordnung für die verfügbare Rechenleistung; tatsächliches Verhalten hängt zusätzlich von Auslastung, CPU-Generation und Scheduling ab.",
    source: `${RV} · vCluster · CPU-Kapazität`,
  },
  physicalMemory: {
    term: "Physischer RAM",
    description: "Summe des verbauten Host-RAMs im Cluster. Davon müssen ESXi-Overhead, Failover-Reserve und die reale Gastnutzung berücksichtigt werden.",
    source: `${RV} · vHost · „Memory“`,
  },
  configuredVmRam: {
    term: "Konfigurierter VM-RAM",
    description: "Summe der den laufenden VMs zugewiesenen RAM-Größen. Das ist eine Zusage bzw. Konfiguration, nicht der aktuell aktive Verbrauch im Gast.",
    source: `${RV} · vInfo · „Memory“`,
  },
  ramCommit: {
    term: "RAM Commit",
    description: "Konfigurierter VM-RAM im Verhältnis zum physischen Cluster-RAM. Über 100 % liegt RAM-Overcommit vor; Performance-Druck zeigt sich erst, wenn die VMs den RAM tatsächlich benötigen und ESXi reclaimen muss.",
    source: "berechnet · Σ VM-RAM / Σ Host-RAM",
  },
};

export const HOST_DETAIL_KPIS: Record<string, GlossaryEntry> = {
  powerState: {
    term: "Betriebszustand",
    description: "Power- und Verbindungszustand des ESXi-Hosts aus vCenter. Ein verbundener Host ist administrativ erreichbar; das sagt noch nichts über aktuelle CPU- oder RAM-Last.",
    source: `${RV} · vHost · Power/Connection State`,
  },
  cpuCores: CLUSTER_DETAIL_FIELDS.cpuCores,
  memory: {
    term: "Arbeitsspeicher",
    description: "Physisch im ESXi-Host verbauter RAM. Der darunter angezeigte VM-RAM ist die konfigurierte Belegung durch laufende VMs, nicht der aktive Verbrauch.",
    source: `${RV} · vHost · „Memory“`,
  },
  runningVms: {
    term: "Laufende VMs",
    description: "Eingeschaltete VMs, die beim Export auf diesem Host liefen. Zusammen mit ihrer vCPU-/RAM-Summe zeigt die Kachel die statische Hostdichte.",
    source: `${RV} · vInfo · „Host“ / „Powerstate“`,
  },
  vcpuPerCore: CLUSTER_DETAIL_FIELDS.vcpuPerCore,
  ramCommit: {
    term: "RAM Commit",
    description: "Konfigurierter VM-RAM auf diesem Host geteilt durch den physischen Host-RAM. Über 100 % ist Overcommit; für echten Druck zusätzlich aktive Nutzung, Ballooning und Swapping prüfen.",
    source: "berechnet · Σ VM-RAM / Host-RAM",
  },
};

export const HOST_DETAIL_FIELDS: Record<string, GlossaryEntry> = {
  cpuModel: {
    term: "CPU-Modell",
    description: "Prozessormodell des ESXi-Hosts. Unterschiedliche Generationen im selben Cluster können EVC und die nutzbaren CPU-Features beeinflussen.",
    source: `${RV} · vHost · „CPU Model“`,
  },
  sockets: {
    term: "Sockel",
    description: "Anzahl der physischen CPU-Sockel im Host. Zusammen mit Kernen je Sockel beschreibt das die Hardwaretopologie, nicht die VM-Zuteilung.",
    source: `${RV} · vHost · „# CPUs“`,
  },
  coresPerSocket: {
    term: "Kerne je Sockel",
    description: "Physische CPU-Cores je Sockel. Die Topologie kann für NUMA-sensitive Workloads und die Platzierung großer VMs relevant sein.",
    source: `${RV} · vHost · „# Cores per CPU“`,
  },
  totalCores: CLUSTER_DETAIL_FIELDS.cpuCores,
  threads: CLUSTER_DETAIL_FIELDS.cpuThreads,
  clock: {
    term: "Takt",
    description: "Nominaler CPU-Takt je Core in MHz. Er ist eine Kapazitätsnäherung; Turbo, CPU-Generation und die tatsächliche Auslastung werden dadurch nicht vollständig beschrieben.",
    source: `${RV} · vHost · „CPU speed“`,
  },
  cpuCapacity: CLUSTER_DETAIL_FIELDS.cpuCapacity,
  hyperThreading: {
    term: "Hyper-Threading",
    description: "Zeigt, ob logische Threads zusätzlich zu den physischen Cores aktiv genutzt werden. Hyper-Threading erweitert Scheduling-Kapazität, verdoppelt aber nicht die physische CPU-Leistung.",
    source: `${RV} · vHost · „HT Active“`,
  },
  ram: HOST_DETAIL_KPIS.memory,
  nics: {
    term: "NICs",
    description: "Anzahl der im Host-Inventar erfassten physischen Netzwerkadapter. Für Redundanz und Bandbreite sind zusätzlich Speed, Uplinks und Switch-Zuordnung entscheidend.",
    source: `${RV} · vNIC`,
  },
  hbas: {
    term: "HBAs",
    description: "Anzahl der im Host-Inventar erfassten physischen Storage-Adapter. Prüfe für die Pfadresilienz zusätzlich Status, WWN, Treiber und Fabric-Anbindung.",
    source: `${RV} · vHBA`,
  },
  hbaIssues: {
    term: "HBA-Auffälligkeiten",
    description: "Anzahl der HBA-Einträge mit einem Status außerhalb von Online, OK oder Active. Das ist ein Inventarhinweis und sollte gegen vCenter, ESXi und die Storage-Fabric verifiziert werden.",
    source: `${RV} · vHBA · „Status“`,
  },
  maintenance: {
    term: "Maintenance Mode",
    description: "Im Maintenance Mode sollen keine laufenden VMs auf dem Host verbleiben. Vor Wartungsarbeiten vMotion, DRS-Regeln, lokale Datastores und FT-/Sonderfälle prüfen.",
    source: `${RV} · vHost · „Maintenance Mode“`,
  },
};
