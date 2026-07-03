import { describe, expect, it } from "vitest";
import {
  buildBackupFileName,
  buildUserDataBackup,
  parseUserDataBackup,
  serializeUserDataBackup,
  USER_DATA_BACKUP_KIND,
  USER_DATA_BACKUP_VERSION,
} from "@/lib/backup/userDataBackup";
import type { MaintenanceClusterAssignment, MaintenanceSettings, Scenario } from "@/domain/models/types";

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
      scenarios: [scenario],
      exportedAt: new Date("2026-07-03T12:00:00.000Z"),
    });

    const parsed = parseUserDataBackup(serializeUserDataBackup(backup));

    expect(parsed.kind).toBe(USER_DATA_BACKUP_KIND);
    expect(parsed.version).toBe(USER_DATA_BACKUP_VERSION);
    expect(parsed.exportedAt).toBe("2026-07-03T12:00:00.000Z");
    expect(parsed.maintenanceSettings).toEqual(settings);
    expect(parsed.maintenanceClusterAssignments).toEqual([assignment]);
    expect(parsed.scenarios).toEqual([scenario]);
  });

  it("kommt mit leerem Datenbestand zurecht", () => {
    const backup = buildUserDataBackup({
      maintenanceSettings: null,
      maintenanceClusterAssignments: [],
      scenarios: [],
    });

    const parsed = parseUserDataBackup(serializeUserDataBackup(backup));

    expect(parsed.maintenanceSettings).toBeNull();
    expect(parsed.maintenanceClusterAssignments).toEqual([]);
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

describe("buildBackupFileName", () => {
  it("erzeugt einen Dateinamen mit Datumsstempel", () => {
    expect(buildBackupFileName(new Date(2026, 6, 3))).toBe("rvtools-analyzer-backup-2026-07-03.json");
    expect(buildBackupFileName(new Date(2026, 0, 9))).toBe("rvtools-analyzer-backup-2026-01-09.json");
  });
});
