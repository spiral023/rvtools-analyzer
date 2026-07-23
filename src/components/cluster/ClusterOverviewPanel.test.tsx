import { describe, expect, it } from "vitest";
import { RISK_CHART_CLUSTER_LIMIT } from "@/components/cluster/ClusterOverviewPanel";

describe("ClusterOverviewPanel", () => {
  it("begrenzt den Risikoscore-Chart auf die zehn risikoreichsten Cluster", () => {
    expect(RISK_CHART_CLUSTER_LIMIT).toBe(10);
  });
});
