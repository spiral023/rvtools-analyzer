import { describe, expect, it } from "vitest";
import type { NormalizedCluster, NormalizedHost, NormalizedVm, SnapshotMeta } from "@/domain/models/types";
import { buildVropsTimeSeriesRelationships } from "./vropsRelationshipService";

const snapshots: SnapshotMeta[] = [
  { snapshotId: "snap-1", vcenterId: "vc-1", vcenterDisplayName: "VC 1", exportTs: "2026-07-21T00:00:00.000Z", importedAt: "2026-07-21T01:00:00.000Z", fileName: "rvtools.xlsx", fileChecksum: "a", sheetStats: {} },
];

function buildRelationships(overrides: {
  snapshots?: SnapshotMeta[];
  vms?: NormalizedVm[];
  hosts?: NormalizedHost[];
  clusters?: NormalizedCluster[];
  siteRules?: { id: string; siteId: string; hostNamePattern: string }[];
} = {}) {
  return buildVropsTimeSeriesRelationships({
    importId: "ts-1",
    objectNames: new Map([
      ["vm", ["vm-01"]],
      ["host", ["esxsrv1-01"]],
      ["cluster", ["cluster-01"]],
    ]),
    inventory: {
      snapshots: overrides.snapshots ?? snapshots,
      vms: overrides.vms ?? [{ snapshotId: "snap-1", vcenterId: "vc-1", vmKey: "vm-key", vmName: "VM-01", cluster: "cluster-01", host: "esxsrv1-01", resourcePool: "/Resources/HIGH", powerState: "poweredOn" } as NormalizedVm],
      hosts: overrides.hosts ?? [{ snapshotId: "snap-1", vcenterId: "vc-1", hostKey: "host-key", host: "esxsrv1-01", cluster: "cluster-01" } as NormalizedHost],
      clusters: overrides.clusters ?? [{ snapshotId: "snap-1", vcenterId: "vc-1", clusterKey: "cluster-key", name: "cluster-01" } as NormalizedCluster],
    },
    siteRules: overrides.siteRules ?? [{ id: "one", siteId: "site-1", hostNamePattern: "^esxsrv1" }],
  });
}

describe("buildVropsTimeSeriesRelationships", () => {
  it("friert eindeutige Matches inklusive VM-Status, HIGH/STD, Host und Site ein", () => {
    const result = buildRelationships();

    expect(result.issues).toEqual([]);
    expect(result.objects).toEqual(expect.arrayContaining([
      expect.objectContaining({ objectKey: "vm:vm-01", matchStatus: "matched", hostKey: "host-key", clusterKey: "cluster-key", workloadClass: "high", powerState: "poweredOn" }),
      expect.objectContaining({ objectKey: "host:esxsrv1-01", matchStatus: "matched", siteId: "site-1" }),
    ]));
  });

  it("rät bei vCenter-übergreifenden Namenskollisionen nicht", () => {
    const result = buildRelationships({
      snapshots: [...snapshots, { ...snapshots[0], snapshotId: "snap-2", vcenterId: "vc-2" }],
      vms: [
        { snapshotId: "snap-1", vcenterId: "vc-1", vmKey: "vm-1", vmName: "vm-01" } as NormalizedVm,
        { snapshotId: "snap-2", vcenterId: "vc-2", vmKey: "vm-2", vmName: "vm-01" } as NormalizedVm,
      ],
    });

    expect(result.objects.find((object) => object.objectType === "vm")).toMatchObject({ matchStatus: "ambiguous", matchMethod: "none" });
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "name-collision-across-vcenters", severity: "blocking" }));
  });

  it("meldet ungültige und nicht passende Site-Regeln strukturiert", () => {
    const result = buildRelationships({ siteRules: [{ id: "invalid", siteId: "site-x", hostNamePattern: "[" }] });

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid-site-rule", severity: "warning" }),
      expect.objectContaining({ code: "unknown-site", objectKey: "host:esxsrv1-01", severity: "blocking" }),
    ]));
  });
});
