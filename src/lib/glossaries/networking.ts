import type { GlossaryEntry } from "@/lib/glossary";

/**
 * Glossar für die Seite „Netzwerk“ mit den beiden Tabs
 * „Security & Policies“ (NetworkSecurityPanel) und „Host-Netzwerk“ (HostNetworkPanel).
 *
 * Zielgruppe: VMware-Administrator:innen.
 */

const RV = "RVTools";

export const NET_NETWORK_TABS: Record<string, GlossaryEntry> = {
  security: {
    term: "Security & Policies",
    description:
      "Prüft Portgruppen, VMkernel-Adapter und Uplinks auf Sicherheitsrichtlinien, Netzwerk-Redundanz und Konfigurations-Drift.",
    source: "RVTools · vPort · dvPort · vSC_VMK · vNIC",
  },
  host: {
    term: "Host-Netzwerk",
    description:
      "Vergleicht die physische Netzwerkanbindung der ESXi-Hosts und zeigt unterschiedliche vmnic-, Uplink- und Switch-Belegungen.",
    source: "RVTools · vNIC · dvSwitch · vSwitch",
  },
  vlan: {
    term: "VLAN-Nutzung",
    description:
      "Zeigt, welche VLANs auf Portgruppen verwendet werden, wie viele VMs daran hängen und wo ungenutzte oder auffällige Segmente bestehen.",
    source: "RVTools · vPort · dvPort · vInfo",
  },
  cdp: {
    term: "CDP/Switch-Ports",
    description:
      "Verknüpft die von ESXi gemeldeten CDP-Nachbarn mit der physischen Switch-Port-Sicht und erleichtert die Nachverfolgung von Uplinks.",
    source: "RVTools · vHost · CDP-CSV",
  },
  eramonIface: {
    term: "Switch-Ports (Eramon)",
    description:
      "Port-Inventar der Switches aus Eramon: eine Zeile pro Switch-Port mit Beschreibung, Bandbreite und Aktiv/Down-Status.",
    source: "Eramon · Device-Interface-Daten",
  },
  eramonL2: {
    term: "MAC-Tabelle (Eramon)",
    description:
      "L2-Sicht aus Eramon: welche IP/MAC/DNS-Name in welchem VLAN an welchem Switch-Port gesehen wurde.",
    source: "Eramon · L2-Daten",
  },
  ipam: {
    term: "IPAM",
    description:
      "IP-Adressinventar aus dem Infoblox-Export: Belegungsstatus, DNS-Namen, Discovery-Daten und technische Merkmale je Adresse.",
    source: "IPAM-CSV (Infoblox-Export)",
  },
  ciscoSwitch: {
    term: "Cisco Switch",
    description:
      "Interface-Inventar aus Cisco-Switch-Ausgaben: Port-Status, Beschreibung, Geschwindigkeit, Duplex und Transceiver je Switch-Port.",
    source: "Cisco-Switch-TXT",
  },
  audit: {
    term: "Kontrolle",
    description:
      "Gleicht Cisco-Switch-Ports gegen CDP, RVTools, Tech-Info und IPAM ab. Zeigt bestätigte Zuordnungen sowie fehlende oder widersprüchliche Angaben.",
    source: "Cisco-Switch-TXT · CDP-CSV · RVTools · Tech-Info · IPAM",
  },
};

export const NET_IPAM_KPI: Record<string, GlossaryEntry> = {
  total: {
    term: "IP-Adressen gesamt",
    description: "Alle aus dem aktuellen Infoblox-Export übernommenen IP-Adressen im aktiven Datenbestand.",
    source: "IPAM-CSV (Infoblox-Export)",
  },
  used: {
    term: "Belegte IP-Adressen",
    description: "IP-Adressen mit dem Status „Used“. Sie sind im IPAM als belegt geführt.",
    source: "IPAM-CSV · Status",
  },
  unused: {
    term: "Freie IP-Adressen",
    description: "IP-Adressen mit dem Status „Unused“. Prüfe vor einer Wiederverwendung den Discovery- und DNS-Stand.",
    source: "IPAM-CSV · Status",
  },
  withDnsName: {
    term: "IP-Adressen mit DNS-Name",
    description: "Adressen, für die im IPAM ein Name bzw. DNS-Bezug gepflegt ist. Fehlende Namen erschweren die Betriebszuordnung.",
    source: "IPAM-CSV · Name",
  },
  withDiscovery: {
    term: "IP-Adressen mit Discovery-Daten",
    description: "Adressen mit mindestens einem erfassten Discovery-Zeitpunkt. Sie wurden durch die IPAM-Erkennung beobachtet.",
    source: "IPAM-CSV · First/Last Discovered",
  },
};

export const NET_AUDIT_KPI: Record<string, GlossaryEntry> = {
  totalPorts: {
    term: "Ports gesamt",
    description: "Alle Switch-Ports aus Cisco-TXT und Eramon-Inventar, die in den Abgleich einfließen.",
    source: "Cisco-Switch-TXT · Eramon",
  },
  cdpConfirmed: {
    term: "CDP-bestätigt",
    description: "Switch-Ports, deren Gegenstelle über CDP eindeutig einem ESXi-Host zugeordnet wurde.",
    source: "Cisco-Switch-TXT · CDP-CSV",
  },
  documentedOnly: {
    term: "Nur dokumentiert",
    description: "Zuordnungen, die sich aus der Port-Beschriftung oder Dokumentation ergeben, aber nicht durch CDP bestätigt sind.",
    source: "Cisco-Switch-TXT · RVTools · Tech-Info",
  },
  unknown: {
    term: "Unbekannt",
    description: "Ports ohne belastbare Zuordnung zu einem System. Prüfe Beschreibung, CDP und die physischen Anschlüsse.",
    source: "Cisco-Switch-TXT · CDP-CSV · RVTools",
  },
  statusConflicts: {
    term: "Status-Konflikte",
    description: "Ports mit widersprüchlichen Statusinformationen zwischen Switch-Daten und den verknüpften Quellen.",
    source: "Cisco-Switch-TXT · CDP-CSV · RVTools",
  },
  labelConflicts: {
    term: "Beschriftungs-Konflikte",
    description: "Ports, deren Beschriftung nicht zur ermittelten Gegenstelle passt. Das ist ein Hinweis auf veraltete oder falsche Dokumentation.",
    source: "Cisco-Switch-TXT · CDP-CSV · RVTools · Tech-Info",
  },
  onlyEramon: {
    term: "Nur in Eramon",
    description: "Ports, die ausschließlich im Eramon-Inventar vorkommen und keinen Cisco-TXT-Eintrag haben.",
    source: "Eramon",
  },
  sourceConflicts: {
    term: "Quellen-Konflikte",
    description: "Ports, bei denen sich Cisco- und Eramon-Sicht in Beschreibung oder Status widersprechen.",
    source: "Cisco-Switch-TXT · Eramon",
  },
};

export const NET_SWITCH_KPI: Record<string, GlossaryEntry> = {
  switches: {
    term: "Switches",
    description: "Anzahl unterschiedlicher Switches im importierten Cisco-Interface-Inventar.",
    source: "Cisco-Switch-TXT",
  },
  interfaces: {
    term: "Interfaces gesamt",
    description: "Alle erfassten Cisco-Switch-Interfaces über die importierten Switches.",
    source: "Cisco-Switch-TXT",
  },
  connected: {
    term: "Verbundene Interfaces",
    description: "Interfaces mit dem Status „connected“. Sie haben aktuell einen aktiven Link.",
    source: "Cisco-Switch-TXT · Status",
  },
  notConnected: {
    term: "Interfaces ohne Link",
    description: "Interfaces ohne aktiven Link. Das kann erwartbar sein oder auf einen unterbrochenen Uplink hindeuten.",
    source: "Cisco-Switch-TXT · Status",
  },
};

export const NET_SWITCH_COLUMNS: Record<string, GlossaryEntry> = {
  hostname: { term: "Switch-Hostname", description: "Name des Cisco-Switches, von dem das Interface stammt.", source: "Cisco-Switch-TXT · Hostname" },
  interface: { term: "Interface", description: "Physische Schnittstelle am Switch, zum Beispiel Eth1/1.", source: "Cisco-Switch-TXT · Interface" },
  description: { term: "Port-Beschreibung", description: "Am Switch gepflegte Schnittstellenbeschreibung; häufig der dokumentierte Gegenstellen- oder Zweckhinweis.", source: "Cisco-Switch-TXT · Description" },
  status: { term: "Port-Status", description: "Vom Switch gemeldeter Link-Status des Interfaces, zum Beispiel connected oder notconnect.", source: "Cisco-Switch-TXT · Status" },
  mode: { term: "Switchport-Modus", description: "Konfigurationsmodus des Ports, etwa access, trunk oder routed.", source: "Cisco-Switch-TXT · Mode" },
  duplex: { term: "Duplex", description: "Ausgehandelter Duplex-Modus des Links. Full Duplex ist der erwartete Betriebszustand.", source: "Cisco-Switch-TXT · Duplex" },
  speed: { term: "Link-Geschwindigkeit", description: "Vom Switch erkannte Übertragungsrate des Interfaces, zum Beispiel 10G oder 25G.", source: "Cisco-Switch-TXT · Speed" },
  transceiver: { term: "Transceiver", description: "Erkannter Optik- oder Kabeltyp des Interfaces.", source: "Cisco-Switch-TXT · Transceiver" },
};

export const NET_IPAM_COLUMNS: Record<string, GlossaryEntry> = {
  ipAddress: { term: "IP-Adresse", description: "Eindeutige Adresse aus dem IPAM-Export.", source: "IPAM-CSV · IP Address" },
  name: { term: "DNS-Name", description: "Im IPAM gepflegter Host- oder DNS-Name der Adresse.", source: "IPAM-CSV · Name" },
  status: { term: "IPAM-Status", description: "Belegungsstatus der Adresse, etwa Used oder Unused.", source: "IPAM-CSV · Status" },
  type: { term: "Adress-Typ", description: "Vom IPAM gelieferte Klassifizierung der Adresse.", source: "IPAM-CSV · Type" },
  usage: { term: "Nutzung", description: "Im IPAM hinterlegte Nutzungs- oder Zweckangabe der Adresse.", source: "IPAM-CSV · Usage" },
  firstDiscovered: { term: "Erstmals erkannt", description: "Zeitpunkt, zu dem die Adresse erstmals durch die IPAM-Erkennung beobachtet wurde.", source: "IPAM-CSV · First Discovered" },
  lastDiscovered: { term: "Zuletzt erkannt", description: "Letzter Erkennungszeitpunkt der Adresse im IPAM.", source: "IPAM-CSV · Last Discovered" },
  comment: { term: "Kommentar", description: "Freitext-Kommentar aus dem IPAM.", source: "IPAM-CSV · Comment" },
  site: { term: "Standort", description: "Dem IPAM-Eintrag zugeordneter Standort.", source: "IPAM-CSV · Site" },
  macAddress: { term: "MAC-Adresse", description: "Zu der IP-Adresse im IPAM bekannte MAC-Adresse.", source: "IPAM-CSV · MAC Address" },
  os: { term: "Betriebssystem", description: "Vom IPAM erkannte oder gepflegte Betriebssysteminformation.", source: "IPAM-CSV · OS" },
  netBiosName: { term: "NetBIOS-Name", description: "Im IPAM erkannter NetBIOS-Name.", source: "IPAM-CSV · NetBIOS Name" },
  deviceTypes: { term: "Gerätetypen", description: "Vom IPAM erkannte Geräte- oder Klassifizierungstypen.", source: "IPAM-CSV · Device Type(s)" },
  openPorts: { term: "Offene Ports", description: "Im IPAM erfasste offene Netzwerkports der Adresse.", source: "IPAM-CSV · Open Port(s)" },
  fingerprint: { term: "Fingerprint", description: "Vom IPAM erkannter technischer Fingerprint des Geräts oder Dienstes.", source: "IPAM-CSV · Fingerprint" },
};

export const NET_AUDIT_COLUMNS: Record<string, GlossaryEntry> = {
  switchHostname: { term: "Switch", description: "Cisco-Switch, auf dem das abgeglichene Interface liegt.", source: "Cisco-Switch-TXT · Hostname" },
  interface: { term: "Interface", description: "Switch-Port, der mit CDP, RVTools, Tech-Info und IPAM abgeglichen wird.", source: "Cisco-Switch-TXT · Interface" },
  description: { term: "Port-Beschreibung", description: "Dokumentierter Freitext am Switch-Port. Er wird für die Zuordnung zur Gegenstelle herangezogen.", source: "Cisco-Switch-TXT · Description" },
  status: { term: "Port-Status", description: "Vom Switch gemeldeter Link-Status des Interfaces.", source: "Cisco-Switch-TXT · Status" },
  matchStatus: { term: "Match-Status", description: "Qualität der ermittelten Zuordnung: CDP-bestätigt, RVTools-Treffer, nur dokumentiert oder unbekannt.", source: "Abgleich aus Cisco-Switch-TXT · CDP-CSV · RVTools · Tech-Info" },
  matchedHost: { term: "Vermuteter ESXi-Host", description: "Host, der dem Switch-Port durch CDP oder die Dokumentation zugeordnet wurde.", source: "CDP-CSV · RVTools · Tech-Info" },
  finding: { term: "Auffälligkeit", description: "Erkannte Abweichung oder fehlende Zuordnung, die geprüft werden sollte.", source: "Berechnet aus dem Datenabgleich" },
  bandwidth: { term: "Bandbreite", description: "Vom Eramon-Switch gemeldete Port-Bandbreite.", source: "Eramon · bandbreite" },
  source: { term: "Quelle", description: "Datenquelle(n) des Ports: Cisco-TXT, Eramon oder beide.", source: "Cisco-Switch-TXT · Eramon" },
};

export const NET_HOST_QUALITY_RVTOOLS_COLUMNS: Record<string, GlossaryEntry> = {
  host: { term: "ESXi-Host aus RVTools", description: "ESXi-Host aus dem RVTools-Inventar; Ausgangspunkt für den Abgleich.", source: "RVTools · vHost · Host" },
  cluster: { term: "Cluster", description: "Cluster-Zuordnung des ESXi-Hosts.", source: "RVTools · vHost · Cluster" },
  version: { term: "ESXi-Version", description: "Von RVTools gemeldete ESXi-Version des Hosts.", source: "RVTools · vHost · ESX Version" },
  techInfoPresent: { term: "Tech-Info vorhanden", description: "Zeigt, ob für den RVTools-Host ein passender Tech-Info-Eintrag gefunden wurde.", source: "Abgleich RVTools · Tech-Info" },
  techInfoServerType: { term: "Servertyp", description: "Servertyp aus dem passenden Tech-Info-Eintrag.", source: "Tech-Info · Servertyp" },
  techInfoDepartment: { term: "Abteilung", description: "Zuständige Abteilung aus Tech-Info.", source: "Tech-Info · Abteilung" },
  ipamPresent: { term: "IPAM vorhanden", description: "Zeigt, ob für den Host ein passender IPAM-Eintrag gefunden wurde.", source: "Abgleich RVTools · IPAM" },
  ipamAddresses: { term: "IP-Adressen", description: "Passende IP-Adressen aus dem IPAM.", source: "IPAM-CSV · IP Address" },
  ipamNetworks: { term: "IPAM-Netze", description: "Aus den gefundenen IP-Adressen abgeleitete IPv4-/24- bzw. IPv6-/64-Netze.", source: "Berechnet aus IPAM-CSV" },
  finding: { term: "Datenlücke", description: "Fehlende oder widersprüchliche Zuordnung zwischen RVTools, Tech-Info und IPAM.", source: "Berechnet aus dem Datenabgleich" },
};

export const NET_HOST_QUALITY_TECHINFO_COLUMNS: Record<string, GlossaryEntry> = {
  techInfoName: { term: "Objekt aus Tech-Info", description: "Name des technischen Objekts aus der lokalen Tech-Info-Dokumentation.", source: "Tech-Info · VM/Servername" },
  serverType: { term: "Servertyp", description: "In Tech-Info gepflegte Systemklassifizierung.", source: "Tech-Info · Servertyp" },
  department: { term: "Abteilung", description: "In Tech-Info hinterlegte zuständige Abteilung.", source: "Tech-Info · Abteilung" },
  maintenanceWindow: { term: "Wartungsfenster", description: "In Tech-Info gepflegter Wartungsfensterwert des Objekts.", source: "Tech-Info · Wartungsfenster" },
  rvtoolsPresent: { term: "RVTools vorhanden", description: "Zeigt, ob ein passender ESXi-Host im RVTools-Inventar gefunden wurde.", source: "Abgleich Tech-Info · RVTools" },
  rvtoolsHost: { term: "ESXi-Host aus RVTools", description: "Passender ESXi-Host aus dem RVTools-Inventar.", source: "RVTools · vHost · Host" },
  rvtoolsCluster: { term: "Cluster", description: "Cluster des passenden RVTools-Hosts.", source: "RVTools · vHost · Cluster" },
  ipamPresent: { term: "IPAM vorhanden", description: "Zeigt, ob für das Tech-Info-Objekt ein passender IPAM-Eintrag gefunden wurde.", source: "Abgleich Tech-Info · IPAM" },
  ipamAddresses: { term: "IP-Adressen", description: "Passende IP-Adressen aus dem IPAM.", source: "IPAM-CSV · IP Address" },
  ipamNetworks: { term: "IPAM-Netze", description: "Aus den gefundenen IP-Adressen abgeleitete IPv4-/24- bzw. IPv6-/64-Netze.", source: "Berechnet aus IPAM-CSV" },
  finding: { term: "Datenlücke", description: "Fehlende oder widersprüchliche Zuordnung zwischen Tech-Info, RVTools und IPAM.", source: "Berechnet aus dem Datenabgleich" },
};

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

export const NET_MAC_CDP_COLUMNS: Record<string, GlossaryEntry> = {
  host: { term: "ESXi-Host", description: "ESX-Host, dessen physischer Adapter geprüft wird.", source: `${CDP} · „VMHost“` },
  adapter: { term: "vmnic", description: "Physischer Netzwerkadapter des Hosts.", source: `${CDP} · „PhysicalAdapter“` },
  mac: { term: "MAC", description: "MAC-Adresse des Adapters (Roh-Anzeige aus CDP).", source: `${CDP} · „MACAddress“` },
  inL2: { term: "In L2?", description: "Ob die MAC in der Eramon-L2-Tabelle gelernt wurde.", source: `Abgleich ${CDP} ↔ ${ERAMON}` },
  l2Location: { term: "Switch/Port (L2)", description: "Switch und Interface, an dem die MAC laut L2-Tabelle gelernt wurde.", source: `${ERAMON} · „name“ / „interface“` },
  vlan: { term: "VLAN", description: "VLAN-ID, in dem die MAC gelernt wurde.", source: `${ERAMON} · „vlan“` },
  learnedIp: { term: "Gelernte IP", description: "Vom Switch für die MAC beobachtete IP-Adresse.", source: `${ERAMON} · „ip“` },
  dnsName: { term: "DNS-Name", description: "Vom Switch beobachteter DNS-Name.", source: `${ERAMON} · „dnsname“` },
  finding: { term: "Auffälligkeit", description: "Fehlende MAC in der L2-Tabelle oder Topologie-Abweichung gegenüber CDP.", source: "Berechnet aus dem Datenabgleich" },
};

export const NET_MAC_DISCOVERY_COLUMNS: Record<string, GlossaryEntry> = {
  l2Location: { term: "Switch/Port", description: "Switch und Interface, an dem der Eintrag gelernt wurde.", source: `${ERAMON} · „name“ / „interface“` },
  vlan: { term: "VLAN", description: "VLAN-ID des Eintrags.", source: `${ERAMON} · „vlan“` },
  mac: { term: "MAC", description: "Am Port gelernte MAC-Adresse.", source: `${ERAMON} · „mac“` },
  learnedIp: { term: "Gelernte IP", description: "Vom Switch beobachtete IP-Adresse.", source: `${ERAMON} · „ip“` },
  dnsName: { term: "DNS-Name", description: "Vom Switch beobachteter DNS-Name.", source: `${ERAMON} · „dnsname“` },
  classification: { term: "Klassifikation", description: "ESXi (CDP), IPAM-bekannt oder unbekannt/fremd.", source: `Abgleich ${ERAMON} ↔ ${CDP} ↔ IPAM` },
  esxiHost: { term: "ESXi-Host", description: "Zugeordneter ESX-Host, falls die MAC ein bekannter vmnic ist.", source: `${CDP} · „VMHost“` },
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

const ERAMON = "Eramon";

export const NET_ERAMON_IFACE_KPI: Record<string, GlossaryEntry> = {
  switches: {
    term: "Switches",
    description: "Anzahl unterschiedlicher Switches (device_name) im Import.",
    source: `${ERAMON} · „device_name“`,
  },
  ports: {
    term: "Ports gesamt",
    description: "Anzahl aller Switch-Ports im aktuellen Filter — eine Zeile pro Switch+Port, neuester Import gewinnt.",
    source: `${ERAMON} · „port_name“`,
  },
  active: {
    term: "Aktive Ports",
    description: "Ports mit Status 1 (aktiv/up).",
    source: `${ERAMON} · „port_status“`,
  },
  down: {
    term: "Down-Ports",
    description: "Ports mit Status 2 (down).",
    source: `${ERAMON} · „port_status“`,
  },
};

export const NET_ERAMON_IFACE_COLUMNS: Record<string, GlossaryEntry> = {
  deviceName: { term: "Switch", description: "Switch-Hostname laut Eramon.", source: `${ERAMON} · „device_name“` },
  portName: { term: "Port", description: "Interface-Bezeichnung (physischer Port, Port-Channel, VLAN-SVI oder mgmt).", source: `${ERAMON} · „port_name“` },
  portDesc: { term: "Beschreibung", description: "Freie Port-Beschreibung (Gegenstelle, VPC, Tags).", source: `${ERAMON} · „port_desc“` },
  bandbreite: { term: "Bandbreite", description: "Port-Bandbreite, umgerechnet in Gbit/s bzw. Mbit/s.", source: `${ERAMON} · „bandbreite“` },
  status: { term: "Status", description: "Port-Status: 1 = aktiv, 2 = down.", source: `${ERAMON} · „port_status“` },
};

export const NET_ERAMON_L2_KPI: Record<string, GlossaryEntry> = {
  entries: {
    term: "Einträge gesamt",
    description: "Anzahl aller L2-Einträge im aktuellen Filter — eine Zeile pro Switch+Interface+MAC+VLAN.",
    source: `${ERAMON} · neuester Import je Eintrag`,
  },
  macs: {
    term: "Eindeutige MACs",
    description: "Anzahl unterschiedlicher MAC-Adressen.",
    source: `${ERAMON} · „mac“`,
  },
  ips: {
    term: "Eindeutige IPs",
    description: "Anzahl unterschiedlicher IP-Adressen (nicht-leer).",
    source: `${ERAMON} · „ip“`,
  },
  vlans: {
    term: "VLANs",
    description: "Anzahl unterschiedlicher VLAN-IDs (nicht-leer).",
    source: `${ERAMON} · „vlan“`,
  },
};

export const NET_ERAMON_L2_COLUMNS: Record<string, GlossaryEntry> = {
  ip: { term: "IP", description: "IP-Adresse des am Port gesehenen Endgeräts.", source: `${ERAMON} · „ip“` },
  dnsName: { term: "DNS-Name", description: "DNS-Name des Endgeräts.", source: `${ERAMON} · „dnsname“` },
  mac: { term: "MAC", description: "MAC-Adresse des Endgeräts.", source: `${ERAMON} · „mac“` },
  switchName: { term: "Switch", description: "Switch, an dem die MAC gesehen wurde.", source: `${ERAMON} · „name“` },
  interface: { term: "Interface", description: "Switch-Port, an dem die MAC gesehen wurde.", source: `${ERAMON} · „interface“` },
  vlan: { term: "VLAN", description: "VLAN-ID des Eintrags.", source: `${ERAMON} · „vlan“` },
};
