import type { GlossaryEntry } from "@/lib/glossary";

/**
 * Glossar für die Seite „Storage / Backup“.
 *
 * Zielgruppe: VMware-Administrator:innen. Struktur analog zu `glossary.ts`:
 * KPIs, Tabellenspalten und Abschnitts-Überschriften mit Sinn + Arbeitsweise.
 */

const RV = "RVTools";

/* ------------------------------------------------------------------ */
/*  KPIs                                                               */
/* ------------------------------------------------------------------ */
export const STORAGE_KPI: Record<string, GlossaryEntry> = {
  partitions: {
    term: "Partitionen",
    description:
      "Anzahl der vom Gast gemeldeten Dateisystem-Partitionen über alle gefilterten VMs. Grundlage für die Auslastungsanalyse innerhalb der Gäste.",
    source: `${RV} · vPartition`,
  },
  critical: {
    term: "Kritisch (<10 %)",
    description:
      "Partitionen mit weniger als 10 % freiem Platz. Akutes Risiko für Applikationsausfälle – zeitnah bereinigen oder vergrößern.",
    source: `${RV} · vPartition · „Free MiB“ / „Capacity MiB“`,
  },
  warning: {
    term: "Warnung (<20 %)",
    description:
      "Partitionen mit 10–20 % freiem Platz. Noch unkritisch, aber beobachten – bei weiterem Wachstum droht Platzmangel.",
    source: `${RV} · vPartition · „Free MiB“ / „Capacity MiB“`,
  },
  multipathIssues: {
    term: "Multipath Issues",
    description:
      "Storage-Geräte, deren operativer Pfadstatus nicht „ok“ ist. Deutet auf degradierte oder ausgefallene Pfade zum SAN/LUN hin.",
    source: `${RV} · vMultiPath · „Oper. State“`,
  },
  deadPaths: {
    term: "Dead Paths",
    description:
      "Betroffene Hosts / Devices mit toten Storage-Pfaden. Reduzierte Pfad-Redundanz – Fabric, Zoning und HBAs prüfen, bevor ein Einzelpfad-Ausfall zum Datastore-Verlust führt.",
    source: `${RV} · vMultiPath · „Path n state“`,
  },
  noBackup: {
    term: "Kein Backup",
    description:
      "VMs ohne erkennbaren Backup-Status und ohne „Last Backup“-Zeitstempel. Diese VMs sind nicht gesichert und im Ernstfall nicht wiederherstellbar.",
    source: `${RV} · vInfo · „Backup Status“ / „Last Backup“`,
  },
  staleBackup: {
    term: "Backup >7d",
    description:
      "VMs, deren letztes Backup älter als 7 Tage ist. Zeigt eingeschlafene oder fehlschlagende Sicherungsjobs.",
    source: `${RV} · vInfo · „Last Backup“`,
  },
  thinDisks: {
    term: "Thin Disks",
    description:
      "Anzahl der thin-provisionierten virtuellen Disks. Sparen Datastore-Platz, können aber bei Überprovisionierung zu Out-of-Space-Situationen auf dem Datastore führen.",
    source: `${RV} · vDisk · „Thin“`,
  },
  rdmUpgradeable: {
    term: "RDM / VMFS Upg.",
    description:
      "Raw Device Mappings und auf ältere VMFS-Version laufende, upgrade-fähige Datastores. RDMs schränken vMotion/Snapshots ein; upgrade-fähige VMFS-Volumes sind Lifecycle-Kandidaten.",
    source: `${RV} · vDisk · „Raw“ / vDatastore · „VMFS Upgradeable“`,
  },
};

/* ------------------------------------------------------------------ */
/*  Tabelle „Gast-Partitionen“                                         */
/* ------------------------------------------------------------------ */
export const STORAGE_PARTITION_COLUMNS: Record<string, GlossaryEntry> = {
  vm: {
    term: "VM",
    description: "VM, zu der die Gast-Partition gehört.",
    source: `${RV} · vPartition · „VM“`,
  },
  disk: {
    term: "Partition",
    description: "Vom Gast-Betriebssystem gemeldeter Mountpoint bzw. Laufwerksbuchstabe.",
    source: `${RV} · vPartition · „Disk“`,
  },
  capacityMiB: {
    term: "Kapazität",
    description: "Gesamtgröße der Partition laut Gast.",
    source: `${RV} · vPartition · „Capacity MiB“`,
  },
  consumedMiB: {
    term: "Konsumiert",
    description: "Belegter Speicher innerhalb der Partition.",
    source: `${RV} · vPartition · „Consumed MiB“`,
  },
  freeMiB: {
    term: "Frei",
    description: "Freier Speicher innerhalb der Partition.",
    source: `${RV} · vPartition · „Free MiB“`,
  },
  freePct: {
    term: "Frei %",
    description:
      "Freier Anteil der Partition. Rot unter 10 %, gelb unter 20 % – die Sortierung setzt die knappsten Partitionen nach oben.",
  },
};

/* ------------------------------------------------------------------ */
/*  Tabelle „Multipath Status“                                         */
/* ------------------------------------------------------------------ */
export const STORAGE_MULTIPATH_COLUMNS: Record<string, GlossaryEntry> = {
  host: {
    term: "Host",
    description: "ESXi-Host, dessen Pfade zum Storage-Gerät ausgewertet werden.",
    source: `${RV} · vMultiPath · „Host“`,
  },
  datastore: {
    term: "Datastore",
    description: "Über die Pfade angebundenes LUN/Datastore.",
    source: `${RV} · vMultiPath · „Datastore“`,
  },
  policy: {
    term: "Policy",
    description:
      "Path Selection Policy (z.B. Round Robin, Fixed, MRU). Bestimmt, wie der Host die verfügbaren Pfade nutzt.",
    source: `${RV} · vMultiPath · „Policy“`,
  },
  state: {
    term: "Status",
    description:
      "Operativer Gesamtstatus des Geräts. „ok“ = betriebsbereit; abweichende Werte weisen auf Pfad- oder LUN-Probleme hin.",
    source: `${RV} · vMultiPath · „Oper. State“`,
  },
  paths: {
    term: "Pfade",
    description: "Gesamtzahl der zum Gerät erkannten Pfade.",
    source: `${RV} · vMultiPath · „Path n“`,
  },
  activePaths: {
    term: "Aktiv",
    description: "Anzahl der aktiven Pfade zum Gerät.",
    source: `${RV} · vMultiPath · „Path n state“`,
  },
  deadPaths: {
    term: "Tote Pfade",
    description:
      "Anzahl der als „dead“ gemeldeten Pfade. Jeder tote Pfad reduziert die Redundanz – bei 0 aktiven Pfaden droht ein Storage-Ausfall.",
    source: `${RV} · vMultiPath · „Path n state“`,
  },
};

/* ------------------------------------------------------------------ */
/*  Tabelle „Hosts mit toten Storage-Pfaden“                           */
/* ------------------------------------------------------------------ */
export const STORAGE_DEADPATH_COLUMNS: Record<string, GlossaryEntry> = {
  host: {
    term: "Host",
    description: "ESXi-Host mit mindestens einem toten Storage-Pfad.",
    source: `${RV} · vMultiPath · „Host“`,
  },
  affectedDevices: {
    term: "Betroffene Devices",
    description: "Anzahl der Storage-Geräte dieses Hosts, die tote Pfade aufweisen.",
    source: `${RV} · vMultiPath`,
  },
  deadPaths: {
    term: "Tote Pfade gesamt",
    description: "Summe aller toten Pfade über die betroffenen Geräte des Hosts.",
    source: `${RV} · vMultiPath · „Path n state“`,
  },
  datastores: {
    term: "Betroffene Datastores",
    description: "Liste der Datastores/LUNs, deren Pfade auf diesem Host betroffen sind.",
    source: `${RV} · vMultiPath · „Datastore“`,
  },
};

/* ------------------------------------------------------------------ */
/*  Tabelle „Virtuelle Disks“                                          */
/* ------------------------------------------------------------------ */
export const STORAGE_DISK_COLUMNS: Record<string, GlossaryEntry> = {
  vm: {
    term: "VM",
    description: "VM, der die virtuelle Disk zugeordnet ist.",
    source: `${RV} · vDisk · „VM“`,
  },
  disk: {
    term: "Disk",
    description: "Bezeichnung der virtuellen Festplatte (Hard disk n).",
    source: `${RV} · vDisk · „Disk“`,
  },
  diskPath: {
    term: "Disk Path",
    description: "Pfad zur VMDK auf dem Datastore ([Datastore] VM/VM.vmdk).",
    source: `${RV} · vDisk · „Disk Path“`,
  },
  capacityMiB: {
    term: "Kapazität",
    description: "Konfigurierte Größe der virtuellen Disk.",
    source: `${RV} · vDisk · „Capacity MiB“`,
  },
  thin: {
    term: "Thin",
    description:
      "Thin-provisioniert: Speicher wird erst bei Bedarf belegt. Spart Platz, birgt aber Überprovisionierungs-Risiko am Datastore.",
    source: `${RV} · vDisk · „Thin“`,
  },
  mode: {
    term: "Mode",
    description:
      "Disk-Modus (z.B. persistent, independent). Independent-Disks werden von VM-Snapshots ausgenommen.",
    source: `${RV} · vDisk · „Disk Mode“`,
  },
  raw: {
    term: "RDM",
    description:
      "Raw Device Mapping – die VM greift direkt auf eine physische LUN zu. Schränkt Storage-vMotion und Snapshots ein.",
    source: `${RV} · vDisk · „Raw“`,
  },
  controller: {
    term: "Controller",
    description: "Virtueller Disk-Controller, an dem die Disk hängt (z.B. SCSI, NVMe, SATA).",
    source: `${RV} · vDisk · „Controller“`,
  },
  scsiUnit: {
    term: "SCSI Unit",
    description: "Position der Disk am Controller (SCSI Unit #).",
    source: `${RV} · vDisk · „SCSI Unit #“`,
  },
};

/* ------------------------------------------------------------------ */
/*  Tabelle „Backup Frische / Coverage“ (auch Konflikt-Tabelle)        */
/* ------------------------------------------------------------------ */
export const STORAGE_BACKUP_COLUMNS: Record<string, GlossaryEntry> = {
  vm: {
    term: "VM",
    description: "VM, deren Backup-Status ausgewertet wird.",
    source: `${RV} · vInfo · „VM“`,
  },
  backupStatus: {
    term: "Backup Status",
    description: "Von der Backup-Lösung nach vCenter zurückgemeldeter Status (sofern integriert).",
    source: `${RV} · vInfo · „Backup Status“`,
  },
  lastBackup: {
    term: "Letztes Backup",
    description: "Zeitstempel des letzten erfolgreichen Backups laut vCenter.",
    source: `${RV} · vInfo · „Last Backup“`,
  },
  ageDays: {
    term: "Alter (Tage)",
    description:
      "Tage seit dem letzten Backup. Rot ab 7 Tagen, gelb ab 3 Tagen – „—“ bedeutet kein verwertbares Datum.",
  },
  risk: {
    term: "Risiko",
    description:
      "Abgeleitete Einstufung: „kein Backup“, „hoch“ (>7 Tage), „mittel“ (>3 Tage) oder „niedrig“. Priorisiert die Nacharbeit an der Datensicherung.",
  },
};

/* ------------------------------------------------------------------ */
/*  Tabelle „SCSI/Controller Mapping“                                  */
/* ------------------------------------------------------------------ */
export const STORAGE_SCSI_COLUMNS: Record<string, GlossaryEntry> = {
  vm: {
    term: "VM",
    description: "VM, deren Controller-Belegung dargestellt wird.",
    source: `${RV} · vDisk · „VM“`,
  },
  controller: {
    term: "Controller",
    description: "Virtueller Disk-Controller (z.B. SCSI controller 0, NVMe controller 0).",
    source: `${RV} · vDisk · „Controller“`,
  },
  scsiUnit: {
    term: "SCSI Unit #",
    description: "Position der Disk am Controller. Unit 7 ist reserviert und wird übersprungen.",
    source: `${RV} · vDisk · „SCSI Unit #“`,
  },
  disk: {
    term: "Disk",
    description: "Zugeordnete virtuelle Festplatte.",
    source: `${RV} · vDisk · „Disk“`,
  },
  capacityMiB: {
    term: "Kapazität",
    description: "Größe der virtuellen Disk.",
    source: `${RV} · vDisk · „Capacity MiB“`,
  },
  mode: {
    term: "Disk Mode",
    description: "Modus der Disk (persistent, independent-persistent …).",
    source: `${RV} · vDisk · „Disk Mode“`,
  },
};

/* ------------------------------------------------------------------ */
/*  Tabelle „MHA / VMFS Lifecycle“                                     */
/* ------------------------------------------------------------------ */
export const STORAGE_DSLIFECYCLE_COLUMNS: Record<string, GlossaryEntry> = {
  name: {
    term: "Datastore",
    description: "Name des Datastores.",
    source: `${RV} · vDatastore · „Name“`,
  },
  type: {
    term: "Typ",
    description: "Datastore-Typ (VMFS, NFS, vSAN, vVol).",
    source: `${RV} · vDatastore · „Type“`,
  },
  version: {
    term: "Version",
    description: "VMFS-Version des Datastores (z.B. 5, 6). Ältere Versionen sind Kandidaten für ein Upgrade.",
    source: `${RV} · vDatastore · „Version“`,
  },
  upgradeable: {
    term: "Upgradeable",
    description:
      "„Ja“ = das VMFS kann auf eine neuere Version gehoben werden. Für Lifecycle- und Feature-Planung relevant.",
    source: `${RV} · vDatastore · „VMFS Upgradeable“`,
  },
  mha: {
    term: "MHA",
    description:
      "Multiple Host Access – gibt an, ob der Datastore von mehreren Hosts gleichzeitig genutzt werden kann (Voraussetzung für HA/DRS/vMotion).",
    source: `${RV} · vDatastore · „MHA“`,
  },
  capacityMiB: {
    term: "Kapazität",
    description: "Gesamtkapazität des Datastores.",
    source: `${RV} · vDatastore · „Capacity MiB“`,
  },
  freePct: {
    term: "Frei %",
    description: "Freier Anteil des Datastores. Rot unter 10 %, gelb unter 20 %.",
    source: `${RV} · vDatastore · „Free %“`,
  },
};

/* ------------------------------------------------------------------ */
/*  Abschnitts-Überschriften (Sinn + Arbeitsweise)                     */
/* ------------------------------------------------------------------ */
export const STORAGE_SECTIONS: Record<string, GlossaryEntry> = {
  partitionChart: {
    term: "Gast-Partitionen mit wenig Platz",
    description:
      "Zeigt die bis zu 15 knappsten Gast-Partitionen unter 30 % frei. Nutze das Diagramm, um akute Platzprobleme innerhalb der VMs schnell zu erkennen – rote Balken (<10 %) zuerst angehen.",
  },
  partitionTable: {
    term: "Gast-Partitionen",
    description:
      "Vollständige, nach freiem Anteil aufsteigend sortierte Liste aller Gast-Partitionen. Filtere per Suche nach VM oder Mountpoint und klicke eine Zeile für die VM-Details an.",
  },
  backupTable: {
    term: "Backup Frische / Coverage",
    description:
      "VMs mit auffälligem Backup-Zustand (kein, altes oder gefährdetes Backup). Arbeite die Liste nach Risiko ab – „kein Backup“ und „>7 Tage“ zuerst. Ein Klick öffnet die VM-Details.",
  },
  snapshotConflicts: {
    term: "Snapshot + Backup Konflikte",
    description:
      "VMs, die gleichzeitig einen offenen VM-Snapshot UND ein Backup-Problem haben. Kritische Kombination: Der Restore kann fehlschlagen und wachsende Delta-Disks belegen Datastore-Platz. Snapshot konsolidieren und Backup verifizieren.",
  },
  deadPathHosts: {
    term: "Hosts mit toten Storage-Pfaden",
    description:
      "Aggregiert tote Pfade je Host. Reduzierte Pfad-Redundanz – prüfe Fabric, Zoning und HBAs. Gleiche mit „Oper. State != ok“ ab, um akute Device-Ausfälle von reiner Redundanzminderung zu unterscheiden.",
  },
  multipathTable: {
    term: "Multipath Status",
    description:
      "Pfadstatus je Storage-Gerät und Host. Prüfe Policy-Konsistenz (meist Round Robin) und achte auf tote Pfade oder abweichenden Oper. State als Frühindikator für SAN-Probleme.",
  },
  diskTable: {
    term: "Virtuelle Disks",
    description:
      "Alle virtuellen Disks der gefilterten VMs mit Provisionierung, Modus und Controller-Zuordnung. Nützlich, um Thin/RDM-Anteile und Disk-Layout je VM zu bewerten.",
  },
  scsiTable: {
    term: "SCSI/Controller Mapping",
    description:
      "Zeigt, an welchem Controller und an welcher Unit jede Disk hängt. Hilft beim Nachvollziehen des Disk-Layouts und beim Erkennen ungünstiger Controller-Verteilungen.",
  },
  dsLifecycleTable: {
    term: "MHA / VMFS Lifecycle",
    description:
      "Datastores mit VMFS-Version, Upgrade-Fähigkeit und Multi-Host-Access. Grundlage für die Lifecycle-Planung: upgrade-fähige und einzeln angebundene Datastores identifizieren.",
  },
};
