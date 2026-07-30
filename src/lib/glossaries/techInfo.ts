import type { GlossaryEntry } from "@/lib/glossary";

/**
 * Glossar für die Seite „Tech-Info“. Die Daten stammen aus ergänzenden
 * Betriebs-/CMDB-Importen (nicht aus RVTools) und werden über den VM- bzw.
 * Client-Namen mit den RVTools-Systemen verknüpft. Zielgruppe: VMware-Admins.
 */

const TECH = "Tech-Info";

/* ------------------------------------------------------------------ */
/*  KPIs                                                              */
/* ------------------------------------------------------------------ */
export const TECHINFO_KPI: Record<string, GlossaryEntry> = {
  vmTotal: {
    term: "Aktive VMs gesamt",
    description:
      "Anzahl der VMs im aktuellen Filter-Scope. Bezugsgröße für die Abdeckung mit Tech-Info-Daten.",
    source: "RVTools · vInfo",
  },
  vmWithTechInfo: {
    term: "VMs mit Tech-Info",
    description:
      "VMs, denen über den Namen ein Tech-Info-/CMDB-Datensatz zugeordnet werden konnte (z.B. Systemverantwortliche, Wartungsfenster, Backup-Kennzeichen).",
    source: TECH,
  },
  vmWithoutTechInfo: {
    term: "VMs ohne Zuordnung",
    description:
      "VMs ohne passenden Tech-Info-Datensatz. Kandidaten für die Pflege: fehlende Zuordnungen bedeuten Lücken bei Verantwortlichkeit, Wartungsfenster und Backup-Nachweis.",
    source: TECH,
  },
  sysvDeputyConflict: {
    term: "SysV = SysVStv",
    description:
      "Anzahl der Systeme, bei denen Systemverantwortliche:r und Stellvertretung identisch sind. Das weist auf eine fehlende echte Vertretung hin.",
    source: TECH,
  },
  uniqueSysv: {
    term: "Eindeutige SysV",
    description:
      "Anzahl der unterschiedlichen Systemverantwortlichen in den zugeordneten Tech-Info-Servern. Schreibweisen werden für die Zählung ohne Beachtung von Groß-/Kleinschreibung und Mehrfachleerzeichen zusammengeführt.",
    source: TECH,
  },
  systemsPerSysv: {
    term: "Systeme/SysV",
    description:
      "Durchschnittliche Anzahl der Tech-Info-Server mit eingetragener Verantwortlichkeit je eindeutiger Systemverantwortlicher. Nicht zugeordnete Systeme fließen nicht in den Durchschnitt ein.",
    source: TECH,
  },
};

/* ------------------------------------------------------------------ */
/*  Tabelle „VM Tech-Info Server“                                     */
/* ------------------------------------------------------------------ */
export const TECHINFO_SERVER_COLUMNS: Record<string, GlossaryEntry> = {
  vmName: {
    term: "VM",
    description: "VM-Name aus RVTools – der Schlüssel, über den die Tech-Info verknüpft wird. Klick öffnet die VM-Details.",
    source: `RVTools · vInfo · „VM“`,
  },
  serverType: {
    term: "Servertyp",
    description: "Klassifizierung des Servers laut Tech-Info (z.B. Applikations-, DB- oder Terminalserver).",
    source: TECH,
  },
  maintenanceWindow: {
    term: "Wartungsfenster",
    description: "Vereinbartes Zeitfenster für Wartung/Neustarts. Grundlage, um Patches und Reboots konfliktfrei zu planen.",
    source: TECH,
  },
  operatingSystem: {
    term: "Betriebssystem",
    description: "In der Tech-Info hinterlegtes Gast-OS. Kann als fachliche Ergänzung zu den RVTools-OS-Angaben dienen.",
    source: TECH,
  },
  comment: {
    term: "Kommentar",
    description: "Freitext-Notiz zur VM aus der Tech-Info/CMDB.",
    source: TECH,
  },
  sysv: {
    term: "SysV",
    description: "Systemverantwortliche:r – primär zuständige Person für Betrieb und Änderungen an der VM.",
    source: TECH,
  },
  sysvDepartment: {
    term: "SysV Abteilung",
    description: "Organisatorische Abteilung der/des Systemverantwortlichen.",
    source: TECH,
  },
  sysvDeputy: {
    term: "SysVStv",
    description: "Stellvertretung der/des Systemverantwortlichen – Ansprechpartner bei Abwesenheit.",
    source: TECH,
  },
  sysvDeputyConflict: {
    term: "SysV = SysVStv",
    description:
      "Prüft, ob Verantwortliche:r und Stellvertretung identisch sind. „Verstoß“ heißt: keine echte Vertretung hinterlegt – organisatorisches Risiko bei Ausfall.",
    source: TECH,
  },
  sysvDeputyDepartment: {
    term: "SysVStv Abteilung",
    description: "Abteilung der Stellvertretung.",
    source: TECH,
  },
  clusterFromTechInfo: {
    term: "Cluster",
    description: "Cluster-Zuordnung laut Tech-Info. Abweichungen zur RVTools-Zuordnung können auf veraltete CMDB-Daten hinweisen.",
    source: TECH,
  },
  cvBackup: {
    term: "CV-Backup",
    description: "Kennzeichen, ob die VM per CommVault gesichert wird. „Nein“ wird rot markiert, wenn AZ „PROD“ oder BZ „P“ lautet – produktive Systeme ohne Backup sind ein Risiko.",
    source: TECH,
  },
  bz: {
    term: "BZ",
    description: "Betriebszeit-/Kennzeichen der VM aus der Tech-Info.",
    source: TECH,
  },
  az: {
    term: "AZ",
    description: "Zusätzliches Kennzeichen der VM aus der Tech-Info.",
    source: TECH,
  },
};

/* ------------------------------------------------------------------ */
/*  Tabelle „VM Tech-Info Clients“                                    */
/* ------------------------------------------------------------------ */
export const TECHINFO_CLIENT_COLUMNS: Record<string, GlossaryEntry> = {
  clientName: {
    term: "Name",
    description: "Name des Clients/Endgeräts aus der Tech-Info-Client-Datei.",
    source: TECH,
  },
  blz: {
    term: "BLZ",
    description: "Bankleitzahl bzw. Mandanten-/Standortkennung des Clients.",
    source: TECH,
  },
  standort: {
    term: "Standort",
    description: "Physischer Standort des Clients.",
    source: TECH,
  },
  ip: {
    term: "IP",
    description: "IP-Adresse des Clients laut Tech-Info.",
    source: TECH,
  },
  macAddress: {
    term: "MAC Adresse",
    description: "MAC-Adresse der Netzwerkkarte des Clients.",
    source: TECH,
  },
  poolName: {
    term: "Poolname",
    description: "Zugehöriger Pool (z.B. VDI-/Desktop-Pool) des Clients.",
    source: TECH,
  },
  modifiedBy: {
    term: "Geändert von",
    description: "Person, die den Datensatz zuletzt geändert hat.",
    source: TECH,
  },
  modifiedAt: {
    term: "Änderungsdatum",
    description: "Zeitpunkt der letzten Änderung – Indikator für die Aktualität des Datensatzes.",
    source: TECH,
  },
  createdBy: {
    term: "Erstellt von",
    description: "Person, die den Datensatz angelegt hat.",
    source: TECH,
  },
  createdAt: {
    term: "Erstellungsdatum",
    description: "Zeitpunkt der Anlage des Datensatzes.",
    source: TECH,
  },
  user: {
    term: "User",
    description: "Dem Client zugeordnete:r Benutzer:in.",
    source: TECH,
  },
  hardware: {
    term: "Hardware",
    description: "Hardware-Modell/-Typ des Clients.",
    source: TECH,
  },
  os: {
    term: "OS",
    description: "Betriebssystem des Clients laut Tech-Info.",
    source: TECH,
  },
  cluster: {
    term: "Cluster",
    description: "Zugehöriger Cluster des Clients (z.B. VDI-Cluster).",
    source: TECH,
  },
  vcenter: {
    term: "vCenter",
    description: "vCenter, unter dem der Client verwaltet wird.",
    source: TECH,
  },
  site: {
    term: "Site",
    description: "Site-/Rechenzentrumszuordnung des Clients.",
    source: TECH,
  },
  insider: {
    term: "Insider",
    description: "Insider-Kennzeichen des Clients aus der Tech-Info.",
    source: TECH,
  },
  hwChanges: {
    term: "HW Änderungen",
    description: "Dokumentierte Hardware-Änderungen am Client.",
    source: TECH,
  },
  monitoring: {
    term: "Monitoring",
    description: "Monitoring-Status/-Zuordnung des Clients. „Nein“/leer ist ein Prüfpunkt für die Überwachungsabdeckung.",
    source: TECH,
  },
  domain: {
    term: "Domäne",
    description: "Active-Directory-/Netzwerkdomäne des Clients.",
    source: TECH,
  },
};

/* ------------------------------------------------------------------ */
/*  Abschnitts-Überschriften (Sinn + Arbeitsweise)                    */
/* ------------------------------------------------------------------ */
export const TECHINFO_SECTIONS: Record<string, GlossaryEntry> = {
  serverTable: {
    term: "VM Tech-Info Server",
    description:
      "Verknüpft jede VM mit ihren organisatorischen Betriebsdaten (Verantwortliche, Wartungsfenster, Backup, Kommentar). Nutze die Ansicht, um Zuständigkeiten und Wartungsfenster vor Änderungen zu klären und Lücken – etwa fehlende SysV-Vertretung oder Backup-Kennzeichen – aufzudecken. Ein Klick öffnet die VM-Details.",
  },
  clientTable: {
    term: "VM Tech-Info Clients",
    description:
      "Inventar der Clients/Endgeräte aus der Tech-Info-Client-Datei (Standort, Pool, User, Hardware, Domäne). Dient als CMDB-Sicht auf die Client-Landschaft; suche nach Standort, Pool oder User und öffne per Klick die Client-Details.",
  },
};

/* ------------------------------------------------------------------ */
/*  Tab „Organisation“                                                */
/* ------------------------------------------------------------------ */
export const TECHINFO_ORG_KPI: Record<string, GlossaryEntry> = {
  assignedVms: {
    term: "Zugeordnete Server-VMs",
    description:
      "Server-VMs, die im gewählten Rollenmodus (primär/Stellvertretung/beide) einer auswertbaren Bereichs-/Abteilungszuordnung zugeordnet werden konnten.",
    source: TECH,
  },
  orgCount: {
    term: "Organisationen",
    description: "Anzahl der unterschiedlichen Organisationen, die aus dem Präfix der SysV-Abteilung vor dem Schrägstrich abgeleitet wurden.",
    source: TECH,
  },
  bereichCount: {
    term: "Bereiche",
    description: "Anzahl der unterschiedlichen Bereiche, die aus der SysV-Abteilung abgeleitet wurden (erster Teil hinter dem „/“, vor dem „-“).",
    source: TECH,
  },
  abteilungCount: {
    term: "Abteilungen",
    description: "Anzahl der unterschiedlichen Abteilungen je Bereich, abgeleitet aus dem Teil hinter dem Bindestrich der SysV-Abteilung.",
    source: TECH,
  },
  personCount: {
    term: "Systemverantwortliche",
    description: "Anzahl der unterschiedlichen Personen (Schreibweise ohne Beachtung von Groß-/Kleinschreibung zusammengeführt), die im aktuellen Rollenmodus verantwortlich sind.",
    source: TECH,
  },
  dataQualityCount: {
    term: "Datenqualitätsfälle",
    description: "Server-VMs mit fehlender Verantwortlichkeit, nicht interpretierbarem Abteilungspfad, unbekanntem Kürzel oder widersprüchlicher Abteilungszuordnung derselben Person.",
    source: TECH,
  },
};

export const TECHINFO_ORG_SECTIONS: Record<string, GlossaryEntry> = {
  roleToggle: {
    term: "Rollenauswertung",
    description:
      "Legt fest, ob die Hierarchie nach dem primären Systemverantwortlichen (SysV), der Stellvertretung (SysVStv) oder beiden Rollen aufgebaut wird. Im Modus „beide Rollen“ kann dieselbe VM unter zwei Personen erscheinen – das ist beabsichtigt, aber bei Summen zu beachten.",
  },
  hierarchyTable: {
    term: "Organisationshierarchie",
    description:
      "Bereich, Abteilung und Person als auf- und zuklappbare Baumstruktur mit VM-Anzahl, Power-Status, Ressourcen, CPU Demand und Rightsizing-Potenzial je Ebene. Optionale vROps-Werte erscheinen nur bei vorhandener Datenbasis. Ein Klick auf eine Zeile filtert die VM-Liste darunter.",
  },
  chart: {
    term: "Ressourcen je Bereich",
    description: "Vergleicht Bereiche nach VM-Anzahl, konfigurierter vCPU oder konfiguriertem RAM. Ein Klick auf einen Balken filtert die VM-Liste auf den jeweiligen Bereich.",
  },
  vmDrilldown: {
    term: "VMs der Auswahl",
    description: "Server-VMs des in der Hierarchie oder im Diagramm ausgewählten Bereichs, der Abteilung oder Person.",
  },
};

export const TECHINFO_ORG_COLUMNS: Record<string, GlossaryEntry> = {
  node: {
    term: "Bereich / Abteilung / Person",
    description: "Organisationsebene gemäß der aus der SysV-Abteilung abgeleiteten Hierarchie.",
    source: TECH,
  },
  vmCount: {
    term: "Server-VMs",
    description: "Anzahl der Server-VMs, die dieser Ebene im aktuellen Rollenmodus zugeordnet sind.",
    source: TECH,
  },
  poweredOn: {
    term: "Ein / Aus",
    description: "Anzahl eingeschalteter und ausgeschalteter VMs dieser Ebene laut RVTools-Power-Status.",
    source: "RVTools · vInfo",
  },
  vCpu: {
    term: "vCPU",
    description: "Summe der konfigurierten vCPU aller VMs dieser Ebene.",
    source: "RVTools · vInfo",
  },
  ram: {
    term: "RAM",
    description: "Summe des konfigurierten RAM aller VMs dieser Ebene.",
    source: "RVTools · vInfo",
  },
  cpuDemandAverage: {
    term: "CPU Demand Ø",
    description:
      "Summe des mittleren CPU Demand der zugeordneten VMs im jüngsten vROps-Zeitreihenimport. Ohne passenden Messwert wird „—“ angezeigt.",
    source: "vROps-Zeitreihen · CPU Demand Average",
  },
  cpuIntensity: {
    term: "CPU-Intensität",
    description:
      "Mittlerer CPU Demand der VMs im Verhältnis zu ihrer konfigurierten CPU-Kapazität. Berücksichtigt nur VMs, für die beide Werte verfügbar sind.",
    source: "vROps-Zeitreihen · RVTools · vHost",
  },
  rightsizingPotential: {
    term: "Rightsizing-Potenzial",
    description:
      "Prüfpflichtig rückgebbare vCPU als prozentualer Anteil der gesamten konfigurierten vCPU dieser Organisationseinheit. Ohne belastbare Rightsizing-Daten wird „—“ angezeigt.",
    source: "vROps-Zeitreihen · RVTools · vInfo",
  },
};
