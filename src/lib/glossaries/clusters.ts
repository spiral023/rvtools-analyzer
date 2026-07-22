import type { GlossaryEntry } from "@/lib/glossary";

const RV = "RVTools";

/** Glossar für den Cluster-Arbeitsbereich. */
export const CLUSTER_KPI: Record<string, GlossaryEntry> = {
  clusters: { term: "Cluster", description: "Anzahl der Cluster im aktiven vCenter-, Cluster- und Such-Scope.", source: `${RV} · vCluster` },
  hosts: { term: "Hosts", description: "Physische ESXi-Hosts der angezeigten Cluster.", source: `${RV} · vHost` },
  runningVms: { term: "Laufende VMs", description: "Eingeschaltete VMs der angezeigten Cluster. Sie prägen die aktuelle Ressourcenlast.", source: `${RV} · vInfo · „Powerstate“` },
  highRiskClusters: { term: "Cluster mit hohem Risiko", description: "Cluster mit hoher abgeleiteter Risikostufe. Diese sollten zuerst auf Auslastung, Overcommit und HA-/DRS-Reserve geprüft werden.", source: "berechnet · vHost + vCluster" },
  maxVmsPerHost: { term: "Max. VMs/Host", description: "Höchste in vHost gemeldete VM-Anzahl auf einem einzelnen Host. Hilft ungleich verteilte Last zu erkennen.", source: `${RV} · vHost · „# VMs“` },
  haDrsIssues: { term: "HA-/DRS-Auffälligkeiten", description: "Cluster mit deaktiviertem oder fehlendem HA bzw. DRS. Beide Einstellungen sind für Verfügbarkeit und automatischen Lastausgleich relevant.", source: `${RV} · vCluster · „HA enabled“ / „DRS enabled“` },
};

export const CLUSTER_OVERVIEW_COLUMNS: Record<string, GlossaryEntry> = {
  vcenterDisplayName: { term: "vCenter", description: "vCenter, aus dessen Snapshot der Cluster stammt. Gemeinsam mit Datacenter und Clustername ist dies die eindeutige Clusteridentität." },
  datacenter: { term: "Datacenter", description: "vSphere-Datacenter des Clusters.", source: `${RV} · vCluster · „Datacenter“` },
  cluster: { term: "Cluster", description: "Name des HA-/DRS-Clusters.", source: `${RV} · vCluster · „Name“` },
  hosts: { term: "Hosts", description: "Anzahl der physischen ESXi-Hosts im Cluster.", source: `${RV} · vCluster · „# Hosts“` },
  runningVms: { term: "Laufende VMs", description: "Anzahl eingeschalteter VMs im Cluster.", source: `${RV} · vInfo · „Powerstate“` },
  avgVmsPerHost: { term: "Ø VMs/Host", description: "Durchschnittlich laufende VMs je Host; ein Maß für den Konsolidierungsgrad.", source: "berechnet" },
  maxVmsPerHost: { term: "Max. VMs/Host", description: "Höchster vHost-Wert inklusive betroffenem Host; macht Lastspitzen sichtbar.", source: `${RV} · vHost · „# VMs“` },
  vcpuPerCore: { term: "vCPU/Core", description: "Zugewiesene vCPUs je physischem CPU-Core. Höhere Werte erhöhen das Risiko von CPU-Contention.", source: "berechnet · Σ vCPU / Σ Cores" },
  ramCommitPct: { term: "RAM Commit", description: "Zugesagter VM-RAM im Verhältnis zum physischen Cluster-RAM.", source: "berechnet" },
  risk: { term: "Risiko", description: "Abgeleitete Stufe aus Dichte, Overcommit, Auslastung und Verfügbarkeitskonfiguration.", source: "berechnet" },
  riskScore: { term: "Score", description: "Numerische Grundlage der Risikostufe. Höhere Werte weisen auf mehr kombinierte Kapazitäts- oder Konfigurationsrisiken hin.", source: "berechnet" },
  haDrs: { term: "HA / DRS", description: "Status von High Availability und Distributed Resource Scheduler im Cluster.", source: `${RV} · vCluster · „HA enabled“ / „DRS enabled“` },
};

export const CLUSTER_OS_COLUMNS: Record<string, GlossaryEntry> = {
  operatingSystem: { term: "Betriebssystem", description: "Gastbetriebssystem laut VMware Tools.", source: `${RV} · vInfo · „OS according to the VMware Tools“` },
  vmCount: { term: "VMs", description: "Anzahl der VMs mit diesem Betriebssystem im eindeutig abgegrenzten Cluster." },
  clusterSharePct: { term: "Anteil im Cluster", description: "Prozentualer Anteil des Betriebssystems an den VMs des jeweiligen Clusters." },
};

export const CLUSTER_CHARTS: Record<string, GlossaryEntry> = {
  density: { term: "Cluster-Dichtekarte", description: "Jeder Punkt ist ein Cluster: X = Ø VMs pro Host, Y = vCPU/Core, Punktgröße = laufende VMs. Die Farbe zeigt die Risikostufe." },
  risk: { term: "Risikoscore je Cluster", description: "Vergleicht die abgeleiteten Risikoscores der Cluster. Hohe Werte zuerst untersuchen." },
  vmDistribution: { term: "Ø und Maximum VMs je Host", description: "Vergleicht durchschnittliche und maximale Hostdichte je Cluster, um Lastungleichgewichte aufzuspüren." },
};

export const CLUSTER_TABS: Record<string, GlossaryEntry> = {
  overview: { term: "Übersicht", description: "Kernkennzahlen, Dichte, Risiko sowie Cluster- und Betriebssystemübersicht im aktuellen Scope." },
  capacity: { term: "Kapazität", description: "Clusterbezogene Capacity Health, Overcommit und Hostdichte für die aktive Auswahl." },
  maintenance: { term: "Wartung", description: "Cluster-Zuweisungen, Wartungsfenster und die Vorbereitung von Wartungsankündigungen." },
  planning: { term: "Planung", description: "Szenarien und What-if-Betrachtungen vor geplanten VM-Verschiebungen." },
  infrastructure: { term: "Infrastruktur", description: "CPU-, ESXi- sowie HBA-/NIC-Treiberinventar der ausgewählten Cluster." },
};
