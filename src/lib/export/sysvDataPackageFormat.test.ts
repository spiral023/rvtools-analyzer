import { describe, expect, it } from "vitest";
import type {
  NormalizedVm,
  SnapshotMeta,
  TechInfoImportMeta,
  TechInfoLatest,
  TechInfoRow,
} from "@/domain/models/types";
import {
  inspectSysvDataPackageFile,
  serializeSysvDataPackage,
  validateSysvDataPackageEntries,
  validateSysvDataPackageZip,
  zipSysvDataPackage,
  type SysvDataPackagePayload,
} from "@/lib/export/sysvDataPackageFormat";

const snapshot: SnapshotMeta = {
  snapshotId: "snapshot-1",
  vcenterId: "vcenter-1",
  vcenterDisplayName: "vCenter 1",
  exportTs: "2026-08-03T00:00:00.000Z",
  importedAt: "2026-08-03T00:00:00.000Z",
  fileName: "RVTools_export_all_vcenter.xlsx",
  fileChecksum: "checksum",
  sheetStats: { vInfo: { rowCount: 1, columnCount: 1 } },
  restrictedDataset: {
    kind: "sysv-package",
    packageId: "package-1",
    packageVersion: 1,
    scopeKind: "area",
    scopeLabel: "ALPHA/WEB",
    dataPolicy: "strict-vm-scope-v1",
    sharedCapacityContext: true,
  },
};

const vm = {
  snapshotId: "snapshot-1",
  vcenterId: "vcenter-1",
  vmKey: "vcenter-1::vm-a",
  vmUuid: null,
  vmName: "vm-a",
  cluster: null,
  host: null,
  powerState: "poweredOn",
  cpuCount: 2,
  memoryMiB: 1024,
} as NormalizedVm;

const techInfoImport: TechInfoImportMeta = {
  techInfoImportId: "sysv-package:package-1:tech-info",
  importedAt: "2026-08-03T00:00:00.000Z",
  fileName: "sysv-package:package-1",
  fileChecksum: "package-1",
  sheetName: "Tech-Info",
  rowCount: 1,
  columnCount: 2,
};

const techInfoRow: TechInfoRow = {
  techInfoImportId: techInfoImport.techInfoImportId,
  rowIndex: 0,
  vmName: "vm-a",
  vmNameNorm: "vm-a",
  importedAt: "2026-08-03T00:00:00.000Z",
  rawData: { VM: "vm-a", SysV: "Anna Beispiel" },
};

const techInfoLatest: TechInfoLatest = {
  vmNameNorm: "vm-a",
  vmName: "vm-a",
  importedAt: "2026-08-03T00:00:00.000Z",
  techInfoImportId: techInfoImport.techInfoImportId,
  rowIndex: 0,
  serverType: null,
  maintenanceWindow: null,
  operatingSystem: null,
  comment: null,
  sysv: "Anna Beispiel",
  sysvDepartment: "ALPHA/WEB-UNIX",
  sysvDeputy: null,
  sysvDeputyDepartment: null,
  bz: null,
  clusterFromTechInfo: null,
  cvBackup: null,
  az: null,
};

function payload(): SysvDataPackagePayload {
  return {
    snapshots: [snapshot],
    rawSheets: [{ snapshotId: "snapshot-1", sheetName: "vInfo", headers: ["VM"], values: [["vm-a"]] }],
    vms: [vm],
    hosts: [],
    clusters: [],
    datastores: [],
    snapshotsEntities: [],
    health: [],
    techInfo: { importMeta: techInfoImport, rows: [techInfoRow], latest: [techInfoLatest] },
  };
}

/** Setzt die deklarierte Zielgröße des ersten Zentraldirectory-Eintrags, ohne die Daten zu ändern. */
function patchDeclaredUncompressedSize(zipBytes: Uint8Array, value: number): Uint8Array {
  const bytes = new Uint8Array(zipBytes);
  const view = new DataView(bytes.buffer);
  let eocdOffset = -1;
  for (let offset = bytes.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("ZIP-Ende im Testarchiv nicht gefunden.");
  view.setUint32(view.getUint32(eocdOffset + 16, true) + 24, value, true);
  return bytes;
}

describe("SysV-Datenpaket-Format", () => {
  it("serialisiert ein Paket und validiert es nach ZIP-Roundtrip vollständig", async () => {
    const serialized = await serializeSysvDataPackage(payload(), {
      packageId: "package-1",
      createdAt: "2026-08-03T00:00:00.000Z",
      appVersion: "test",
      scope: {
        kind: "area",
        displayName: "ALPHA/WEB",
        normalizedOrganisation: "alpha",
        normalizedArea: "web",
      },
    });
    const zipBytes = await zipSysvDataPackage(serialized.files);
    const validated = await validateSysvDataPackageZip(zipBytes);

    expect(serialized.manifest.files.map((file) => file.path)).toContain("modus.json");
    expect(validated.manifest.packageId).toBe("package-1");
    expect(validated.payload.vms.map((item) => item.vmName)).toEqual(["vm-a"]);
    expect(validated.payload.techInfo.latest[0]).toMatchObject({ techInfoImportId: techInfoImport.techInfoImportId, rowIndex: 0 });
    expect(validated.rawSheetBlobs[0]).toMatchObject({ snapshotId: "snapshot-1", sheetName: "vInfo", rowCount: 1, codec: "gzip-json-v1" });
    const fileLike = { arrayBuffer: async () => zipBytes } as unknown as File;
    await expect(inspectSysvDataPackageFile(fileLike)).resolves.toBe(true);
  });

  it("lehnt nicht im Manifest aufgeführte oder manipulierte Dateien ab", async () => {
    const serialized = await serializeSysvDataPackage(payload(), {
      packageId: "package-1",
      createdAt: "2026-08-03T00:00:00.000Z",
      scope: { kind: "person", displayName: "Anna Beispiel", normalizedName: "anna beispiel" },
    });
    const extra = { ...serialized.files, "unexpected.json": new TextEncoder().encode("foreign") };
    await expect(validateSysvDataPackageEntries(extra)).rejects.toThrow(/Unerwartete Datei/);

    const tampered = { ...serialized.files, "modus.json": new TextEncoder().encode("{}").slice() };
    await expect(validateSysvDataPackageEntries(tampered)).rejects.toThrow(/Bytezahl|Prüfsumme/);
  });

  it("lehnt überdimensionierte Archive anhand der Zentraldirectory ab, bevor entpackt wird", async () => {
    const serialized = await serializeSysvDataPackage(payload(), {
      packageId: "package-1",
      createdAt: "2026-08-03T00:00:00.000Z",
      scope: { kind: "person", displayName: "Anna Beispiel", normalizedName: "anna beispiel" },
    });
    const zipBytes = await zipSysvDataPackage(serialized.files);

    // 0xfffffffe liegt über dem Entpack-Limit, 0xffffffff verweist auf ZIP64.
    await expect(validateSysvDataPackageZip(patchDeclaredUncompressedSize(zipBytes, 0xfffffffe)))
      .rejects.toThrow(/Größenlimit nach dem Entpacken/);
    await expect(validateSysvDataPackageZip(patchDeclaredUncompressedSize(zipBytes, 0xffffffff)))
      .rejects.toThrow(/ZIP64/);
  });
});
