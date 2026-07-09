import type { GlossaryEntry } from "@/lib/glossary";

/**
 * Glossar für die Performance-Seite (Engpass-Analyse).
 * Zielgruppe: VMware-Administrator:innen.
 */

const RV = "RVTools";

/* ------------------------------------------------------------------ */
/*  Performance – KPIs                                                 */
/* ------------------------------------------------------------------ */
export const PERFORMANCE_KPI: Record<string, GlossaryEntry> = {
  cpuReadyHotspots: {
    term: "CPU Ready Hotspots",
    description:
      "VMs mit CPU Ready über 5 %. CPU Ready ist die Zeit, die eine VM auf einen freien physischen Core wartet – hohe Werte bedeuten spürbare CPU-Contention.",
    source: `${RV} · vCPU · „Ready“`,
  },
  memoryPressure: {
    term: "Memory Pressure",
    description:
      "VMs mit geswapptem oder geballontem RAM. Beides zeigt, dass der Host RAM zurückfordern musste – ein Zeichen für RAM-Knappheit und Performance-Einbußen.",
    source: `${RV} · vMemory · „Swapped“ / „Ballooned“`,
  },
  entitlementGaps: {
    term: "Entitlement Gaps",
    description:
      "VMs mit deutlicher Abweichung zwischen zugesagten (Entitlement) und tatsächlich genutzten Ressourcen. Weist auf falsch dimensionierte oder ausgebremste VMs hin.",
    source: `${RV} · vCPU / vMemory · „Entitlement“`,
  },
  ftVms: {
    term: "FT VMs",
    description:
      "VMs mit aktiviertem Fault Tolerance. FT spiegelt die VM synchron auf einen zweiten Host – hohe Latenzen gefährden die Synchronität und damit den FT-Schutz.",
    source: `${RV} · vInfo · „FT State“`,
  },
  vmNetAnomalies: {
    term: "VM Netz-Anomalien",
    description:
      "Eingeschaltete VMs mit auffälliger Netzanbindung: getrennte NIC oder fehlende IPv4-Adresse. Typische Ursache für nicht erreichbare Dienste.",
    source: `${RV} · vNetwork · „Connected“ / „IPv4 Address“`,
  },
  multipathIssues: {
    term: "Multipath Issues",
    description:
      "Speicherpfade mit nicht-ok Betriebszustand oder toten (dead) Pfaden. Reduziert Redundanz und Durchsatz zum Storage – kann Latenzspitzen verursachen.",
    source: `${RV} · vMultiPath · „Oper. State“ / „Path n state“`,
  },
  nicQuality: {
    term: "NIC Qualität",
    description:
      "Host-Uplinks mit auffälliger Verbindung: Speed unter 10 Gbit/s oder Half Duplex. Kann Netzengpässe und Paketverluste verursachen.",
    source: `${RV} · vNIC · „Speed“ / „Duplex“`,
  },
};

/* ------------------------------------------------------------------ */
/*  Performance – CPU-Ready-Tabelle                                    */
/* ------------------------------------------------------------------ */
export const PERFORMANCE_PERF_COLUMNS: Record<string, GlossaryEntry> = {
  vmName: {
    term: "VM",
    description: "Anzeigename der VM in vCenter.",
    source: `${RV} · vInfo · „VM“`,
  },
  cpuReady: {
    term: "CPU Ready %",
    description:
      "Anteil der Zeit, in der die VM auf einen freien physischen Core wartet. Über 5 % (gelb) bzw. 10 % (rot) bremst CPU-Contention die VM spürbar.",
    source: `${RV} · vCPU · „Ready“`,
  },
  cpuCount: {
    term: "vCPU",
    description:
      "Anzahl der zugewiesenen virtuellen CPUs. Zu viele vCPUs können CPU Ready sogar verschlechtern (Co-Scheduling).",
    source: `${RV} · vInfo · „CPUs“`,
  },
  cluster: {
    term: "Cluster",
    description: "HA/DRS-Cluster der VM.",
    source: `${RV} · vInfo · „Cluster“`,
  },
  host: {
    term: "Host",
    description: "ESXi-Host, auf dem die VM zum Exportzeitpunkt lief.",
    source: `${RV} · vInfo · „Host“`,
  },
  powerState: {
    term: "Power",
    description: "Energiezustand der VM: eingeschaltet, ausgeschaltet oder pausiert.",
    source: `${RV} · vInfo · „Powerstate“`,
  },
};

/* ------------------------------------------------------------------ */
/*  Performance – Memory-Pressure-Tabelle                              */
/* ------------------------------------------------------------------ */
export const PERFORMANCE_MEM_COLUMNS: Record<string, GlossaryEntry> = {
  vmName: {
    term: "VM",
    description: "Anzeigename der VM in vCenter.",
    source: `${RV} · vMemory · „VM“`,
  },
  sizeMiB: {
    term: "RAM",
    description: "Konfigurierter Arbeitsspeicher der VM.",
    source: `${RV} · vMemory · „Size MiB“`,
  },
  swapped: {
    term: "Swapped MiB",
    description:
      "RAM, den der Host auf Disk ausgelagert hat. Jeder Wert über 0 ist kritisch – Swapping ist um Größenordnungen langsamer als RAM.",
    source: `${RV} · vMemory · „Swapped“`,
  },
  ballooned: {
    term: "Ballooned MiB",
    description:
      "RAM, den der Balloon-Treiber im Gast zurückgefordert hat. Ein Frühindikator für RAM-Druck auf dem Host, noch vor dem Swapping.",
    source: `${RV} · vMemory · „Ballooned“`,
  },
  active: {
    term: "Active MiB",
    description: "Vom Gast in jüngster Zeit aktiv genutzter Arbeitsspeicher.",
    source: `${RV} · vMemory · „Active“`,
  },
  cluster: {
    term: "Cluster",
    description: "HA/DRS-Cluster der VM.",
    source: `${RV} · vMemory · „Cluster“`,
  },
  host: {
    term: "Host",
    description: "ESXi-Host, auf dem die VM lief.",
    source: `${RV} · vMemory · „Host“`,
  },
};

/* ------------------------------------------------------------------ */
/*  Performance – Entitlement-Tabelle                                  */
/* ------------------------------------------------------------------ */
export const PERFORMANCE_ENTITLEMENT_COLUMNS: Record<string, GlossaryEntry> = {
  vm: {
    term: "VM",
    description: "Anzeigename der VM in vCenter.",
    source: `${RV} · vCPU · „VM“`,
  },
  cluster: {
    term: "Cluster",
    description: "HA/DRS-Cluster der VM.",
    source: `${RV} · vCPU · „Cluster“`,
  },
  cpuEntitlement: {
    term: "CPU Entitlement",
    description:
      "CPU-Leistung in MHz, die dem Gast laut Ressourcen-Einstellungen zusteht.",
    source: `${RV} · vCPU · „Entitlement“`,
  },
  cpuDrsEntitlement: {
    term: "DRS Entitlement",
    description: "Von DRS berechnetes CPU-Entitlement der VM in MHz.",
    source: `${RV} · vCPU · „DRS Entitlement“`,
  },
  cpuOverall: {
    term: "CPU Overall",
    description: "Gesamte von der VM genutzte CPU-Leistung in MHz.",
    source: `${RV} · vCPU · „Overall“`,
  },
  cpuDelta: {
    term: "CPU Delta",
    description:
      "Differenz aus Entitlement und tatsächlicher Nutzung (MHz). Große Beträge (>500) deuten auf Über- oder Unterversorgung der VM hin.",
    source: "berechnet · Entitlement − Overall",
  },
  memEntitlement: {
    term: "Mem Entitl.",
    description: "Dem Gast zustehender Arbeitsspeicher laut Ressourcen-Einstellungen (MiB).",
    source: `${RV} · vMemory · „Entitlement“`,
  },
  memActive: {
    term: "Mem Active",
    description: "Aktiv genutzter Arbeitsspeicher der VM (MiB).",
    source: `${RV} · vMemory · „Active“`,
  },
  memDelta: {
    term: "Mem Delta",
    description:
      "Differenz aus RAM-Entitlement und aktiver Nutzung (MiB). Große Beträge (>1024) deuten auf falsch dimensionierten RAM hin.",
    source: "berechnet · Entitlement − Active",
  },
};

/* ------------------------------------------------------------------ */
/*  Performance – Fault-Tolerance-Tabelle                              */
/* ------------------------------------------------------------------ */
export const PERFORMANCE_FT_COLUMNS: Record<string, GlossaryEntry> = {
  vm: {
    term: "VM",
    description: "Anzeigename der VM in vCenter.",
    source: `${RV} · vInfo · „VM“`,
  },
  ftState: {
    term: "FT State",
    description: "Fault-Tolerance-Zustand der VM, z.B. „running“ oder „needSecondary“.",
    source: `${RV} · vInfo · „FT State“`,
  },
  ftRole: {
    term: "FT Role",
    description: "Rolle der VM im FT-Paar: Primary oder Secondary.",
    source: `${RV} · vInfo · „FT Role“`,
  },
  ftLatency: {
    term: "Latency (ms)",
    description:
      "Latenz zwischen Primary und Secondary. Über 5 ms (mittel) bzw. 10 ms (hoch) ist die FT-Synchronität gefährdet.",
    source: `${RV} · vInfo · „FT Latency“`,
  },
  ftSecLatency: {
    term: "Sec. Latency (ms)",
    description: "Latenz der Secondary-Seite des FT-Paars. Gleiche Schwellen wie bei der Latency.",
    source: `${RV} · vInfo · „FT Sec. Latency“`,
  },
  ftBandwidth: {
    term: "Bandwidth",
    description: "Für die FT-Spiegelung genutzte Bandbreite.",
    source: `${RV} · vInfo · „FT Bandwidth“`,
  },
  risk: {
    term: "Risiko",
    description:
      "Abgeleitete Einstufung aus den FT-Latenzen: „hoch“ ab 10 ms, „mittel“ ab 5 ms.",
    source: "berechnet",
  },
};

/* ------------------------------------------------------------------ */
/*  Performance – VM-Netzwerkanomalien-Tabelle                         */
/* ------------------------------------------------------------------ */
export const PERFORMANCE_VMNET_COLUMNS: Record<string, GlossaryEntry> = {
  vm: {
    term: "VM",
    description: "Anzeigename der VM in vCenter.",
    source: `${RV} · vNetwork · „VM“`,
  },
  nic: {
    term: "NIC",
    description: "Bezeichnung der virtuellen Netzwerkkarte, z.B. „Network adapter 1“.",
    source: `${RV} · vNetwork · „NIC label“`,
  },
  network: {
    term: "Netzwerk",
    description: "Portgruppe/Netzwerk, mit dem die NIC verbunden ist.",
    source: `${RV} · vNetwork · „Network“`,
  },
  connected: {
    term: "Verbunden",
    description:
      "Ob die NIC verbunden ist. „Nein“ bei eingeschalteter VM bedeutet meist keine Netzanbindung.",
    source: `${RV} · vNetwork · „Connected“`,
  },
  ipv4: {
    term: "IPv4",
    description:
      "Gemeldete IPv4-Adresse. Fehlt sie bei eingeschalteter, verbundener VM, laufen die VMware Tools evtl. nicht oder es gibt kein DHCP-Lease.",
    source: `${RV} · vNetwork · „IPv4 Address“`,
  },
  issue: {
    term: "Problem",
    description: "Erkannte Auffälligkeit: getrennte NIC und/oder fehlende IPv4-Adresse.",
    source: "berechnet",
  },
};

/* ------------------------------------------------------------------ */
/*  Performance – SIOC-Tabelle                                         */
/* ------------------------------------------------------------------ */
export const PERFORMANCE_SIOC_COLUMNS: Record<string, GlossaryEntry> = {
  datastore: {
    term: "Datastore",
    description: "Name des Datastores.",
    source: `${RV} · vDatastore · „Name“`,
  },
  siocEnabled: {
    term: "SIOC",
    description:
      "Ob Storage I/O Control aktiv ist. SIOC priorisiert I/O bei Überlast fair zwischen VMs – ohne SIOC kann eine VM den Datastore dominieren.",
    source: `${RV} · vDatastore · „SIOC enabled“`,
  },
  siocThreshold: {
    term: "Threshold (ms)",
    description:
      "Latenzschwelle, ab der SIOC eingreift (Standard 30 ms). Wird sie überschritten, beginnt die I/O-Drosselung.",
  },
  freePct: {
    term: "Frei %",
    description:
      "Freier Speicher des Datastores. Unter 20 % (gelb) bzw. 10 % (rot) steigt neben dem Platz- auch das Latenzrisiko.",
    source: `${RV} · vDatastore · „Free %“`,
  },
  risk: {
    term: "Risiko",
    description:
      "Abgeleitete Einstufung: „hoch“ unter 10 % frei, „mittel“ bei <20 % frei ohne aktives SIOC.",
    source: "berechnet",
  },
};

/* ------------------------------------------------------------------ */
/*  Performance – Host-NIC-Qualität-Tabelle                            */
/* ------------------------------------------------------------------ */
export const PERFORMANCE_NIC_COLUMNS: Record<string, GlossaryEntry> = {
  host: {
    term: "Host",
    description: "ESXi-Host, zu dem der Uplink gehört.",
    source: `${RV} · vNIC · „Host“`,
  },
  device: {
    term: "NIC",
    description: "Bezeichnung des physischen Netzwerkadapters, z.B. „vmnic0“.",
    source: `${RV} · vNIC · „Network Device“`,
  },
  speed: {
    term: "Speed (Mbps)",
    description:
      "Ausgehandelte Verbindungsgeschwindigkeit in Mbit/s. Unter 10.000 (10 Gbit/s) gilt der Uplink hier als auffällig langsam.",
    source: `${RV} · vNIC · „Speed“`,
  },
  duplex: {
    term: "Full Duplex",
    description:
      "Ob die Verbindung im Vollduplex läuft. „Nein“ (Half Duplex) deutet auf eine fehlerhafte Aushandlung hin und kostet Durchsatz.",
    source: `${RV} · vNIC · „Duplex“`,
  },
  issue: {
    term: "Problem",
    description: "Erkannte Auffälligkeit: niedrige Geschwindigkeit und/oder Half Duplex.",
    source: "berechnet",
  },
};

/* ------------------------------------------------------------------ */
/*  Performance – Abschnitts-Überschriften                             */
/* ------------------------------------------------------------------ */
export const PERFORMANCE_SECTIONS: Record<string, GlossaryEntry> = {
  topCpuReady: {
    term: "Top CPU Ready VMs",
    description:
      "Die 15 VMs mit dem höchsten CPU Ready. Rote Balken (>10 %) leiden unter starker CPU-Contention, gelbe (>5 %) sind grenzwertig. Nutze die Rangliste, um Kandidaten für weniger vCPUs oder eine Verschiebung auf entlastete Hosts zu finden.",
  },
  cpuReadyDetails: {
    term: "CPU Ready Details",
    description:
      "Alle VMs mit CPU Ready > 0, absteigend sortiert. Klick auf eine Zeile öffnet die Detailansicht. Prüfe hier, ob hohe Ready-Werte mit hoher vCPU-Anzahl oder dicht gepackten Hosts zusammenfallen.",
  },
  memoryPressure: {
    term: "Memory Pressure — Swapped / Ballooned",
    description:
      "VMs mit geswapptem oder geballontem RAM, nach Schwere sortiert. Ballooning ist der Frühindikator, Swapping das akute Problem. Behebe die Ursache über RAM-Reservierungen, weniger Overcommit oder mehr Host-RAM.",
  },
  entitlementGaps: {
    term: "Entitlement Gaps",
    description:
      "VMs mit großer Lücke zwischen zugesagten und genutzten CPU-/RAM-Ressourcen. Positive Deltas deuten auf Überdimensionierung (Rightsizing-Kandidaten), negative auf ausgebremste VMs hin.",
  },
  ftLatency: {
    term: "FT Latenz Monitoring",
    description:
      "Alle VMs mit aktivierter Fault Tolerance samt Latenzen und Risiko. Hohe Latenzen (ab 5 ms) gefährden die synchrone Spiegelung – prüfe das FT-Logging-Netz und die Host-Last.",
  },
  vmNetAnomalies: {
    term: "VM Netzwerkanomalien",
    description:
      "Eingeschaltete VMs mit getrennter NIC oder fehlender IPv4-Adresse. Häufige Ursache für nicht erreichbare Dienste – hier findest du sie, bevor Nutzer sie melden.",
  },
  sioc: {
    term: "Storage Congestion / SIOC",
    description:
      "Datastores mit SIOC-Status und freiem Speicher. Zeigt, wo I/O-Contention droht und ob SIOC als Schutz aktiv ist. Bei knappen Datastores ohne SIOC steigt das Risiko dominierender „Noisy Neighbors“.",
  },
  nicQuality: {
    term: "Host NIC Link Qualität",
    description:
      "Host-Uplinks mit niedriger Geschwindigkeit oder Half Duplex. Klick auf eine Zeile öffnet die Host-Detailansicht. Solche Links sind oft Fehlaushandlungen und begrenzen den Netzdurchsatz des Hosts.",
  },
};
