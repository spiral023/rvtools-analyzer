import type { ExportStudioSource } from "@/domain/models/types";
import type { ExportStudioColumn } from "@/lib/export/exportStudio";
import type { GlossaryEntry } from "@/lib/glossary";

const COMMON: Record<string, string> = {
  vcenter: "vCenter, aus dessen aktivem Snapshot der Datensatz stammt.",
  server: "Anzeigename der virtuellen Maschine.",
  cluster: "Cluster-Zuordnung des exportierten Objekts.",
  host: "ESXi-Host, dem das exportierte Objekt zugeordnet ist.",
  datacenter: "Datacenter-Zuordnung innerhalb des vCenter-Inventars.",
  powerState: "Energiezustand der VM zum Zeitpunkt des RVTools-Exports.",
  vcpus: "Anzahl der für die VM konfigurierten virtuellen CPUs.",
  memory: "Konfigurierter beziehungsweise verfügbarer Arbeitsspeicher in GiB.",
  os: "Von VMware Tools oder der VM-Konfiguration gemeldetes Gastbetriebssystem.",
  resourcePool: "Resource Pool, in dem die VM einsortiert ist.",
  tools: "Status der VMware Tools in der VM.",
  annotation: "Freie Notiz aus der VM-Konfiguration.",
  hwVersion: "Virtuelle Hardware-Version der VM.",
  toolsVersion: "Installierte Versionsnummer der VMware Tools.",
  secureBoot: "Zeigt, ob EFI Secure Boot für die VM aktiviert ist.",
  cpuModel: "Vom ESXi-Host gemeldetes CPU-Modell.",
  cores: "Anzahl der physischen CPU-Kerne.",
  cpu: "Gesamte nominelle CPU-Leistung in GHz.",
  mhzPerCore: "Nominelle CPU-Leistung je physischem Core.",
  vms: "Anzahl der zugeordneten virtuellen Maschinen.",
  vmsPerCore: "VM-Dichte als Anzahl VMs je physischem CPU-Core.",
  vcpuPerCore: "Verhältnis der eingeschalteten vCPU zu physischen CPU-Cores.",
  esxi: "Installierte ESXi-Version des Hosts.",
  vendor: "Hardware-Hersteller des Hosts.",
  model: "Hardware-Modell des Hosts.",
  maintenance: "Wartungsmodus des ESXi-Hosts zum Exportzeitpunkt.",
  hosts: "Anzahl beziehungsweise Namen der zugeordneten ESXi-Hosts.",
};

const VM: Record<string, string> = {
  techInfoSysv: "Primäre Systemverantwortung aus dem neuesten Tech-Info-Eintrag der VM.",
  techInfoSysvDepartment: "Abteilung der primären Systemverantwortung aus Tech-Info.",
  techInfoSysvDeputy: "Stellvertretende Systemverantwortung aus Tech-Info.",
  techInfoSysvDeputyDepartment: "Abteilung der stellvertretenden Systemverantwortung aus Tech-Info.",
  techInfoServerType: "In Tech-Info gepflegte fachliche Serverklassifikation.",
  techInfoMaintenanceWindow: "In Tech-Info hinterlegtes Wartungsfenster der VM.",
  techInfoOperatingSystem: "In Tech-Info gepflegte Betriebssystemangabe.",
  techInfoCluster: "In Tech-Info gepflegte Clusterangabe zum Abgleich mit RVTools.",
  techInfoBz: "In Tech-Info gepflegtes Betriebszentrum.",
  techInfoAz: "In Tech-Info gepflegtes Ausweichzentrum.",
  techInfoCvBackup: "Kennzeichnet, ob für die VM laut Tech-Info CV-Backup vorgesehen ist.",
  techInfoComment: "Freier Kommentar aus dem neuesten Tech-Info-Eintrag.",
  shape: "Aus sieben Tagen CPU-Demand abgeleitetes zeitliches Lastmuster.",
  intensity: "Aus historischen Demand-Werten abgeleitetes Auslastungsniveau.",
  behaviorClass: "Zusammengefasste Verhaltensklasse aus Lastmuster und Intensität.",
  profileConfidence: "Vertrauensniveau des ermittelten Workload-Profils.",
  profileCoverage: "Anteil der erwarteten Stundenwerte, für die CPU-Demand vorliegt.",
  coefficientOfVariation: "Relative Streuung der CPU-Demand-Werte um ihren Mittelwert.",
  activeHourSharePct: "Anteil der Stunden mit erkennbar aktiver CPU-Last.",
  utilizationP95Pct: "95. Perzentil der CPU-Demand relativ zur konfigurierten CPU-Kapazität.",
  dutyCyclePct: "Anteil der Stunden, in denen die VM oberhalb ihrer Grundlast arbeitet.",
  baselineRatio: "Verhältnis der typischen Grundlast zur beobachteten Spitzenlast.",
  dailyRepeatability: "Ähnlichkeit des Lastverlaufs zwischen aufeinanderfolgenden Tagen.",
  businessHoursConcentration: "Anteil der Last, der innerhalb der definierten Geschäftszeiten anfällt.",
  nightConcentration: "Anteil der Last, der in den Nachtstunden anfällt.",
  weekendConcentration: "Anteil der Last, der am Wochenende anfällt.",
  configuredCpuCapacity: "Aus vCPU-Anzahl und Hostleistung abgeleitete nominelle CPU-Kapazität der VM.",
  cpuDemandRaw: "Maschinenlesbare CPU-Demand-Stundenwerte der letzten sieben Tage als Zeitstempel-Wert-Paare.",
  rightsizingDemandP95: "95. Perzentil der gemessenen CPU-Demand in MHz.",
  rightsizingReadyP95: "95. Perzentil von CPU Ready; hohe Werte weisen auf CPU-Wartezeit hin.",
  usedVcpuEquivalentP95: "Aus P95-Demand abgeleitete tatsächlich genutzte vCPU-Entsprechung.",
  usedVcpuEquivalentPeak: "Aus der maximalen Demand abgeleitete vCPU-Entsprechung.",
  demandBasedVcpu: "Rechnerisch benötigte vCPU-Anzahl auf Basis der historischen CPU-Demand.",
  recommendedVcpu: "Konservative vCPU-Empfehlung nach Demand, Ready und Sicherheitsregeln.",
  reclaimableVcpu: "Differenz zwischen aktuell konfigurierten und empfohlenen vCPU.",
  recommendationWithheld: "Begründung, wenn Datenqualität oder Lastmuster keine belastbare Empfehlung erlauben.",
  rightsizingCandidate: "Kennzeichnet VMs mit einer fachlich relevanten Rightsizing-Empfehlung.",
  manyVcpuLowDemand: "Kennzeichnet viele konfigurierte vCPU bei dauerhaft geringem CPU-Bedarf.",
  highCpuReady: "Kennzeichnet auffällige CPU-Ready-Werte als mögliches Scheduling-Problem.",
};

const HOSTS: Record<string, string> = {
  vms: "Anzahl aller VMs, die dem Host im aktiven Snapshot zugeordnet sind.",
  vmsPerCore: "Anzahl zugeordneter VMs je physischem CPU-Core des Hosts.",
  vcpuPerCore: "Summe der vCPU eingeschalteter VMs je physischem CPU-Core.",
};

const CLUSTERS: Record<string, string> = {
  hosts: "Anzahl der ESXi-Hosts im Cluster.",
  vms: "Anzahl der VMs im Cluster.",
  vmsPerHost: "Durchschnittliche VM-Anzahl je Host im Cluster.",
  ha: "Zeigt, ob vSphere High Availability für den Cluster aktiviert ist.",
  drs: "Zeigt, ob Distributed Resource Scheduler für den Cluster aktiviert ist.",
  cpuUsagePct: "CPU-Auslastung des Clusters relativ zur verfügbaren CPU-Kapazität.",
  memoryUsagePct: "RAM-Auslastung des Clusters relativ zur verfügbaren Speicherkapazität.",
  ramCommitPct: "Konfigurierter VM-RAM relativ zur physischen Cluster-RAM-Kapazität.",
  ramActivePct: "Aktiv genutzter RAM relativ zur physischen Cluster-RAM-Kapazität.",
  swapBalloonPct: "Anteil von Swap und Ballooning an der RAM-Kapazität.",
  hotHosts: "Hosts, deren Last definierte Warnschwellen überschreitet.",
  maxHostFailures: "Anzahl Hosts, deren Ausfall der Cluster rechnerisch noch verkraftet.",
  siteFailoverRisk: "Bewertung, ob Workloads nach Ausfall eines Standorts weiter platziert werden können.",
  riskScore: "Verdichteter numerischer Risiko-Score aus Kapazitäts- und Ausfallsignalen.",
  risk: "Aus dem Risiko-Score abgeleitete verbale Risikoklasse.",
  vropsMissing: "Kennzeichnet Cluster ohne passende aktuelle vROps-Kennzahlen.",
};

const DATASTORES: Record<string, string> = {
  datastore: "Name des Datastores im vCenter-Inventar.",
  cluster: "Datastore-Cluster, dem der Datastore zugeordnet ist.",
  type: "Speichertyp, beispielsweise VMFS oder NFS.",
  capacity: "Gesamte nutzbare Kapazität des Datastores.",
  inUse: "Aktuell belegte Kapazität des Datastores.",
  free: "Noch freie Kapazität des Datastores.",
  usedPct: "Prozentual belegter Anteil der Datastore-Kapazität.",
  freePct: "Prozentual freier Anteil der Datastore-Kapazität.",
  status: "Kapazitätsampel: kritisch unter 10 %, Warnung unter 20 % freiem Speicher.",
  hostCount: "Anzahl der ESXi-Hosts mit Zugriff auf den Datastore.",
  hosts: "Alphabetisch sortierte ESXi-Hosts mit Zugriff auf den Datastore.",
  version: "Dateisystem- beziehungsweise Datastore-Version.",
  sioc: "Zeigt, ob Storage I/O Control für den Datastore aktiviert ist.",
};

const FILL_UP: Record<string, string> = {
  run: "Name des neuesten gespeicherten Fill-Up-Analyse-Runs.",
  profile: "Kapazitäts-Policy, mit der der Cluster berechnet wurde.",
  normal: "Ergebnisstatus im Normalbetrieb ohne Hostausfall.",
  n1: "Ergebnisstatus nach Ausfall des ungünstigsten einzelnen Hosts.",
  n2: "Ergebnisstatus nach Ausfall der ungünstigsten zwei Hosts.",
  site: "Ergebnisstatus des berechneten Standort-Failovers.",
  additional: "Maximal zusätzlich aufnehmbare VMs im gewählten HIGH/STD-Mix.",
  limiter: "Guardrail beziehungsweise Metrik, die weitere zusätzliche VMs zuerst begrenzt.",
};

const SOURCE_DESCRIPTIONS: Record<ExportStudioSource, Record<string, string>> = {
  vms: VM,
  hosts: HOSTS,
  clusters: CLUSTERS,
  datastores: DATASTORES,
  "fill-up": FILL_UP,
};

const SOURCE_LABELS: Record<ExportStudioSource, string> = {
  vms: "RVTools · vInfo / Tech-Info / vROps-Zeitreihe",
  hosts: "RVTools · vHost, ergänzt um VM-Zuordnungen aus vInfo",
  clusters: "RVTools · vCluster / vHost / vInfo, ergänzt um vROps",
  datastores: "RVTools · vDatastore",
  "fill-up": "Lokal gespeicherter Fill-Up-Analyse-Run",
};

export function getExportColumnInfo(source: ExportStudioSource, column: ExportStudioColumn): GlossaryEntry {
  return {
    term: column.label,
    description: SOURCE_DESCRIPTIONS[source][column.id]
      ?? COMMON[column.id]
      ?? `${column.label} aus dem für den Export aufbereiteten ${source}-Datensatz.`,
    source: SOURCE_LABELS[source],
  };
}
