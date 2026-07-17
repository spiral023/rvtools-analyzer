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
} from "@/domain/models/types";

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

describe("buildUserDataBackup / serialize / parse roundtrip", () => {
  it("erhält alle Benutzerdaten über einen Export/Import-Zyklus", () => {
    const backup = buildUserDataBackup({
      maintenanceSettings: settings,
      maintenanceClusterAssignments: [assignment],
      maintenanceWindows: [makeMaintenanceWindow()],
      scenarios: [scenario],
      exportedAt: new Date("2026-07-03T12:00:00.000Z"),
    });

    const parsed = parseUserDataBackup(serializeUserDataBackup(backup));

    expect(parsed.kind).toBe(USER_DATA_BACKUP_KIND);
    expect(parsed.version).toBe(USER_DATA_BACKUP_VERSION);
    expect(parsed.exportedAt).toBe("2026-07-03T12:00:00.000Z");
    expect(parsed.maintenanceSettings).toEqual(settings);
    expect(parsed.maintenanceClusterAssignments).toEqual([assignment]);
    expect(parsed.maintenanceWindows).toEqual([makeMaintenanceWindow()]);
    expect(parsed.scenarios).toEqual([scenario]);
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

    expect(parsed.version).toBe(2);
    expect(parsed.maintenanceWindows).toEqual([]);
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
});

describe("buildBackupFileName", () => {
  it("erzeugt einen Dateinamen mit Datumsstempel", () => {
    expect(buildBackupFileName(new Date(2026, 6, 3))).toBe("rvtools-analyzer-backup-2026-07-03.json");
    expect(buildBackupFileName(new Date(2026, 0, 9))).toBe("rvtools-analyzer-backup-2026-01-09.json");
  });
});
