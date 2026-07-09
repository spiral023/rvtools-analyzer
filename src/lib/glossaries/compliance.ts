import type { GlossaryEntry } from "@/lib/glossary";

/**
 * Glossar für die Seite „Compliance / Lifecycle“ (alle Tabs: Compliance,
 * Operations, Infrastructure, Versionen). Zielgruppe: VMware-Administrator:innen.
 */

const RV = "RVTools";

/* ------------------------------------------------------------------ */
/*  Compliance-Tab – KPIs                                             */
/* ------------------------------------------------------------------ */
export const COMPLIANCE_KPI: Record<string, GlossaryEntry> = {
  noSecureBoot: {
    term: "Kein Secure Boot",
    description:
      "VMs mit EFI-Firmware, bei denen Secure Boot deaktiviert ist. Ohne Secure Boot fehlt die Prüfung der Signatur von Bootloader und Kernel – relevant für gehärtete bzw. regulierte Workloads.",
    source: `${RV} · vInfo · „EFI Secure boot“`,
  },
  biosVms: {
    term: "BIOS (kein EFI)",
    description:
      "VMs, deren Firmware noch auf BIOS statt UEFI/EFI steht. BIOS ist Voraussetzungs-Blocker für Secure Boot und vTPM; ein Umstieg erfordert meist eine Neuinstallation oder Disk-Konvertierung.",
    source: `${RV} · vInfo · „Firmware“`,
  },
  noCbt: {
    term: "Kein CBT",
    description:
      "VMs ohne aktives Changed Block Tracking. CBT erlaubt inkrementelle Backups, indem nur geänderte Blöcke gesichert werden – fehlt es, sind Backups langsamer und größer.",
    source: `${RV} · vInfo · „CBT“`,
  },
  osDrift: {
    term: "OS Drift",
    description:
      "VMs, bei denen das von den VMware Tools gemeldete Gast-OS von der Angabe in der Konfigurationsdatei abweicht. Deutet auf veraltete Tools, ein Gast-Upgrade oder eine falsch gesetzte OS-Kennung hin.",
    source: `${RV} · vInfo · „OS according to the configuration file“ / „OS according to the VMware Tools“`,
  },
  uuidMissing: {
    term: "UUID fehlt",
    description:
      "VMs ohne eindeutige BIOS-UUID. Eine fehlende UUID erschwert die eindeutige Identifikation z.B. gegenüber Backup- oder CMDB-Systemen und kann auf geklonte oder unsauber angelegte VMs hinweisen.",
    source: `${RV} · vInfo · „VM UUID“`,
  },
  annotationEmpty: {
    term: "Annotation leer",
    description:
      "VMs ohne Notiz/Beschreibung im Annotations-Feld. Der Prozentwert zeigt den Anteil an allen VMs – leere Annotationen erschweren Betrieb und Zuordnung von Verantwortlichkeiten.",
    source: `${RV} · vInfo · „Annotation“`,
  },
};

/* ------------------------------------------------------------------ */
/*  Compliance-Tab – Tabelle „VM Compliance“                          */
/* ------------------------------------------------------------------ */
export const COMPLIANCE_COLUMNS: Record<string, GlossaryEntry> = {
  vmName: {
    term: "VM",
    description: "Anzeigename der VM in vCenter.",
    source: `${RV} · vInfo · „VM“`,
  },
  hwVersion: {
    term: "HW Version",
    description:
      "Virtuelle Hardware-Version (vmx-…). Rot markiert = vmx-13 und älter (ESXi-6.x-Ära), gelb = vmx-14 bis 18 (veraltet). Höhere Versionen schalten neue VM-Features frei, erfordern aber passende ESXi-Stände.",
    source: `${RV} · vInfo · „HW version“`,
  },
  firmware: {
    term: "Firmware",
    description: "Boot-Firmware der VM: BIOS oder EFI/UEFI. EFI ist Voraussetzung für Secure Boot und vTPM.",
    source: `${RV} · vInfo · „Firmware“`,
  },
  secureBoot: {
    term: "Secure Boot",
    description:
      "Zeigt an, ob UEFI Secure Boot aktiv ist. „Nein“ bedeutet: kein signaturgeprüfter Bootvorgang.",
    source: `${RV} · vInfo · „EFI Secure boot“`,
  },
  cbt: {
    term: "CBT",
    description:
      "Changed Block Tracking – Grundlage für inkrementelle Backups. „Nein“ führt zu vollständigen statt inkrementellen Sicherungen.",
    source: `${RV} · vInfo · „CBT“`,
  },
  osDrift: {
    term: "OS Drift",
    description:
      "„Ja“, wenn die OS-Angabe aus den VMware Tools von der Konfigurationsdatei abweicht – typisch bei veralteten Tools oder falscher OS-Kennung.",
    source: `${RV} · vInfo`,
  },
  uuidMissing: {
    term: "UUID fehlt",
    description: "„Ja“, wenn keine BIOS-UUID hinterlegt ist – erschwert die eindeutige Identifikation der VM.",
    source: `${RV} · vInfo · „VM UUID“`,
  },
  annotationEmpty: {
    term: "Annotation leer",
    description: "„Ja“, wenn das Annotations-/Notizfeld der VM leer ist.",
    source: `${RV} · vInfo · „Annotation“`,
  },
  cluster: {
    term: "Cluster",
    description: "HA/DRS-Cluster, dem die VM zugeordnet ist.",
    source: `${RV} · vInfo · „Cluster“`,
  },
};

/* ------------------------------------------------------------------ */
/*  Operations-Tab – KPIs                                             */
/* ------------------------------------------------------------------ */
export const OPERATIONS_KPI: Record<string, GlossaryEntry> = {
  toolsUpgradeable: {
    term: "Tools Upgrade",
    description:
      "VMs, deren VMware Tools laut vCenter aktualisierbar sind (Status „guestToolsNeedUpgrade“). Aktuelle Tools sichern Treiber, Heartbeat und saubere Gast-Shutdowns – planbar über die Wellenplanung unten.",
    source: `${RV} · vTools · „Upgradeable“`,
  },
  ntpDnsIssues: {
    term: "NTP/DNS Issues",
    description:
      "Hosts mit Auffälligkeiten bei Zeit- oder Namensauflösung (kein NTP-Server, NTPD inaktiv, kein DNS oder DHCP aktiv). Zeit-Drift und DNS-Lücken verursachen Auth-, Zertifikats- und Log-Probleme.",
    source: `${RV} · vHost`,
  },
  hwUpgradeBacklog: {
    term: "HW Upgrade Backlog",
    description:
      "VMs mit einem in vCenter gesetzten HW-Upgrade-Status. Zeigt geplante bzw. ausstehende Anhebungen der virtuellen Hardware-Version an.",
    source: `${RV} · vInfo · „HW upgrade status“`,
  },
  latencyNonNormal: {
    term: "Latency Sonderfälle",
    description:
      "VMs mit einer Latency Sensitivity ungleich „normal“ (z.B. „high“). Diese Einstellung reserviert CPU exklusiv und kann DRS/Overcommit stören – bewusst nur für latenzkritische Workloads setzen.",
    source: `${RV} · vInfo · „Latency Sensitivity“`,
  },
};

/* ------------------------------------------------------------------ */
/*  Operations-Tab – Tabellen                                         */
/* ------------------------------------------------------------------ */
export const NTP_COLUMNS: Record<string, GlossaryEntry> = {
  host: {
    term: "Host",
    description: "ESXi-Host, für den die Zeit-/Namens-Konfiguration geprüft wird.",
    source: `${RV} · vHost · „Host“`,
  },
  ntpServers: {
    term: "NTP Server",
    description: "Konfigurierte NTP-Zeitquellen des Hosts. Fehlen sie, driftet die Host-Uhr.",
    source: `${RV} · vHost · „NTP Server(s)“`,
  },
  ntpdRunning: {
    term: "NTPD",
    description: "Läuft der NTP-Dienst am Host? „Nein“ bedeutet, dass trotz Konfiguration keine Zeitsynchronisation aktiv ist.",
    source: `${RV} · vHost · „NTPD running“`,
  },
  dnsServers: {
    term: "DNS Server",
    description: "Hinterlegte DNS-Server des Hosts. Ohne DNS scheitern Namensauflösung und viele vCenter-Operationen.",
    source: `${RV} · vHost · „DNS Servers“`,
  },
  dhcp: {
    term: "DHCP",
    description: "„Ja“, wenn das Management-Interface seine IP per DHCP bezieht. Für ESXi-Management i.d.R. unerwünscht – statische Adressen bevorzugen.",
    source: `${RV} · vHost · „DHCP“`,
  },
  issues: {
    term: "Probleme",
    description: "Zusammenfassung der erkannten Hygiene-Verstöße (z.B. „Kein NTP“, „NTPD nicht aktiv“, „DHCP aktiv“).",
  },
};

export const HW_UPGRADE_COLUMNS: Record<string, GlossaryEntry> = {
  vm: {
    term: "VM",
    description: "Anzeigename der VM.",
    source: `${RV} · vInfo · „VM“`,
  },
  hwVersion: {
    term: "HW Version",
    description: "Aktuelle virtuelle Hardware-Version der VM (Ausgangspunkt des Upgrades).",
    source: `${RV} · vInfo · „HW version“`,
  },
  upgradeStatus: {
    term: "Upgrade Status",
    description: "Vom vCenter gemeldeter Zustand des HW-Upgrades (z.B. anstehend beim nächsten Neustart).",
    source: `${RV} · vInfo · „HW upgrade status“`,
  },
  upgradePolicy: {
    term: "Policy",
    description: "Upgrade-Richtlinie der VM: manuell, beim nächsten Power-Cycle oder nie automatisch.",
    source: `${RV} · vInfo · „HW upgrade policy“`,
  },
  target: {
    term: "Ziel",
    description: "Ziel-Hardware-Version, auf die laut Policy angehoben werden soll.",
    source: `${RV} · vInfo · „HW target“`,
  },
  cluster: {
    term: "Cluster",
    description: "Cluster der VM – hilft, Upgrades pro Wartungsfenster zu bündeln.",
    source: `${RV} · vInfo · „Cluster“`,
  },
};

export const TOOLS_WAVE_COLUMNS: Record<string, GlossaryEntry> = {
  cluster: {
    term: "Cluster",
    description: "Cluster als Planungseinheit – eine Welle entspricht typischerweise einem Cluster bzw. Wartungsfenster.",
    source: `${RV} · vTools · „Cluster“`,
  },
  upgradeableCount: {
    term: "Upgradeable",
    description: "Anzahl VMs im Cluster, deren VMware Tools aktualisiert werden können. Das ist der Arbeitsumfang der Welle.",
    source: `${RV} · vTools · „Upgradeable“`,
  },
  totalVms: {
    term: "VMs gesamt",
    description: "Gesamtzahl der VMs im Cluster mit Tools-Eintrag – Bezugsgröße für den Prozentwert.",
    source: `${RV} · vTools`,
  },
  pct: {
    term: "% Upgradeable",
    description: "Anteil aktualisierbarer VMs am Cluster. Hohe Werte bedeuten großen Nutzen, aber auch mehr Neustarts pro Fenster.",
  },
};

/* ------------------------------------------------------------------ */
/*  Infrastructure-Tab – KPIs                                         */
/* ------------------------------------------------------------------ */
export const INFRASTRUCTURE_KPI: Record<string, GlossaryEntry> = {
  maintenanceHosts: {
    term: "Maintenance",
    description:
      "Hosts im Wartungsmodus. Diese tragen keine laufenden VMs; ein dauerhaft hoher Wert reduziert die verfügbare Cluster-Kapazität und HA-Reserve.",
    source: `${RV} · vHost · „Maintenance Mode“`,
  },
  hosts: {
    term: "Hosts",
    description: "Anzahl der ESXi-Hosts mit erkennbarer Version/Build in den aktiven Snapshots.",
    source: `${RV} · vHost`,
  },
  driverEntries: {
    term: "Treiber-Einträge",
    description:
      "Gesamtzahl der inventarisierten HBA- und NIC-Einträge über alle Hosts. Basis für den Abgleich von Treiber-/Firmware-Ständen mit der VMware-Kompatibilitätsliste (HCL).",
    source: `${RV} · vHBA / vNIC`,
  },
  cpuMix: {
    term: "CPU Mix Cluster",
    description:
      "Cluster mit mehr als einem CPU-Modell. Gemischte CPU-Generationen erzwingen oft EVC-Modi und können vMotion sowie die nutzbaren CPU-Features einschränken.",
    source: `${RV} · vHost · „CPU Model“`,
  },
};

/* ------------------------------------------------------------------ */
/*  Infrastructure-Tab – Tabellen                                     */
/* ------------------------------------------------------------------ */
export const HOST_COLUMNS: Record<string, GlossaryEntry> = {
  host: {
    term: "Host",
    description: "ESXi-Hostname. Klick öffnet die Host-Detailansicht mit HBAs, NICs und VMs.",
    source: `${RV} · vHost · „Host“`,
  },
  cluster: {
    term: "Cluster",
    description: "HA/DRS-Cluster des Hosts.",
    source: `${RV} · vHost · „Cluster“`,
  },
  version: {
    term: "ESXi Version",
    description: "Installierte ESXi-Version des Hosts – Grundlage für Lifecycle- und Support-Betrachtung.",
    source: `${RV} · vHost · „ESX Version“`,
  },
  build: {
    term: "Build",
    description: "ESXi-Build-Nummer. Präziser als die Version, um Patch-Stände und Drift zwischen Hosts zu erkennen.",
    source: `${RV} · vHost · „ESX Version“`,
  },
  cpuModel: {
    term: "CPU Model",
    description: "Prozessormodell des Hosts. Unterschiedliche Modelle im selben Cluster erfordern häufig EVC.",
    source: `${RV} · vHost · „CPU Model“`,
  },
  vendor: {
    term: "Vendor",
    description: "Hardware-Hersteller des Servers.",
    source: `${RV} · vHost · „Vendor“`,
  },
  model: {
    term: "Model",
    description: "Servermodell/Baureihe des Hosts.",
    source: `${RV} · vHost · „Model“`,
  },
  maintenanceMode: {
    term: "Maintenance",
    description: "„Ja“, wenn der Host im Wartungsmodus ist und aktuell keine VMs betreibt.",
    source: `${RV} · vHost · „Maintenance Mode“`,
  },
};

export const DRIVER_COLUMNS: Record<string, GlossaryEntry> = {
  host: {
    term: "Host",
    description: "ESXi-Host, zu dem das HBA/NIC-Gerät gehört.",
    source: `${RV} · vHBA / vNIC · „Host“`,
  },
  cluster: {
    term: "Cluster",
    description: "Cluster des Hosts.",
    source: `${RV} · vHBA / vNIC · „Cluster“`,
  },
  device: {
    term: "Device",
    description: "Gerätebezeichnung des Storage-Adapters (HBA) bzw. der Netzwerkkarte (NIC).",
    source: `${RV} · vHBA · „Device“ / vNIC · „Network Device“`,
  },
  type: {
    term: "Typ",
    description: "Art des Geräts: HBA-Typ (z.B. FC, iSCSI) oder „NIC“ für Netzwerkkarten.",
    source: `${RV} · vHBA · „Type“`,
  },
  driver: {
    term: "Treiber",
    description: "Geladener Treiber des Geräts. Für den HCL-Abgleich mit Firmware/Async-Treiberständen relevant.",
    source: `${RV} · vHBA / vNIC · „Driver“`,
  },
  model: {
    term: "Modell",
    description: "Modellbezeichnung des Adapters (nur bei HBAs befüllt).",
    source: `${RV} · vHBA · „Model“`,
  },
};

/* ------------------------------------------------------------------ */
/*  Versionen-Tab (VmwareVersionsPanel) – KPIs                        */
/* ------------------------------------------------------------------ */
export const VERSIONS_KPI: Record<string, GlossaryEntry> = {
  activeVcenters: {
    term: "Aktive vCenter",
    description: "Anzahl unterschiedlicher vCenter in den aktiven Snapshots. Bezugsgröße für die vCenter-Adoption.",
    source: `${RV} · vSource`,
  },
  activeHosts: {
    term: "Aktive ESXi Hosts",
    description: "Anzahl der ESXi-Hosts in den aktiven Snapshots. Bezugsgröße für die ESXi-Adoption.",
    source: `${RV} · vHost`,
  },
  vcenterOnLatest: {
    term: "vCenter auf neuestem Release",
    description:
      "vCenter-Instanzen, die bereits auf dem jüngsten bekannten Release laufen. Der Prozentwert zeigt den Anteil an allen aktiven vCentern – niedrige Werte deuten auf Patch-Rückstand.",
    source: `${RV} · vSource · „Build“`,
  },
  esxiOnLatest: {
    term: "ESXi auf neuestem Release",
    description:
      "ESXi-Hosts auf dem jüngsten bekannten Release. Der Prozentwert zeigt den Anteil an allen aktiven Hosts.",
    source: `${RV} · vHost · „Build“`,
  },
  vcenterTracked: {
    term: "vCenter Releases erkannt",
    description:
      "vCenter, deren Build einem Eintrag im Release-Katalog zugeordnet werden konnte. „% abgedeckt“ zeigt, wie vollständig die Zuordnung ist; der Rest nutzt unbekannte/ältere Builds.",
    source: `${RV} · vSource · „Build“`,
  },
  esxiTracked: {
    term: "ESXi Releases erkannt",
    description:
      "ESXi-Hosts, deren Build im Release-Katalog gefunden wurde. „% abgedeckt“ zeigt die Vollständigkeit der Zuordnung.",
    source: `${RV} · vHost · „Build“`,
  },
};

export const VERSIONS_COLUMNS: Record<string, GlossaryEntry> = {
  title: {
    term: "Release",
    description: "Offizieller Release-Name (VMware). Der Link führt zu den zugehörigen Release Notes.",
  },
  version: {
    term: "Version",
    description: "Versionskennung des Releases (z.B. 8.0 Update x).",
  },
  releaseTimestamp: {
    term: "Release Date",
    description: "Veröffentlichungsdatum des Releases – Orientierung für Alter und Support-Zeitraum.",
  },
  build: {
    term: "ISO Build",
    description: "Zum Release gehörende Build-Nummer aus dem Katalog, gegen die die erkannten Builds abgeglichen werden.",
  },
  usageCount: {
    term: "In Nutzung",
    description: "Wie viele vCenter bzw. Hosts dieses Release nutzen – im Verhältnis zur Gesamtzahl.",
    source: `${RV} · vSource / vHost · „Build“`,
  },
  adoptionPct: {
    term: "Adoption",
    description: "Anteil der Assets auf diesem Release. Grün ab 75 %, gelb ab 30 % – hilft, den Roll-out-Fortschritt zu sehen.",
  },
};

/* ------------------------------------------------------------------ */
/*  Abschnitts-Überschriften (Sinn + Arbeitsweise)                    */
/* ------------------------------------------------------------------ */
export const COMPLIANCE_SECTIONS: Record<string, GlossaryEntry> = {
  vcenterVersion: {
    term: "vCenter Versionsstand",
    description:
      "Zeigt Fullname, Version und API-Version der erfassten vCenter. Nutze den Überblick, um Patch-Rückstände und Support-Fristen je Management-Instanz zu prüfen, bevor du Host- oder Tools-Upgrades planst.",
  },
  hwVersionDistribution: {
    term: "HW Version Verteilung",
    description:
      "Verteilung aller VMs nach virtueller Hardware-Version. Ein großer Anteil alter vmx-Stände (links) markiert Lifecycle-Rückstand – arbeite dich von den ältesten Versionen nach vorne, da diese neue Features blockieren und an ESXi-Support-Grenzen stoßen.",
  },
  complianceTable: {
    term: "VM Compliance",
    description:
      "Compliance-Sicht je VM: Secure Boot, Firmware, CBT, OS-Drift, UUID und Annotation auf einen Blick. Sortiere/suche nach den auffälligen Spalten und klicke eine Zeile an, um die VM-Details zu öffnen und die Abweichung gezielt abzuarbeiten.",
  },
  ntpDnsHygiene: {
    term: "NTP/DNS Hygiene",
    description:
      "Listet Hosts mit Zeit- oder Namensauflösungs-Problemen. Zeitdrift und DNS-Lücken sind häufige Ursachen für Auth-, Zertifikats- und Backup-Fehler – arbeite diese Liste als Grundhygiene ab, bevor du komplexeren Störungen nachgehst.",
  },
  hwUpgradeBacklog: {
    term: "VM HW Upgrade Backlog",
    description:
      "VMs mit gesetztem HW-Upgrade-Status samt Policy und Zielversion. So erkennst du, welche Anhebungen beim nächsten Neustart greifen, und kannst sie clusterweise auf Wartungsfenster bündeln.",
  },
  toolsWavePlan: {
    term: "VMTools Upgrade Wellenplanung",
    description:
      "Sinn: VMware-Tools-Upgrades erfordern pro VM meist einen Reboot. Alle Tools gleichzeitig zu aktualisieren würde zu viele Neustarts in ein Fenster legen und das Ausfallrisiko bündeln – deshalb staffelt man in Wellen (typisch je Cluster/Wartungsfenster). Arbeitsweise: Die Tabelle gruppiert die aktualisierbaren VMs pro Cluster und zeigt Anzahl und Anteil. Beginne mit unkritischen Clustern als Pilot, plane je Welle so viele Reboots ein, wie das Fenster verträgt, und arbeite dich Welle für Welle bis zu den kritischen Systemen vor.",
  },
  latencyCases: {
    term: "Latency Sensitivity Sonderfälle",
    description:
      "VMs mit erhöhter Latency Sensitivity. Diese Einstellung reserviert CPU exklusiv und umgeht Scheduling-Optimierungen – prüfe je Fall, ob die Reservierung fachlich begründet ist, da sie Konsolidierung und DRS beeinträchtigt.",
  },
  esxiBuild: {
    term: "ESXi Version/Build",
    description:
      "Verteilung der Hosts nach ESXi-Version und Build. Viele unterschiedliche Segmente bedeuten Patch-Drift – Ziel ist ein einheitlicher, aktueller Build je Cluster, damit vMotion und Support-Annahmen konsistent bleiben.",
  },
  hostInventory: {
    term: "Host Inventar",
    description:
      "Vollständige Host-Liste mit Version, Build, CPU und Hardware. Nutze sie als Ausgangspunkt für Standardisierung und Refresh-Planung; ein Klick auf einen Host öffnet dessen HBA-/NIC- und VM-Details.",
  },
  driverInventory: {
    term: "HBA/NIC Treiberinventar",
    description:
      "Storage- und Netzwerkadapter aller Hosts mit ihren Treibern. Gleiche Treiber-/Firmware-Stände gegen die VMware-HCL ab – abweichende oder nicht gelistete Treiber sind häufige Ursachen für PSODs und Storage-Pfadprobleme.",
  },
  cpuMix: {
    term: "CPU-Generationen Mix je Cluster",
    description:
      "Cluster mit mehreren CPU-Modellen. Gemischte Generationen erzwingen einen EVC-Modus (kleinster gemeinsamer Nenner) und können vMotion einschränken – nutze die Übersicht, um Cluster für einen Hardware-Refresh zu homogenisieren.",
  },
  vcenterReleaseUsage: {
    term: "vCenter Release Nutzung",
    description:
      "Nutzung der vCenter je erkanntem Release; das jüngste Release ist hervorgehoben. Ein niedriger Balken beim aktuellen Release zeigt Patch-Rückstand – priorisiere das Management-Layer, da es Voraussetzung für Host-Upgrades ist.",
  },
  esxiReleaseUsage: {
    term: "ESXi Release Nutzung",
    description:
      "Nutzung der ESXi-Hosts je erkanntem Release; das jüngste Release ist hervorgehoben. Hilft, den Roll-out-Fortschritt eines ESXi-Updates über die Flotte zu verfolgen.",
  },
  vcenterVersionsTable: {
    term: "Neueste vCenter Versionen",
    description:
      "Katalog der jüngsten vCenter-Releases mit erkannter Nutzung und Adoption. Vergleiche den eigenen Stand mit dem neuesten Release und öffne bei Bedarf die verlinkten Release Notes zur Upgrade-Planung.",
  },
  esxiVersionsTable: {
    term: "Neueste ESXi Versionen",
    description:
      "Katalog der jüngsten ESXi-Releases mit erkannter Nutzung und Adoption. Grundlage, um Ziel-Builds für die Host-Standardisierung festzulegen.",
  },
};
