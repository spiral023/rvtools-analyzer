import { describe, expect, it } from "vitest";
import { RISK_CHART_CLUSTER_LIMIT } from "@/components/cluster/ClusterOverviewPanel";
import { vcpuPerCoreSeverityClass } from "@/lib/clusterOverview";

describe("ClusterOverviewPanel", () => {
  it("begrenzt den Risikoscore-Chart auf die zehn risikoreichsten Cluster", () => {
    expect(RISK_CHART_CLUSTER_LIMIT).toBe(10);
  });

  it("markiert vCPU/Core ab vier orange und ab fünf rot", () => {
    expect(vcpuPerCoreSeverityClass(3.99)).toBeUndefined();
    expect(vcpuPerCoreSeverityClass(4)).toBe("text-orange-400");
    expect(vcpuPerCoreSeverityClass(4.99)).toBe("text-orange-400");
    expect(vcpuPerCoreSeverityClass(5)).toBe("text-red-400");
  });
});
