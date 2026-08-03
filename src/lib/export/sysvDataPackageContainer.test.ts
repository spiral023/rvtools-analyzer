import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import type { NormalizedVm, SnapshotMeta, TechInfoImportMeta } from "@/domain/models/types";
import { serializeSysvDataPackage, type SysvDataPackagePayload } from "@/lib/export/sysvDataPackageFormat";
import { discoverSysvPackages } from "@/lib/export/sysvDataPackageContainer";

function payload(packageId: string): SysvDataPackagePayload {
  const snapshot: SnapshotMeta = {
    snapshotId: "snapshot-1",
    vcenterId: "vcenter-1",
    vcenterDisplayName: "vCenter 1",
    exportTs: "2026-08-03T00:00:00.000Z",
    importedAt: "2026-08-03T00:00:00.000Z",
    fileName: `${packageId}.xlsx`,
    fileChecksum: packageId,
    sheetStats: {},
    restrictedDataset: {
      kind: "sysv-package",
      packageId,
      packageVersion: 1,
      scopeKind: "person",
      scopeLabel: packageId,
      dataPolicy: "strict-vm-scope-v1",
      sharedCapacityContext: true,
    },
  };
  const vm = { snapshotId: "snapshot-1", vcenterId: "vcenter-1", vmKey: `${packageId}::vm`, vmName: `${packageId}-vm` } as NormalizedVm;
  const importMeta = {
    techInfoImportId: `sysv-package:${packageId}:tech-info`,
    importedAt: "2026-08-03T00:00:00.000Z",
    fileName: packageId,
    fileChecksum: packageId,
    sheetName: "Tech-Info",
    rowCount: 0,
    columnCount: 0,
  } as TechInfoImportMeta;
  return {
    snapshots: [snapshot],
    rawSheets: [],
    vms: [vm],
    hosts: [],
    clusters: [],
    datastores: [],
    snapshotsEntities: [],
    health: [],
    techInfo: { importMeta, rows: [], latest: [] },
  };
}

async function packageBytes(packageId: string): Promise<Uint8Array<ArrayBuffer>> {
  const serialized = await serializeSysvDataPackage(payload(packageId), {
    packageId,
    createdAt: "2026-08-03T00:00:00.000Z",
    scope: { kind: "person", displayName: packageId, normalizedName: packageId.toLocaleLowerCase("de-DE") },
  });
  const { zipSysvDataPackage } = await import("@/lib/export/sysvDataPackageFormat");
  return zipSysvDataPackage(serialized.files);
}

function fileFromBytes(bytes: Uint8Array, name: string): File {
  const file = new File([bytes], name) as File & { arrayBuffer: () => Promise<ArrayBuffer> };
  file.arrayBuffer = async () => bytes.slice().buffer as ArrayBuffer;
  return file;
}

describe("SysV-Container-Discovery", () => {
  it("findet verschachtelte Blattpakete und dedupliziert dieselbe packageId", async () => {
    const leaf = await packageBytes("anna");
    const nested = zipSync({ "folder/anna.zip": leaf });
    const outer = zipSync({ "nested/container.zip": nested });

    const result = await discoverSysvPackages([
      fileFromBytes(leaf, "anna-direct.zip"),
      fileFromBytes(outer, "batch.zip"),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].manifest.packageId).toBe("anna");
    expect(result[0].path).toBe("anna-direct.zip");
  });

  it("behandelt ein ZIP ohne SysV-Manifest nicht als Datenpaket", async () => {
    const generic = zipSync({ "export/inventory.xlsx": new TextEncoder().encode("not a package") });

    await expect(discoverSysvPackages([fileFromBytes(generic, "inventory.zip")])).resolves.toEqual([]);
  });
});
