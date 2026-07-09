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
    description: "Kennzeichen, ob die VM per CommVault gesichert wird. „Nein“ ist ein Prüfpunkt für die Backup-Abdeckung.",
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
