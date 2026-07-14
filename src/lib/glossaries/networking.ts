import type { GlossaryEntry } from "@/lib/glossary";

/**
 * Glossar für die Seite „Netzwerk“ mit den beiden Tabs
 * „Security & Policies“ (NetworkSecurityPanel) und „Host-Netzwerk“ (HostNetworkPanel).
 *
 * Zielgruppe: VMware-Administrator:innen.
 */

const RV = "RVTools";

/* ================================================================== */
/*  Tab „Security & Policies“                                          */
/* ================================================================== */

export const NET_SECURITY_KPI: Record<string, GlossaryEntry> = {
  portgroups: {
    term: "Portgroups",
    description:
      "Anzahl der Portgruppen über Standard- und Distributed-Switches. Basis-Inventar der logischen Netzwerkanbindungen.",
    source: `${RV} · vPort / dvPort`,
  },
  securityDrift: {
    term: "Security Drift",
    description:
      "Portgruppen, in denen mindestens eine der Sicherheitsrichtlinien Promiscuous Mode, MAC Changes oder Forged Transmits aktiviert ist. Abweichung vom sicheren Standard (alles „Reject“).",
    source: `${RV} · vPort / dvPort`,
  },
  promiscuous: {
    term: "Promiscuous",
    description:
      "Portgruppen mit aktiviertem Promiscuous Mode. Erlaubt das Mitlesen fremden Datenverkehrs – nur bewusst (z.B. für IDS/Nested-ESXi) zulassen.",
    source: `${RV} · vPort / dvPort · „Promiscuous Mode“`,
  },
  mtuVariants: {
    term: "MTU Varianten",
    description:
      "Anzahl unterschiedlicher MTU-Werte über alle VMkernel-Adapter. Mehr als ein bis zwei Werte deuten auf inkonsistente Jumbo-Frame-Konfiguration hin (Risiko für vMotion/iSCSI/NFS).",
    source: `${RV} · vSC_VMK · „MTU“`,
  },
  vmkDhcp: {
    term: "VMK DHCP",
    description:
      "VMkernel-Adapter, die ihre IP per DHCP beziehen. Für Management/vMotion/Storage untypisch – meist sind statische Adressen gewünscht.",
    source: `${RV} · vSC_VMK · „DHCP“`,
  },
  uplinkSpof: {
    term: "Uplink SPOF",
    description:
      "Distributed-Portgruppen mit unzureichender Uplink-Redundanz (kein oder nur ein aktiver Uplink ohne Standby). Single Point of Failure für die betroffenen Netze.",
    source: `${RV} · dvPort · „Active/Standby Uplink“`,
  },
  teamingIssues: {
    term: "Teaming Issues",
    description:
      "Portgruppen mit abweichender Teaming-Policy, aktivem Rolling Order oder deaktiviertem Notify Switch. Kandidaten für Failover-Probleme und Uneinheitlichkeit.",
    source: `${RV} · vPort / dvPort`,
  },
};

export const NET_POLICY_COLUMNS: Record<string, GlossaryEntry> = {
  name: {
    term: "Port/Switch",
    description: "Name der Portgruppe (Standard) bzw. des Distributed-Ports.",
    source: `${RV} · vPort · „Port Group“ / dvPort · „Port“`,
  },
  type: {
    term: "Typ",
    description: "Herkunft: Standard-vSwitch-Portgruppe oder Distributed-vSwitch-Port.",
  },
  vlan: {
    term: "VLAN",
    description: "Zugeordnete VLAN-ID der Portgruppe. 0 bzw. leer = kein VLAN-Tagging.",
    source: `${RV} · vPort / dvPort · „VLAN“`,
  },
  promiscuous: {
    term: "Promiscuous",
    description:
      "Promiscuous Mode. „AN“ (rot) erlaubt das Mitlesen fremder Frames – nur für IDS/Nested-Szenarien bewusst aktivieren.",
    source: `${RV} · vPort · „Promiscuous Mode“ / dvPort · „Allow Promiscuous“`,
  },
  macChanges: {
    term: "MAC Changes",
    description:
      "Erlaubt der VM, ihre MAC-Adresse zu ändern. „AN“ (gelb) ist meist nur für spezielle Cluster-/NLB-Lösungen nötig.",
    source: `${RV} · vPort / dvPort · „Mac Changes“`,
  },
  forgedTransmits: {
    term: "Forged Transmits",
    description:
      "Erlaubt Frames mit abweichender Quell-MAC. „AN“ (gelb) außerhalb von Nested-ESXi/NLB kritisch prüfen.",
    source: `${RV} · vPort / dvPort · „Forged Transmits“`,
  },
  policy: {
    term: "Teaming",
    description: "Load-Balancing-/Failover-Policy der Portgruppe.",
    source: `${RV} · vPort / dvPort · „Policy“`,
  },
};

export const NET_VMK_COLUMNS: Record<string, GlossaryEntry> = {
  host: {
    term: "Host",
    description: "ESXi-Host, dem der VMkernel-Adapter gehört.",
    source: `${RV} · vSC_VMK · „Host“`,
  },
  portGroup: {
    term: "Port Group",
    description: "Portgruppe, über die der VMkernel-Adapter angebunden ist.",
    source: `${RV} · vSC_VMK · „Port Group“`,
  },
  device: {
    term: "Device",
    description: "VMkernel-Interface (z.B. vmk0 = Management, vmk1 = vMotion).",
    source: `${RV} · vSC_VMK · „Device“`,
  },
  ip: {
    term: "IP",
    description: "IP-Adresse des VMkernel-Adapters.",
    source: `${RV} · vSC_VMK · „IP Address“`,
  },
  subnet: {
    term: "Subnet",
    description: "Subnetzmaske des VMkernel-Adapters.",
    source: `${RV} · vSC_VMK · „Subnet mask“`,
  },
  mtu: {
    term: "MTU",
    description:
      "Maximum Transmission Unit. 1500 = Standard, 9000 = Jumbo Frames. Abweichende Werte (gelb) müssen durchgängig (vmk, vSwitch, physisch) übereinstimmen.",
    source: `${RV} · vSC_VMK · „MTU“`,
  },
  dhcp: {
    term: "DHCP",
    description: "„Ja“ (gelb) = IP per DHCP. Für VMkernel meist unerwünscht – statisch bevorzugen.",
    source: `${RV} · vSC_VMK · „DHCP“`,
  },
};

export const NET_NIC_COLUMNS: Record<string, GlossaryEntry> = {
  host: {
    term: "Host",
    description: "ESXi-Host der physischen NIC.",
    source: `${RV} · vNIC · „Host“`,
  },
  device: {
    term: "NIC",
    description: "Physisches Netzwerkgerät (vmnicN).",
    source: `${RV} · vNIC · „Network Device“`,
  },
  speed: {
    term: "Speed (Mbps)",
    description: "Ausgehandelte Link-Geschwindigkeit in Mbit/s. 0 deutet auf einen nicht verbundenen Uplink hin.",
    source: `${RV} · vNIC · „Speed“`,
  },
  duplex: {
    term: "Full Duplex",
    description: "„Ja“ = Vollduplex. Halbduplex weist auf Autonegotiation-Probleme hin.",
    source: `${RV} · vNIC · „Duplex“`,
  },
  driver: {
    term: "Treiber",
    description: "Verwendeter NIC-Treiber – relevant für Firmware-/Kompatibilitäts-Prüfungen.",
    source: `${RV} · vNIC · „Driver“`,
  },
  mac: {
    term: "MAC",
    description: "MAC-Adresse der physischen NIC.",
    source: `${RV} · vNIC · „MAC“`,
  },
};

export const NET_UPLINK_COLUMNS: Record<string, GlossaryEntry> = {
  port: {
    term: "Portgroup",
    description: "Distributed-Port bzw. -Portgruppe, deren Uplink-Redundanz bewertet wird.",
    source: `${RV} · dvPort · „Port“`,
  },
  switchName: {
    term: "Switch",
    description: "Zugehöriger Distributed-vSwitch.",
    source: `${RV} · dvPort · „Switch“`,
  },
  activeUplinks: {
    term: "Active Uplinks",
    description: "Als aktiv konfigurierte Uplinks. Für Redundanz sind mindestens zwei aktive oder ein aktiver plus Standby nötig.",
    source: `${RV} · dvPort · „Active Uplink“`,
  },
  standbyUplinks: {
    term: "Standby Uplinks",
    description: "Als Standby (Failover) konfigurierte Uplinks.",
    source: `${RV} · dvPort · „Standby Uplink“`,
  },
  redundant: {
    term: "Redundant",
    description: "„Ja“ = mehr als ein Pfad vorhanden. „Nein“ (rot) = Single Point of Failure.",
  },
  risk: {
    term: "Risiko",
    description:
      "Abgeleitet: „hoch“ (kein aktiver Uplink), „mittel“ (keine Redundanz) oder „niedrig“. Priorisiert die Nacharbeit an der Uplink-Konfiguration.",
  },
};

export const NET_TEAMING_COLUMNS: Record<string, GlossaryEntry> = {
  name: {
    term: "Port/Switch",
    description: "Portgruppe bzw. Distributed-Port mit auffälliger Teaming-Konfiguration.",
    source: `${RV} · vPort · „Port Group“ / dvPort · „Port“`,
  },
  type: {
    term: "Typ",
    description: "Standard- oder Distributed-Switch.",
  },
  policy: {
    term: "Policy",
    description: "Teaming-/Failover-Policy dieser Portgruppe.",
    source: `${RV} · vPort / dvPort · „Policy“`,
  },
  rollingOrder: {
    term: "Rolling Order",
    description:
      "„Ja“ (gelb) = Failback nach der ursprünglichen Reihenfolge. Kann bei Uplink-Flapping zu unnötigen Umschaltungen führen.",
    source: `${RV} · vPort / dvPort · „Rolling Order“`,
  },
  notifySwitch: {
    term: "Notify Switch",
    description:
      "„Nein“ (gelb) = der physische Switch wird bei Failover nicht per RARP benachrichtigt – kann zu kurzen Verbindungsabbrüchen führen.",
    source: `${RV} · vPort / dvPort · „Notify Switch“`,
  },
  issues: {
    term: "Auffälligkeiten",
    description: "Konkrete Abweichungen dieser Portgruppe von der dominanten Policy des Bestands.",
  },
};

export const NET_SECURITY_SECTIONS: Record<string, GlossaryEntry> = {
  vlanChart: {
    term: "VLAN Verteilung (Top 20)",
    description:
      "Anzahl der Portgruppen je VLAN-ID (Top 20). Hilft, stark genutzte und verwaiste VLANs zu erkennen. Der Tooltip nennt die zugehörigen Portgruppen-Namen.",
  },
  speedChart: {
    term: "Link Speed Verteilung",
    description:
      "Verteilung der physischen NICs nach ausgehandelter Link-Geschwindigkeit. Zeigt Alt-Hardware (1 Gbps) und uneinheitliche Uplink-Bestückung auf einen Blick.",
  },
  policiesTable: {
    term: "Security Policies",
    description:
      "Sicherheits- und Teaming-Einstellungen aller Portgruppen. Nutze die Ansicht, um Abweichungen vom Standard (Promiscuous/MAC/Forged auf „Reject“) aufzuspüren und zu begründen.",
  },
  uplinkTable: {
    term: "Uplink Redundanz Risiken",
    description:
      "Portgruppen ohne ausreichende Uplink-Redundanz, nach Risiko sortiert. „hoch“ (kein aktiver Uplink) zuerst beheben, um Single Points of Failure im Netz zu eliminieren.",
  },
  teamingTable: {
    term: "NIC Teaming Auffälligkeiten",
    description:
      "Portgruppen, die von der dominanten Teaming-Policy abweichen oder Rolling Order/Notify-Switch ungünstig gesetzt haben. Ziel ist eine einheitliche, failover-sichere Konfiguration.",
  },
  driftTable: {
    term: "dVSwitch Config Drift",
    description:
      "Vergleicht jeden Distributed-vSwitch gegen den ersten als Referenz und listet abweichende Kernparameter (MTU, Traffic Shaping, CDP). Grundlage, um vDS-Einstellungen zu vereinheitlichen.",
  },
  vmkTable: {
    term: "VMkernel Adapter",
    description:
      "Alle VMkernel-Interfaces mit IP, MTU und DHCP-Bezug. Prüfe MTU-Konsistenz (Jumbo Frames durchgängig) und statische Adressierung. Ein Klick öffnet die Host-Details.",
  },
  nicTable: {
    term: "Physische NICs",
    description:
      "Physische Uplinks der Hosts mit Speed, Duplex und Treiber. Nützlich, um langsame/halbduplexe Links und Treiber-Ausreißer zu finden. Ein Klick öffnet die Host-Details.",
  },
};

/* ================================================================== */
/*  Tab „Host-Netzwerk“                                                */
/* ================================================================== */

export const NET_HOST_KPI: Record<string, GlossaryEntry> = {
  hosts: {
    term: "Hosts",
    description:
      "Anzahl der Hosts mit erfasster vmnic-Belegung. Grundgesamtheit für den Variantenvergleich.",
    source: `${RV} · vNIC · „Host“`,
  },
  vds: {
    term: "vDS",
    description: "Anzahl der Distributed Virtual Switches im Bestand.",
    source: `${RV} · dvSwitch`,
  },
  vss: {
    term: "vSwitch (Std.)",
    description: "Anzahl der Standard-vSwitches (host-lokal, nicht zentral verwaltet).",
    source: `${RV} · vSwitch`,
  },
  uplinks: {
    term: "Uplinks gesamt",
    description: "Summe der vmnics, die einem Switch zugewiesen sind. Nicht zugewiesene NICs zählen nicht mit.",
    source: `${RV} · vNIC · „Switch“`,
  },
  variants: {
    term: "Konfig-Varianten",
    description:
      "Anzahl unterschiedlicher vmnic-zu-Switch-Belegungen (Fingerprints). Mehr als eine Variante bedeutet uneinheitliche Host-Verkabelung – Standardisierungs-Prüfung.",
  },
  driftHosts: {
    term: "Drift-Hosts",
    description:
      "Hosts, deren Belegung von der Mehrheits-Variante ihres Clusters abweicht. Potenzieller Konfigurations-Drift mit Risiko für vMotion/Failover.",
  },
};

export const NET_VARIANT_COLUMNS: Record<string, GlossaryEntry> = {
  label: {
    term: "Variante",
    description: "Kurzlabel (V1, V2 …) einer eindeutigen vmnic-zu-Switch-Belegung. V1 ist die häufigste.",
  },
  hostCount: {
    term: "Hosts",
    description: "Anzahl der Hosts, die exakt diese Belegung aufweisen.",
  },
  clusters: {
    term: "Cluster",
    description: "Cluster, in denen diese Variante vorkommt.",
    source: `${RV} · vNIC · „Cluster“`,
  },
  nicCount: {
    term: "NICs/Host",
    description: "Anzahl der vmnics pro Host in dieser Variante.",
    source: `${RV} · vNIC`,
  },
  summary: {
    term: "Belegung (vmnic → Switch / Uplink)",
    description: "Lesbare Zusammenfassung, welche vmnic an welchem Switch und Uplink-Port hängt.",
    source: `${RV} · vNIC · „Network Device“ / „Switch“ / „Uplink port“`,
  },
  hosts: {
    term: "Host-Namen",
    description: "Namen der Hosts, die diese Variante nutzen.",
    source: `${RV} · vNIC · „Host“`,
  },
};

export const NET_DRIFT_COLUMNS: Record<string, GlossaryEntry> = {
  host: {
    term: "Host",
    description: "Host, dessen Belegung von der Cluster-Mehrheit abweicht.",
    source: `${RV} · vNIC · „Host“`,
  },
  cluster: {
    term: "Cluster",
    description: "Cluster, dessen Mehrheits-Variante als Soll herangezogen wird.",
    source: `${RV} · vNIC · „Cluster“`,
  },
  isVariant: {
    term: "Ist-Variante",
    description: "Die tatsächlich auf diesem Host vorgefundene, abweichende Variante (rot).",
  },
  expected: {
    term: "Soll (Cluster-Mehrheit)",
    description: "Die im Cluster häufigste Variante – das erwartete Standard-Layout (grün).",
  },
};

export const NET_DVS_COLUMNS: Record<string, GlossaryEntry> = {
  name: {
    term: "vDS",
    description: "Identifier des Distributed-vSwitch (Match-Key zu vNIC, nicht der Anzeigename).",
    source: `${RV} · dvSwitch · „Switch“`,
  },
  version: {
    term: "Version",
    description: "vDS-Version. Ältere Versionen können Features und Kompatibilität einschränken.",
    source: `${RV} · dvSwitch · „Version“`,
  },
  maxMtu: {
    term: "Max MTU",
    description: "Maximale MTU des vDS. Abweichungen von 1500/9000 (gelb) auf Jumbo-Frame-Konsistenz prüfen.",
    source: `${RV} · dvSwitch · „Max MTU“`,
  },
  ports: {
    term: "# Ports",
    description: "Gesamtzahl der Ports des vDS.",
    source: `${RV} · dvSwitch · „# Ports“`,
  },
  members: {
    term: "Host Members",
    description: "Anzahl der Hosts, die diesem vDS angehören.",
    source: `${RV} · dvSwitch · „Host members“`,
  },
  uplinksPerHost: {
    term: "Uplinks/Host",
    description:
      "Aus vNIC abgeleitete Uplink-Anzahl je Host. Ein Bereich (z.B. 2–4) zeigt uneinheitliche Uplink-Bestückung.",
    source: `${RV} · vNIC`,
  },
  consistent: {
    term: "Einheitlich",
    description:
      "„Ja“ = alle Hosts stellen gleich viele Uplinks bereit. „Nein“ (gelb) = uneinheitlich; „—“ wenn keine Uplinks im Snapshot erfasst sind.",
  },
};

export const NET_NICDETAIL_COLUMNS: Record<string, GlossaryEntry> = {
  host: {
    term: "Host",
    description: "ESXi-Host der vmnic.",
    source: `${RV} · vNIC · „Host“`,
  },
  cluster: {
    term: "Cluster",
    description: "Cluster des Hosts.",
    source: `${RV} · vNIC · „Cluster“`,
  },
  device: {
    term: "vmnic",
    description: "Physisches Netzwerkgerät des Hosts (vmnicN).",
    source: `${RV} · vNIC · „Network Device“`,
  },
  speed: {
    term: "Speed (Mbps)",
    description: "Ausgehandelte Link-Geschwindigkeit in Mbit/s.",
    source: `${RV} · vNIC · „Speed“`,
  },
  switchName: {
    term: "Switch",
    description: "Zugewiesener Switch. „nicht zugewiesen“ (gelb) markiert freie/ungenutzte Uplinks.",
    source: `${RV} · vNIC · „Switch“`,
  },
  switchType: {
    term: "Typ",
    description: "Distributed- oder Standard-Switch, abgeleitet aus dem dvSwitch-Inventar.",
  },
  uplink: {
    term: "Uplink-Port",
    description: "Uplink-Port am Switch, dem die vmnic zugeordnet ist.",
    source: `${RV} · vNIC · „Uplink port“`,
  },
};

export const NET_HOST_SECTIONS: Record<string, GlossaryEntry> = {
  driftTable: {
    term: "Konfigurations-Abweichungen",
    description:
      "Hosts, deren vmnic-Belegung von der Mehrheit ihres Clusters abweicht. Standardisierungs-Drift korrigieren, damit vMotion und Failover clusterweit gleich funktionieren. Ein Klick öffnet die Host-Details.",
  },
  variantTable: {
    term: "Konfigurations-Varianten",
    description:
      "Alle eindeutigen vmnic-zu-Switch-Belegungen im Bestand, nach Häufigkeit sortiert. Wenige Varianten = gut standardisiert. Ein Klick öffnet die Detailansicht mit Hosts und Speeds der Variante.",
  },
  dvsTable: {
    term: "vDS-Membership",
    description:
      "Distributed-vSwitches mit Version, MTU, Port- und Host-Anzahl sowie abgeleiteten Uplinks je Host. Prüfe Einheitlichkeit der Uplink-Bestückung und veraltete vDS-Versionen.",
  },
  nicDetailTable: {
    term: "Uplink-Belegung Detail",
    description:
      "vmnic-genaue Sicht über alle Hosts: welcher Uplink an welchem Switch und Port hängt. Nutze die Suche, um einzelne Hosts zu isolieren; ein Klick öffnet die Host-Details.",
  },
};

/* ================================================================== */
/*  Tab „VLAN-Nutzung“ (VlanUsagePanel)                               */
/* ================================================================== */

export const NET_VLANUSAGE_KPI: Record<string, GlossaryEntry> = {
  activeVlans: {
    term: "Aktive VLANs",
    description:
      "Anzahl unterschiedlicher VLAN-IDs, an denen mindestens ein VM-Adapter verbunden ist (Connected = true). Portgruppen ohne VLAN-Match sind nicht mitgezählt.",
    source: `${RV} · vNetwork · „Connected“/„Network“ · join vPort/dvPort`,
  },
  clusters: {
    term: "Cluster",
    description: "Anzahl der Cluster mit verbundenen VM-Adaptern in dieser Ansicht (inkl. Portgruppen ohne VLAN-Match).",
    source: `${RV} · vNetwork · „Cluster“ (Fallback vInfo)`,
  },
  connectedVms: {
    term: "Verbundene VMs",
    description:
      "Anzahl unterschiedlicher VMs mit mindestens einem verbundenen Netzwerkadapter (Connected = true).",
    source: `${RV} · vNetwork · „VM“/„Connected“`,
  },
  unmatched: {
    term: "Ohne Portgruppen-Match",
    description:
      "VMs, deren verbundene Portgruppe in vPort/dvPort keiner VLAN-ID zugeordnet werden konnte (VLAN „?“). Hinweis auf fehlende/uneinheitliche Portgruppen-Daten.",
    source: `${RV} · vNetwork · „Network“ ohne Treffer in vPort/dvPort`,
  },
};

export const NET_VLANUSAGE_COLUMNS: Record<string, GlossaryEntry> = {
  cluster: {
    term: "Cluster",
    description: "Cluster, in dem das VLAN aktiv genutzt wird. „Unbekannt“, wenn keine Cluster-Angabe vorliegt.",
    source: `${RV} · vNetwork · „Cluster“ (Fallback vInfo · „Cluster“)`,
  },
  vlan: {
    term: "VLAN",
    description: "VLAN-ID der genutzten Portgruppe. „0 (untagged)“ = kein Tagging, „?“ = kein Portgruppen-Match.",
    source: `${RV} · vPort · „VLAN“ / dvPort · „VLAN“`,
  },
  portgroups: {
    term: "Portgruppe(n)",
    description: "Alle verbundenen Portgruppen dieses VLANs im Cluster.",
    source: `${RV} · vNetwork · „Network“`,
  },
  vmCount: {
    term: "# VMs",
    description: "Anzahl unterschiedlicher VMs mit verbundenem Adapter in diesem VLAN und Cluster.",
    source: `${RV} · vNetwork · „VM“`,
  },
  hostCount: {
    term: "# Hosts",
    description: "Anzahl unterschiedlicher ESXi-Hosts, auf denen diese VMs laufen.",
    source: `${RV} · vNetwork · „Host“`,
  },
};

export const NET_VLANUSAGE_SECTIONS: Record<string, GlossaryEntry> = {
  table: {
    term: "VLAN-Nutzung pro Cluster",
    description:
      "Welche VLANs innerhalb eines Clusters tatsächlich von VMs genutzt werden (verbundene Adapter). Ergänzt die konfigurationsbasierte VLAN-Verteilung um die reale Nutzung. Join: vNetwork → vPort/dvPort über den Portgruppen-Namen.",
    source: `${RV} · vNetwork · join vPort/dvPort`,
  },
};

/* ================================================================== */
/*  Tab „CDP/Switch-Ports“                                             */
/* ================================================================== */

const CDP = "CDP-CSV";

export const NET_CDP_KPI: Record<string, GlossaryEntry> = {
  hostsWithCdp: {
    term: "Hosts mit CDP-Daten",
    description:
      "ESX-Hosts, für die mindestens ein physischer Adapter CDP-Nachbarschaftsdaten liefert. Grundlage für die Nachvollziehbarkeit der physischen Switch-Anbindung.",
    source: `${CDP} · „VMHost“ / „CDPAvailable“`,
  },
  adapters: {
    term: "Physische Adapter",
    description:
      "Anzahl aller importierten physischen Adapter (vmnic/vusb) im aktuellen Filter — eine Zeile pro Host und Adapter, neuester Import gewinnt.",
    source: `${CDP} · „PhysicalAdapter“`,
  },
  adaptersWithoutCdp: {
    term: "Adapter ohne CDP-Daten",
    description:
      "Adapter, für die keine CDP-Daten vorliegen (z. B. USB-NICs oder Ports an Switches ohne CDP). Für Uplinks an Cisco-Switches ist ein fehlender CDP-Eintrag ein Hinweis auf deaktiviertes CDP oder einen inaktiven Link.",
    source: `${CDP} · „CDPAvailable“`,
  },
  switches: {
    term: "Eindeutige Switches",
    description:
      "Anzahl unterschiedlicher physischer Switches (CDP Device ID), an denen die gefilterten Hosts angeschlossen sind.",
    source: `${CDP} · „CDPDeviceID“`,
  },
};

export const NET_CDP_COLUMNS: Record<string, GlossaryEntry> = {
  host: {
    term: "Host",
    description: "ESX-Host, zu dem der physische Adapter gehört.",
    source: `${CDP} · „VMHost“`,
  },
  cluster: {
    term: "Cluster",
    description: "Cluster-Zuordnung des Hosts laut CDP-Export.",
    source: `${CDP} · „Cluster“`,
  },
  adapter: {
    term: "Adapter",
    description: "Physischer Netzwerkadapter des Hosts (vmnic/vusb).",
    source: `${CDP} · „PhysicalAdapter“`,
  },
  linkStatus: {
    term: "Link",
    description: "Link-Status des Adapters zum Zeitpunkt des Exports (Up/Down).",
    source: `${CDP} · „LinkStatus“`,
  },
  cdpDeviceId: {
    term: "Switch",
    description: "CDP Device ID des angeschlossenen Switches. Tooltip zeigt die Software-Version.",
    source: `${CDP} · „CDPDeviceID“`,
  },
  cdpPortId: {
    term: "Port",
    description: "Switch-Port, an dem der Adapter angeschlossen ist.",
    source: `${CDP} · „CDPPortID“`,
  },
  nativeVlan: {
    term: "Native VLAN",
    description: "Native (untagged) VLAN des Switch-Ports laut CDP.",
    source: `${CDP} · „CDPNativeVLAN“`,
  },
  mtu: {
    term: "MTU",
    description: "MTU des Switch-Ports laut CDP. Abweichungen innerhalb eines Clusters deuten auf inkonsistente Jumbo-Frame-Konfiguration hin.",
    source: `${CDP} · „CDPMTU“`,
  },
  cdpPlatform: {
    term: "Plattform",
    description: "Hardware-Plattform des Switches (z. B. Nexus-Modell).",
    source: `${CDP} · „CDPHardwarePlatform“`,
  },
  cdpMgmtIp: {
    term: "Mgmt-IP",
    description: "Management-IP-Adresse des Switches laut CDP.",
    source: `${CDP} · „CDPManagementIP“`,
  },
  mac: {
    term: "MAC",
    description: "MAC-Adresse des physischen Adapters.",
    source: `${CDP} · „MACAddress“`,
  },
};

export const NET_CDP_SECTIONS: Record<string, GlossaryEntry> = {
  table: {
    term: "Switch-Ports pro Adapter",
    description:
      "Eine Zeile pro Host und physischem Adapter mit der per CDP ermittelten Switch-Anbindung. Bei mehreren Importen gewinnt je Host+Adapter der neueste Stand.",
    source: `${CDP} · neuester Import je Host+Adapter`,
  },
};
