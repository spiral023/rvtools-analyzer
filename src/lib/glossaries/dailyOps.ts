import type { GlossaryEntry } from "@/lib/glossary";

/**
 * Glossar für die Daily-Ops-Seite (täglicher Betriebs-Check).
 * Zielgruppe: VMware-Administrator:innen.
 */

const RV = "RVTools";

/* ------------------------------------------------------------------ */
/*  Daily Ops – KPIs                                                   */
/* ------------------------------------------------------------------ */
export const DAILY_OPS_KPI: Record<string, GlossaryEntry> = {
  healthEvents: {
    term: "Health Events",
    description:
      "Anzahl der von vCenter gemeldeten Health- und Konfigurationswarnungen. Jeder Eintrag verdient einen Blick – er kann von harmlos bis kritisch reichen.",
    source: `${RV} · vHealth`,
  },
  configIssues: {
    term: "Config Issues",
    description:
      "VMs, deren Konfigurationsstatus nicht „green“ ist (yellow = Warnung, red = Fehler). Deutet auf fehlerhafte oder inkonsistente VM-Einstellungen hin.",
    source: `${RV} · vInfo · „Config status“`,
  },
  consolidation: {
    term: "Consolidation Needed",
    description:
      "VMs mit gesetztem Flag „Consolidation Needed“. Nach einem abgebrochenen oder unvollständigen Snapshot-Löschvorgang bleiben Delta-Disks liegen; eine Konsolidierung räumt sie auf.",
    source: `${RV} · vInfo · „Consolidation Needed“`,
  },
  disconnected: {
    term: "Disconnected",
    description:
      "VMs, deren Verbindungszustand nicht „connected“ ist (z.B. disconnected, orphaned, inaccessible). Solche VMs sind vom Host getrennt und brauchen kurzfristig Aufmerksamkeit.",
    source: `${RV} · vInfo · „Connection state“`,
  },
  vmSnapshots: {
    term: "VM Snapshots",
    description:
      "Anzahl offener VM-Snapshots im aktiven Datenbestand. Snapshots sind kein Backup und sollten nicht dauerhaft bestehen – ab etwa 20 offenen Snapshots lohnt ein Aufräumen.",
    source: `${RV} · vSnapshot`,
  },
  toolsIssues: {
    term: "Tools Issues",
    description:
      "VMs, deren VMware-Tools-Status nicht „toolsOk“ ist (nicht installiert, veraltet oder nicht laufend). Betrifft Zeitsync, sauberes Herunterfahren und Gast-Interaktion.",
    source: `${RV} · vTools · „Tools“`,
  },
  cdUsb: {
    term: "CD/USB verbunden",
    description:
      "VMs mit einem verbundenen CD/DVD- oder USB-Gerät. Verbundene Medien können vMotion und Wartungsmodus blockieren und sollten im Betrieb getrennt sein.",
    source: `${RV} · vCD / vUSB · „Connected“`,
  },
};

/* ------------------------------------------------------------------ */
/*  Daily Ops – Tabellenspalten                                        */
/* ------------------------------------------------------------------ */
export const DAILY_OPS_COLUMNS: Record<string, GlossaryEntry> = {
  vmName: {
    term: "VM",
    description: "Anzeigename der VM in vCenter.",
    source: `${RV} · vInfo · „VM“`,
  },
  configStatus: {
    term: "Config Status",
    description:
      "vCenter-Konfigurationsstatus: green = ok, yellow = Warnung, red = Fehler in der VM-Konfiguration.",
    source: `${RV} · vInfo · „Config status“`,
  },
  connectionState: {
    term: "Verbindung",
    description:
      "Verbindungszustand der VM zum Host: connected, disconnected, orphaned oder inaccessible.",
    source: `${RV} · vInfo · „Connection state“`,
  },
  powerState: {
    term: "Power",
    description: "Energiezustand der VM: eingeschaltet, ausgeschaltet oder pausiert.",
    source: `${RV} · vInfo · „Powerstate“`,
  },
  cluster: {
    term: "Cluster",
    description: "HA/DRS-Cluster, dem die VM aktuell zugeordnet ist.",
    source: `${RV} · vInfo · „Cluster“`,
  },
  host: {
    term: "Host",
    description: "ESXi-Host, auf dem die VM zum Zeitpunkt des Exports lief.",
    source: `${RV} · vInfo · „Host“`,
  },
  osConfig: {
    term: "OS",
    description:
      "Gast-Betriebssystem laut Konfigurationsdatei (.vmx). Kann von der real installierten Version abweichen.",
    source: `${RV} · vInfo · „OS according to the configuration file“`,
  },
  // Health-Tabelle
  entity: {
    term: "Entity",
    description:
      "Objekt, auf das sich die Health-Meldung bezieht – z.B. eine VM, ein Host oder ein Cluster.",
    source: `${RV} · vHealth · „Name“`,
  },
  messageType: {
    term: "Typ",
    description:
      "Kategorie der Health-Meldung (z.B. Konfiguration, VM-Tools, Datastore). Hilft, gleichartige Auffälligkeiten zu bündeln.",
    source: `${RV} · vHealth · „Message“`,
  },
  message: {
    term: "Meldung",
    description: "Volltext der von vCenter gemeldeten Health-/Konfigurationswarnung.",
    source: `${RV} · vHealth · „Message“`,
  },
  // Snapshot-Tabelle
  snapshotName: {
    term: "Snapshot",
    description: "Name des VM-Snapshots, wie er in vCenter vergeben wurde.",
    source: `${RV} · vSnapshot · „Name“`,
  },
  description: {
    term: "Beschreibung",
    description: "Optionaler Beschreibungstext des Snapshots – oft der Anlass der Erstellung.",
    source: `${RV} · vSnapshot · „Description“`,
  },
  dateTaken: {
    term: "Erstellt",
    description: "Zeitpunkt, zu dem der Snapshot angelegt wurde.",
    source: `${RV} · vSnapshot · „Date / time“`,
  },
  ageDays: {
    term: "Seit Erstellung",
    description:
      "Alter des Snapshots in Tagen. Ab 7 Tagen (gelb) bzw. 14 Tagen (rot) wächst das Risiko wachsender Delta-Disks und schlechter Konsolidierbarkeit.",
    source: "berechnet aus „Date / time“",
  },
  sizeMiB: {
    term: "Größe (GiB)",
    description:
      "Belegter Speicher der Snapshot-Delta-Disks. Große Snapshots (ab ~20 GiB gelb, ~50 GiB rot) verlängern Konsolidierung und Backup und gefährden den Datastore-Headroom.",
    source: `${RV} · vSnapshot · „Size MiB (vmsn)“`,
  },
  quiesced: {
    term: "Quiesced",
    description:
      "Ob der Snapshot dateisystem-konsistent (via VMware Tools) erstellt wurde. „Ja“ ist für anwendungskonsistente Sicherungen wünschenswert.",
    source: `${RV} · vSnapshot · „Quiesced“`,
  },
};

/* ------------------------------------------------------------------ */
/*  Daily Ops – Abschnitts-Überschriften                              */
/* ------------------------------------------------------------------ */
export const DAILY_OPS_SECTIONS: Record<string, GlossaryEntry> = {
  healthByType: {
    term: "Health Events nach Typ",
    description:
      "Top-10-Kategorien der vCenter-Health-Meldungen nach Häufigkeit. Nutze die Verteilung, um systematische Probleme (z.B. gehäufte Tools- oder Datastore-Warnungen) von Einzelfällen zu unterscheiden und die Abarbeitung zu priorisieren.",
  },
  powerState: {
    term: "VM Power State",
    description:
      "Verteilung der VMs nach Energiezustand im gefilterten Bestand. Ein hoher Anteil „Powered Off“ weist auf Aufräumpotenzial hin – ausgeschaltete VMs belegen weiterhin Storage.",
  },
  configIssuesTable: {
    term: "VMs mit Konfigurationsproblemen",
    description:
      "Alle VMs mit Config-Status ungleich „green“. Arbeite die Liste im Tagesgeschäft ab – Klick auf eine Zeile öffnet die Detailansicht mit Kontext zur Ursache.",
  },
  snapshotsTable: {
    term: "VM Snapshots",
    description:
      "Alle offenen Snapshots mit Alter und Größe. Sortiere nach Alter oder Größe, um Altlasten zu finden; alte oder große Snapshots sollten konsolidiert werden, da sie Storage binden und Backups verlangsamen.",
  },
  healthTable: {
    term: "Health-Events",
    description:
      "Vollständige Liste der von vCenter gemeldeten Health-Meldungen mit Objekt, Typ und Volltext. Grundlage, um Warnungen einzeln zu bewerten und Maßnahmen abzuleiten.",
  },
};
