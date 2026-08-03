import { describe, expect, it } from "vitest";
import type { NormalizedVm, SnapshotMeta, TechInfoImportMeta, TechInfoLatest, TechInfoRow } from "@/domain/models/types";
import { validateAndMergeSysvPackages } from "@/domain/services/sysvPackageMergeService";
import { serializeSysvDataPackage, zipSysvDataPackage, type SysvDataPackagePayload } from "@/lib/export/sysvDataPackageFormat";
import type { DiscoveredSysvPackage } from "@/lib/export/sysvDataPackageContainer";

function vm(snapshotId: string, vmName: string): NormalizedVm {
  return {
    snapshotId,
    vcenterId: "vcenter-1",
    vmKey: `vcenter-1::${vmName}`,
    vmName,
  } as NormalizedVm;
}

function packagePayload(packageId: string, snapshotId: string, vmName: string): SysvDataPackagePayload {
  const scope = { kind: "person" as const, displayName: packageId, normalizedName: packageId.toLocaleLowerCase("de-DE") };
  const snapshot: SnapshotMeta = {
    snapshotId,
    vcenterId: "vcenter-1",
    vcenterDisplayName: "vCenter 1",
    exportTs: "2026-08-03T00:00:00.000Z",
    importedAt: "2026-08-03T00:00:00.000Z",
    fileName: `${packageId}.xlsx`,
    fileChecksum: packageId,
    sheetStats: { vInfo: { rowCount: 1, columnCount: 1 } },
    restrictedDataset: {
      kind: "sysv-package",
      packageId,
      packageVersion: 1,
      scopeKind: scope.kind,
      scopeLabel: scope.displayName,
      dataPolicy: "strict-vm-scope-v1",
      sharedCapacityContext: true,
    },
  };
  const importMeta: TechInfoImportMeta = {
    techInfoImportId: `sysv-package:${packageId}:tech-info`,
    importedAt: "2026-08-03T00:00:00.000Z",
    fileName: `${packageId}-tech-info`,
    fileChecksum: packageId,
    sheetName: "Tech-Info",
    rowCount: 1,
    columnCount: 1,
  };
  const row: TechInfoRow = {
    techInfoImportId: importMeta.techInfoImportId,
    rowIndex: 0,
    vmName,
    vmNameNorm: vmName.toLocaleLowerCase("de-DE"),
    importedAt: importMeta.importedAt,
    rawData: { VM: vmName },
  };
  const latest: TechInfoLatest = {
    vmName,
    vmNameNorm: row.vmNameNorm,
    importedAt: row.importedAt,
    techInfoImportId: row.techInfoImportId,
    rowIndex: 0,
  } as TechInfoLatest;
  return {
    snapshots: [snapshot],
    rawSheets: [{ snapshotId, sheetName: "vInfo", headers: ["VM"], values: [[vmName]] }],
    vms: [vm(snapshotId, vmName)],
    hosts: [],
    clusters: [],
    datastores: [],
    snapshotsEntities: [],
    health: [],
    techInfo: { importMeta, rows: [row], latest: [latest] },
  };
}

async function discovered(packageId: string, snapshotId: string, vmName: string): Promise<DiscoveredSysvPackage> {
  const payload = packagePayload(packageId, snapshotId, vmName);
  const serialized = await serializeSysvDataPackage(payload, {
    packageId,
    createdAt: "2026-08-03T00:00:00.000Z",
    scope: { kind: "person", displayName: packageId, normalizedName: packageId.toLocaleLowerCase("de-DE") },
  });
  const bytes = await zipSysvDataPackage(serialized.files);
  return { path: `${packageId}.zip`, bytes, manifest: serialized.manifest };
}

describe("SysV-Paketvereinigung", () => {
  it("vereinigt Pakete ohne doppelte VMs, Raw-Zeilen oder Herkunftsquellen zu verlieren", async () => {
    const first = await discovered("Anna", "snapshot-1", "vm-a");
    const second = await discovered("Berta", "snapshot-1", "vm-b");
    const merged = await validateAndMergeSysvPackages([first, second]);

    expect(merged.payload.vms.map((item) => item.vmName)).toEqual(["vm-a", "vm-b"]);
    expect(merged.payload.rawSheets[0].values).toEqual([["vm-a"], ["vm-b"]]);
    expect(merged.payload.techInfo.rows).toHaveLength(2);
    expect(merged.payload.techInfo.latest).toHaveLength(2);
    expect(merged.payload.snapshots[0].restrictedDatasetSources?.map((source) => source.scopeLabel)).toEqual(["Anna", "Berta"]);
    expect(merged.payload.vms.map((item) => item.sysvPackageScopes)).toEqual([["Anna"], ["Berta"]]);
    expect(merged.importedPackages).toHaveLength(2);
  });

  it("lehnt unterschiedliche Snapshot-Generationen desselben vCenters vor dem Merge ab", async () => {
    const first = await discovered("Anna", "snapshot-1", "vm-a");
    const second = await discovered("Berta", "snapshot-2", "vm-b");

    await expect(validateAndMergeSysvPackages([first, second])).rejects.toThrow("unterschiedlichen Exportläufen");
  });
});
