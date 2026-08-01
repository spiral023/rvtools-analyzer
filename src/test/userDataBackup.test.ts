import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  buildBackupFileName,
  buildUserDataBackup,
  parseUserDataBackup,
  serializeUserDataBackup,
  USER_DATA_BACKUP_KIND,
  USER_DATA_BACKUP_VERSION,
} from "@/lib/backup/userDataBackup";
import type {
  MaintenanceClusterAssignment,
  MaintenanceSettings,
  MaintenanceWindowDefinition,
  Scenario,
  TechInfoOrganisationTablePreferences,
} from "@/domain/models/types";
import { getStoredVmScopeSettings, saveVmScopeSettings } from "@/lib/vmScopeSettings";

const makeMaintenanceWindow = (
  abbreviation = "MW 1",
  overrides: Partial<MaintenanceWindowDefinition> = {},
): MaintenanceWindowDefinition => ({
  id: `window-${abbreviation}`,
  abbreviation,
  normalizedAbbreviation: abbreviation.trim().toLocaleLowerCase("de-DE"),
  description: "Reguläres Wartungsfenster",
  handling: "regular",
  weeklySlots: Array.from({ length: 7 }, () => Array<boolean>(48).fill(false)) as MaintenanceWindowDefinition["weeklySlots"],
  calendarRules: [{ weekday: 0, occurrences: [1, "last"] }],
  createdAt: "2026-07-01T10:00:00.000Z",
  updatedAt: "2026-07-02T10:00:00.000Z",
  ...overrides,
});

const settings: MaintenanceSettings = {
  id: "default",
  firstName: "Philipp",
  lastName: "Asanger",
  companyName: "Raitec",
  updatedAt: "2026-07-01T10:00:00.000Z",
};

const assignment: MaintenanceClusterAssignment = {
  vcenterId: "vc-01",
  clusterName: "Cluster-A",
  type: "Normal",
  windows: [{ id: "w1", label: "MO 20:00 - 22:00" }],
  contacts: [{ firstName: "Max", lastName: "Muster" }],
  additionalEmails: ["postkorb@example.com"],
  updatedAt: "2026-07-01T10:00:00.000Z",
  id: "vc-01::Cluster-A",
};

const scenario: Scenario = {
  id: "s1",
  name: "Migration Q3",
  type: "cluster-migration",
  createdAt: "2026-06-01T08:00:00.000Z",
  updatedAt: "2026-06-15T08:00:00.000Z",
  vcenterScope: ["vc-01"],
  groups: [{ id: "g1", label: null, targetClusterKey: "ck1", vmKeys: ["vm1"] }],
  notes: null,
};

const vcenterGroup = {
  id: "group-prod",
  name: "vCenter Server Prod",
  vcenterIds: ["vcenter9910", "vcenter9911"],
  createdAt: "2026-07-01T10:00:00.000Z",
  updatedAt: "2026-07-01T10:00:00.000Z",
};

const techInfoOrganisationTablePreferences: TechInfoOrganisationTablePreferences = {
  columnVisibility: { comment: false, cluster: true },
  columnOrder: ["server", "cluster", "comment"],
  sorting: [{ id: "cluster", desc: false }],
};
const tableDisplayPreferences = {
  "hosts/inventory": {
    columnVisibility: { serviceTag: false },
    columnOrder: ["host", "serviceTag"],
    sorting: [{ id: "host", desc: false }],
  },
};

describe("buildUserDataBackup / serialize / parse roundtrip", () => {
  it("erhält alle Benutzerdaten über einen Export/Import-Zyklus", () => {
    const backup = buildUserDataBackup({
      maintenanceSettings: settings,
      maintenanceClusterAssignments: [assignment],
      maintenanceWindows: [makeMaintenanceWindow()],
      scenarios: [scenario],
      vcenterGroups: [vcenterGroup],
      techInfoOrganisationTablePreferences,
      tableDisplayPreferences,
      exportedAt: new Date("2026-07-03T12:00:00.000Z"),
    } as never);

    const parsed = parseUserDataBackup(serializeUserDataBackup(backup));

    expect(parsed.kind).toBe(USER_DATA_BACKUP_KIND);
    expect(parsed.version).toBe(USER_DATA_BACKUP_VERSION);
    expect(parsed.exportedAt).toBe("2026-07-03T12:00:00.000Z");
    expect(parsed.maintenanceSettings).toEqual(settings);
    expect(parsed.maintenanceClusterAssignments).toEqual([assignment]);
    expect(parsed.maintenanceWindows).toEqual([makeMaintenanceWindow()]);
    expect(parsed.scenarios).toEqual([scenario]);
    expect((parsed as unknown as { vcenterGroups?: unknown[] }).vcenterGroups).toEqual([vcenterGroup]);
    expect((parsed as unknown as { vmScopeSettings?: unknown }).vmScopeSettings).toEqual({
      vmPowerScope: "poweredOn",
      excludeVclsVms: true,
      excludeDummyVms: false,
    });
    expect(parsed.techInfoOrganisationTablePreferences).toEqual(techInfoOrganisationTablePreferences);
    expect(parsed.tableDisplayPreferences).toEqual(tableDisplayPreferences);
  });

  it("kommt mit leerem Datenbestand zurecht", () => {
    const backup = buildUserDataBackup({
      maintenanceSettings: null,
      maintenanceClusterAssignments: [],
      maintenanceWindows: [],
      scenarios: [],
    });

    const parsed = parseUserDataBackup(serializeUserDataBackup(backup));

    expect(parsed.maintenanceSettings).toBeNull();
    expect(parsed.maintenanceClusterAssignments).toEqual([]);
    expect(parsed.maintenanceWindows).toEqual([]);
    expect(parsed.scenarios).toEqual([]);
  });
});

describe("Wochenpläne in der Backup-Datei", () => {
  const saturdayNight = (): MaintenanceWindowDefinition["weeklySlots"] => {
    const slots = Array.from({ length: 7 }, () => Array<boolean>(48).fill(false)) as MaintenanceWindowDefinition["weeklySlots"];
    // Samstag 22:00–24:00 und Sonntag 00:00–06:00.
    for (let slot = 44; slot < 48; slot += 1) slots[5][slot] = true;
    for (let slot = 0; slot < 12; slot += 1) slots[6][slot] = true;
    return slots;
  };

  const backupWith = (weeklySlots: MaintenanceWindowDefinition["weeklySlots"]) => buildUserDataBackup({
    maintenanceSettings: null,
    maintenanceClusterAssignments: [],
    maintenanceWindows: [makeMaintenanceWindow("MW 1", { weeklySlots })],
    scenarios: [],
  });

  it("schreibt Zeitbereiche statt der 48er-Matrix", () => {
    const serialized = serializeUserDataBackup(backupWith(saturdayNight()));

    expect(JSON.parse(serialized).maintenanceWindows[0].weeklySlots).toEqual({
      sat: ["22:00-24:00"],
      sun: ["00:00-06:00"],
    });
    // Der Kern des Formatwechsels: keine Zeile pro Halbstunde mehr.
    expect(serialized.split("\n").filter((line) => /^\s*(true|false),?$/.test(line))).toHaveLength(0);
  });

  it("führt den Wochenplan verlustfrei über einen Export/Import-Zyklus", () => {
    const weeklySlots = saturdayNight();

    const parsed = parseUserDataBackup(serializeUserDataBackup(backupWith(weeklySlots)));

    expect(parsed.maintenanceWindows[0].weeklySlots).toEqual(weeklySlots);
  });

  it("liest weiterhin die 48er-Matrix älterer Backups", () => {
    const weeklySlots = saturdayNight();

    const parsed = parseUserDataBackup(JSON.stringify({
      kind: USER_DATA_BACKUP_KIND,
      version: 4,
      maintenanceSettings: null,
      maintenanceClusterAssignments: [],
      maintenanceWindows: [makeMaintenanceWindow("MW 1", { weeklySlots })],
      scenarios: [],
    }));

    expect(parsed.maintenanceWindows[0].weeklySlots).toEqual(weeklySlots);
  });

  it("überspringt Fenster mit defekten Zeitbereichen", () => {
    const parsed = parseUserDataBackup(JSON.stringify({
      kind: USER_DATA_BACKUP_KIND,
      version: USER_DATA_BACKUP_VERSION,
      maintenanceSettings: null,
      maintenanceClusterAssignments: [],
      maintenanceWindows: [
        { ...makeMaintenanceWindow("Defekt"), weeklySlots: { mon: ["04:00-02:00"] } },
        { ...makeMaintenanceWindow("Unbekannter Tag"), weeklySlots: { montag: ["02:00-04:00"] } },
        { ...makeMaintenanceWindow("Gültig"), weeklySlots: { mon: ["02:00-04:00"] } },
      ],
      scenarios: [],
    }));

    expect(parsed.maintenanceWindows.map((entry) => entry.abbreviation)).toEqual(["Gültig"]);
    expect(parsed.maintenanceWindows[0].weeklySlots[0].slice(4, 8)).toEqual(Array(4).fill(true));
  });

  it("erhält die Felder älterer Versionen trotz Versionssprung", () => {
    // Regression: die Feldweichen verglichen früher gegen die neueste Version, wodurch eine
    // Erhöhung die Felder der Vorgängerversion stillschweigend verworfen hätte.
    const parsed = parseUserDataBackup(JSON.stringify({
      kind: USER_DATA_BACKUP_KIND,
      version: 4,
      maintenanceSettings: null,
      maintenanceClusterAssignments: [],
      maintenanceWindows: [makeMaintenanceWindow()],
      scenarios: [],
      vcenterGroups: [vcenterGroup],
      vmScopeSettings: { vmPowerScope: "all", excludeVclsVms: false, excludeDummyVms: true },
    }));

    expect(parsed.maintenanceWindows).toHaveLength(1);
    expect(parsed.vcenterGroups).toEqual([vcenterGroup]);
    expect(parsed.vmScopeSettings).toEqual({ vmPowerScope: "all", excludeVclsVms: false, excludeDummyVms: true });
  });
});

describe("parseUserDataBackup Validierung", () => {
  it("lehnt ungültiges JSON ab", () => {
    expect(() => parseUserDataBackup("kein json {")).toThrow("kein gültiges JSON");
  });

  it("lehnt Dateien ohne Backup-Kennung ab", () => {
    expect(() => parseUserDataBackup(JSON.stringify({ foo: "bar" }))).toThrow(
      "kein RVTools-Analyzer-Backup",
    );
  });

  it("lehnt unbekannte Versionen ab", () => {
    expect(() =>
      parseUserDataBackup(JSON.stringify({ kind: USER_DATA_BACKUP_KIND, version: 99 })),
    ).toThrow("Version 99");
  });

  it("liest Backups der Version 1 als aktuelle Version mit leerer Wartungsfensterliste", () => {
    const parsed = parseUserDataBackup(JSON.stringify({
      kind: USER_DATA_BACKUP_KIND,
      version: 1,
      exportedAt: "2026-07-03T12:00:00.000Z",
      maintenanceSettings: settings,
      maintenanceClusterAssignments: [assignment],
      scenarios: [scenario],
    }));

    expect(parsed.version).toBe(USER_DATA_BACKUP_VERSION);
    expect(parsed.maintenanceWindows).toEqual([]);
    expect(parsed.vcenterGroups).toEqual([]);
    expect(parsed.maintenanceClusterAssignments).toEqual([assignment]);
  });

  it("überspringt ungültige Wartungsfenster und normalisiert gültige defensiv", () => {
    const valid = makeMaintenanceWindow("  ÄÖ 2  ", {
      normalizedAbbreviation: "veraltet",
      createdAt: "kein Datum",
      updatedAt: "",
    });
    const invalid = makeMaintenanceWindow("Defekt", {
      weeklySlots: Array.from({ length: 6 }, () => Array<boolean>(48).fill(false)) as MaintenanceWindowDefinition["weeklySlots"],
    });

    const parsed = parseUserDataBackup(JSON.stringify({
      kind: USER_DATA_BACKUP_KIND,
      version: 2,
      maintenanceSettings: null,
      maintenanceClusterAssignments: [],
      maintenanceWindows: [invalid, valid, { ...valid, id: "", abbreviation: "Ohne ID" }],
      scenarios: [],
    }));

    expect(parsed.maintenanceWindows).toHaveLength(1);
    expect(parsed.maintenanceWindows[0]).toMatchObject({
      id: valid.id.trim(),
      abbreviation: "ÄÖ 2",
      normalizedAbbreviation: "äö 2",
      handling: "regular",
    });
    expect(Number.isFinite(Date.parse(parsed.maintenanceWindows[0].createdAt))).toBe(true);
    expect(Number.isFinite(Date.parse(parsed.maintenanceWindows[0].updatedAt))).toBe(true);
  });

  it("überspringt unbrauchbare Einträge, statt den Import abzubrechen", () => {
    const parsed = parseUserDataBackup(
      JSON.stringify({
        kind: USER_DATA_BACKUP_KIND,
        version: USER_DATA_BACKUP_VERSION,
        exportedAt: "2026-07-03T12:00:00.000Z",
        maintenanceSettings: null,
        maintenanceClusterAssignments: [
          assignment,
          { clusterName: "ohne vCenter" },
          "kein Objekt",
        ],
        scenarios: [scenario, { id: "ohne-name" }, 42],
      }),
    );

    expect(parsed.maintenanceClusterAssignments).toEqual([assignment]);
    expect(parsed.scenarios).toEqual([scenario]);
  });

  it("normalisiert unvollständige, aber brauchbare Einträge", () => {
    const parsed = parseUserDataBackup(
      JSON.stringify({
        kind: USER_DATA_BACKUP_KIND,
        version: USER_DATA_BACKUP_VERSION,
        maintenanceSettings: { firstName: " Philipp " },
        maintenanceClusterAssignments: [{ vcenterId: "vc-02", clusterName: "Cluster-B" }],
        scenarios: [{ id: "s2", name: "Minimal" }],
      }),
    );

    expect(parsed.maintenanceSettings).toMatchObject({
      id: "default",
      firstName: "Philipp",
      lastName: "",
      companyName: "",
    });
    expect(parsed.maintenanceClusterAssignments[0]).toMatchObject({
      vcenterId: "vc-02",
      clusterName: "Cluster-B",
      type: "Normal",
      windows: [],
      contacts: [],
      additionalEmails: [],
      id: "vc-02::Cluster-B",
    });
    expect(parsed.scenarios[0]).toMatchObject({
      id: "s2",
      name: "Minimal",
      type: "cluster-migration",
      vcenterScope: [],
      groups: [],
      notes: null,
    });
  });
});

describe("collectUserDataBackup / applyUserDataBackup", () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
    localStorage.clear();
  });

  it("collects and merges maintenance windows, reports their count, and keeps existing data for an empty backup", async () => {
    const { getMaintenanceWindows, putMaintenanceWindow } = await import("@/data/db");
    const { applyUserDataBackup, collectUserDataBackup } = await import("@/domain/services/backupService");
    const existing = makeMaintenanceWindow("Bestand", { id: "existing-id" });
    await putMaintenanceWindow(existing);

    const collected = await collectUserDataBackup();
    expect(collected.maintenanceWindows).toEqual([existing]);

    const imported = makeMaintenanceWindow("Importiert", { id: "imported-id" });
    const result = await applyUserDataBackup(buildUserDataBackup({
      maintenanceSettings: null,
      maintenanceClusterAssignments: [],
      maintenanceWindows: [imported],
      scenarios: [],
    }));
    expect(result.maintenanceWindowsImported).toBe(1);
    expect((await getMaintenanceWindows()).map((entry) => entry.abbreviation)).toEqual(["Bestand", "Importiert"]);

    const emptyResult = await applyUserDataBackup(buildUserDataBackup({
      maintenanceSettings: null,
      maintenanceClusterAssignments: [],
      maintenanceWindows: [],
      scenarios: [],
    }));
    expect(emptyResult.maintenanceWindowsImported).toBe(0);
    expect(await getMaintenanceWindows()).toHaveLength(2);
  });

  it("sichert und stellt benannte vCenter-Gruppen anhand ihrer vCenter-IDs wieder her", async () => {
    const { getVcenterGroups, putVcenterGroup } = await import("@/data/db");
    const { applyUserDataBackup, collectUserDataBackup } = await import("@/domain/services/backupService");
    await putVcenterGroup(vcenterGroup);

    const collected = await collectUserDataBackup();
    expect(collected.vcenterGroups).toEqual([vcenterGroup]);

    const imported = { ...vcenterGroup, name: "Produktiv-vCenter", updatedAt: "2026-07-03T12:00:00.000Z" };
    const result = await applyUserDataBackup(buildUserDataBackup({
      maintenanceSettings: null,
      maintenanceClusterAssignments: [],
      maintenanceWindows: [],
      scenarios: [],
      vcenterGroups: [imported],
    }));

    expect(result.vcenterGroupsImported).toBe(1);
    await expect(getVcenterGroups()).resolves.toEqual([imported]);
  });

  it("exportiert und importiert die lokalen VM-Scope-Vorgaben", async () => {
    const { applyUserDataBackup, collectUserDataBackup } = await import("@/domain/services/backupService");
    saveVmScopeSettings({ vmPowerScope: "all", excludeVclsVms: false, excludeDummyVms: false });

    const collected = await collectUserDataBackup();
    expect(collected.vmScopeSettings).toEqual({ vmPowerScope: "all", excludeVclsVms: false, excludeDummyVms: false });

    const result = await applyUserDataBackup(buildUserDataBackup({
      maintenanceSettings: null,
      maintenanceClusterAssignments: [],
      maintenanceWindows: [],
      scenarios: [],
      vmScopeSettings: { vmPowerScope: "poweredOn", excludeVclsVms: true, excludeDummyVms: true },
    }));

    expect(result.vmScopeSettingsImported).toBe(true);
    expect(getStoredVmScopeSettings()).toEqual({ vmPowerScope: "poweredOn", excludeVclsVms: true, excludeDummyVms: true });
  });

  it("exportiert und importiert die persönliche Tech-Info-Organisationsansicht", async () => {
    const { getUiState, putUiState } = await import("@/data/db");
    const { applyUserDataBackup, collectUserDataBackup } = await import("@/domain/services/backupService");
    await putUiState({ id: "tech-info-organisation", theme: "dark", techInfoOrganisationTablePreferences });

    const collected = await collectUserDataBackup();
    expect(collected.techInfoOrganisationTablePreferences).toEqual(techInfoOrganisationTablePreferences);

    const imported = { ...techInfoOrganisationTablePreferences, sorting: [{ id: "server", desc: true }] };
    const result = await applyUserDataBackup(buildUserDataBackup({
      maintenanceSettings: null,
      maintenanceClusterAssignments: [],
      maintenanceWindows: [],
      scenarios: [],
      techInfoOrganisationTablePreferences: imported,
    }));

    expect(result.techInfoOrganisationTablePreferencesImported).toBe(true);
    expect((await getUiState("tech-info-organisation"))?.techInfoOrganisationTablePreferences).toEqual(imported);
  });

  it("exportiert und importiert die generische Zuordnung aller Tabellenansichten", async () => {
    const { getUiState, putUiState } = await import("@/data/db");
    const { applyUserDataBackup, collectUserDataBackup } = await import("@/domain/services/backupService");
    await putUiState({ id: "table-display-preferences", theme: "dark", tableDisplayPreferences });

    const collected = await collectUserDataBackup();
    expect(collected.tableDisplayPreferences).toEqual(tableDisplayPreferences);

    const imported = {
      "vms/inventory": {
        columnVisibility: { host: false },
        columnOrder: ["vm", "host"],
        sorting: [{ id: "vm", desc: true }],
      },
    };
    const result = await applyUserDataBackup(buildUserDataBackup({
      maintenanceSettings: null,
      maintenanceClusterAssignments: [],
      maintenanceWindows: [],
      scenarios: [],
      tableDisplayPreferences: imported,
    }));

    expect(result.tableDisplayPreferencesImported).toBe(true);
    // Merge statt Ersetzen: lokale Ansichten, die das Backup nicht kennt, überleben den Import.
    expect((await getUiState("table-display-preferences"))?.tableDisplayPreferences).toEqual({
      ...tableDisplayPreferences,
      ...imported,
    });
  });

  it("validates invalid maintenance-window batches before writing other backup data", async () => {
    const {
      getMaintenanceAssignments,
      getMaintenanceSettings,
      getMaintenanceWindows,
      getScenarios,
    } = await import("@/data/db");
    const { applyUserDataBackup } = await import("@/domain/services/backupService");

    await expect(applyUserDataBackup(buildUserDataBackup({
      maintenanceSettings: settings,
      maintenanceClusterAssignments: [assignment],
      maintenanceWindows: [
        makeMaintenanceWindow("MW A", { id: "same-id" }),
        makeMaintenanceWindow("MW B", { id: "same-id" }),
      ],
      scenarios: [scenario],
    }))).rejects.toThrow("ID ist mehrfach enthalten");

    await expect(getMaintenanceSettings()).resolves.toBeUndefined();
    await expect(getMaintenanceAssignments()).resolves.toEqual([]);
    await expect(getMaintenanceWindows()).resolves.toEqual([]);
    await expect(getScenarios()).resolves.toEqual([]);
  });

  it("deleteUserData löscht sowohl die gesicherten IndexedDB-Stores als auch die lokalen VM-Scope-Vorgaben", async () => {
    const { getMaintenanceSettings, getScenarios, getVcenterGroups, putScenario, putVcenterGroup, putMaintenanceSettings } = await import("@/data/db");
    const { deleteUserData } = await import("@/domain/services/backupService");
    const { DEFAULT_VM_SCOPE_SETTINGS, getStoredVmScopeSettings, saveVmScopeSettings } = await import("@/lib/vmScopeSettings");

    await putMaintenanceSettings(settings);
    await putScenario(scenario);
    await putVcenterGroup(vcenterGroup);
    saveVmScopeSettings({ vmPowerScope: "all", excludeVclsVms: false, excludeDummyVms: false });

    await deleteUserData();

    await expect(getMaintenanceSettings()).resolves.toBeUndefined();
    await expect(getScenarios()).resolves.toEqual([]);
    await expect(getVcenterGroups()).resolves.toEqual([]);
    expect(getStoredVmScopeSettings()).toEqual(DEFAULT_VM_SCOPE_SETTINGS);
  });
});

describe("buildBackupFileName", () => {
  it("erzeugt einen Dateinamen mit Datumsstempel", () => {
    expect(buildBackupFileName(new Date(2026, 6, 3))).toBe("rvtools-analyzer-backup-2026-07-03.json");
    expect(buildBackupFileName(new Date(2026, 0, 9))).toBe("rvtools-analyzer-backup-2026-01-09.json");
  });
});
