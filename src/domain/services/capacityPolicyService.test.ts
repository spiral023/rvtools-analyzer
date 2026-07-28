import { describe, expect, it } from "vitest";
import { evaluateCapacityFindings, hasBlockingCapacityFinding } from "./capacityFindingEngine";
import {
  createCapacityPolicyAssignment,
  createInitialCapacityPolicies,
  createNextCapacityPolicyVersion,
  getCapacityStatus,
  getLatestCapacityPolicies,
  getPolicyThreshold,
  resolveEffectiveCapacityPolicy,
  validateCapacityPolicy,
} from "./capacityPolicyService";

describe("CapacityPolicy-Service", () => {
  it("liefert alle spezifizierten Basisprofile mit versionierten Defaultwerten", () => {
    const policies = createInitialCapacityPolicies("2026-07-28T10:00:00.000Z");

    expect(policies).toHaveLength(10);
    expect(policies.find((policy) => policy.id === "realtime-telephony")).toMatchObject({ name: "Realtime/Telefonie", version: 1, maxVcpuPerCoreNormal: 2 });
    expect(policies.find((policy) => policy.id === "vdi")).toMatchObject({ maxVcpuPerCoreNormal: 6 });
  });

  it("erzeugt eine neue unveränderliche Version und wendet Cluster-Overrides erst danach an", () => {
    const base = createInitialCapacityPolicies("2026-07-28T10:00:00.000Z").find((policy) => policy.id === "standard-server-windows")!;
    const version2 = createNextCapacityPolicyVersion(base, { cpuSafetyBufferPct: 12 }, "2026-07-29T10:00:00.000Z");
    const effective = resolveEffectiveCapacityPolicy([base, version2], {
      vcenterId: "vc-1", clusterKey: "cluster-1", clusterName: "Cluster 1", policyId: base.id,
      overrides: { maxSingleVmHostRamPct: 40 }, updatedAt: "2026-07-29T10:01:00.000Z",
    });

    expect(base.version).toBe(1);
    expect(getLatestCapacityPolicies([base, version2])).toEqual([version2]);
    expect(effective).toMatchObject({ version: 2, cpuSafetyBufferPct: 12, maxSingleVmHostRamPct: 40 });
  });

  it("erstellt vCenter-eindeutige Basisprofil-Zuweisungen und bewahrt Overrides", () => {
    expect(createCapacityPolicyAssignment(
      { vcenterId: "vc-1", clusterKey: "cluster-1", clusterName: "CL-Prod" },
      "sap",
      { cpuSafetyBufferPct: 15 },
      "2026-07-28T12:00:00.000Z",
    )).toEqual({
      vcenterId: "vc-1",
      clusterKey: "cluster-1",
      clusterName: "CL-Prod",
      policyId: "sap",
      overrides: { cpuSafetyBufferPct: 15 },
      updatedAt: "2026-07-28T12:00:00.000Z",
    });
  });

  it("validiert Guardrails und bewertet Warn- und Danger-Grenzen inklusiv", () => {
    const policy = createInitialCapacityPolicies().find((candidate) => candidate.id === "standard-server-windows")!;
    const invalid = { ...policy, cpuReadyWarnPct: 10, cpuReadyDangerPct: 5 };

    expect(validateCapacityPolicy(invalid)).toContainEqual(expect.stringContaining("CPU Ready"));
    expect(getCapacityStatus(80, { warning: 70, danger: 80, unit: "%" })).toBe("red");
    expect(getCapacityStatus(70, { warning: 70, danger: 80, unit: "%" })).toBe("yellow");
    expect(getCapacityStatus(69.9, { warning: 70, danger: 80, unit: "%" })).toBe("green");
    expect(getPolicyThreshold(policy, "cpu-demand", "n1")).toEqual({ warning: 70, danger: 80, unit: "%" });
  });

  it("erzeugt nachvollziehbare Findings mit Policy-Version, Quelle, Szenario und Vertrauen", () => {
    const policy = createInitialCapacityPolicies()[0];
    const findings = evaluateCapacityFindings(policy, [{
      key: "cpu-demand", label: "CPU Demand", value: 80,
      threshold: { warning: 70, danger: 80, unit: "%" }, scenario: "n1",
      dataSource: "Cluster|CPU|Demand|Avg", affectedObjectKeys: ["cluster:prod", "cluster:prod"],
    }], "medium");

    expect(findings).toEqual([expect.objectContaining({ status: "red", policyId: policy.id, policyVersion: 1, scenario: "n1", dataSource: "Cluster|CPU|Demand|Avg", affectedObjectKeys: ["cluster:prod"], confidence: "medium" })]);
    expect(hasBlockingCapacityFinding(findings)).toBe(true);
  });
});
