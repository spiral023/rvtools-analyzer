import { describe, expect, it } from "vitest";
import { clusterScopeKey, isSameCluster } from "@/lib/clusterIdentity";

describe("clusterIdentity", () => {
  it("trennt gleichnamige Cluster verschiedener vCenter", () => {
    expect(clusterScopeKey("vc-a", "DC1", "Production")).not.toBe(
      clusterScopeKey("vc-b", "DC1", "Production"),
    );
    expect(isSameCluster(
      { vcenterId: "vc-a", datacenter: "DC1", clusterName: "Production" },
      { vcenterId: "vc-b", datacenter: "DC1", clusterName: "Production" },
    )).toBe(false);
  });
});
