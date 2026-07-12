import { describe, expect, it } from "vitest";
import { buildHostClusterDistribution } from "@/lib/hostClusterDistribution";

describe("buildHostClusterDistribution", () => {
  it("groups clusters by their number of assigned hosts", () => {
    const distribution = buildHostClusterDistribution([
      { cluster: "Prod-A" },
      { cluster: "Prod-A" },
      { cluster: "Prod-B" },
      { cluster: "Prod-B" },
      { cluster: "Prod-C" },
      { cluster: "Prod-C" },
      { cluster: "Prod-D" },
      { cluster: "Prod-E" },
      { cluster: "Prod-E" },
      { cluster: "Prod-E" },
      { cluster: "Prod-E" },
      { cluster: null },
    ]);

    expect(distribution).toEqual([
      { hostCount: 1, clusterCount: 1 },
      { hostCount: 2, clusterCount: 3 },
      { hostCount: 4, clusterCount: 1 },
    ]);
  });
});
