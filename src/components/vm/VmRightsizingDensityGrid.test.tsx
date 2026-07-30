import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VmRightsizingDensityDialog } from "@/components/vm/VmRightsizingDensityDialog";
import { VmRightsizingDensityGrid, type RightsizingDensitySelection } from "@/components/vm/VmRightsizingDensityGrid";
import type { VmRightsizingCandidate, VmWorkloadProfileMetricStats } from "@/domain/models/types";
import { buildRightsizingDensityGrid } from "@/lib/rightsizingDensity";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/tables/VirtualTable", () => ({
  VirtualTable: ({
    data,
    columns,
    onRowClick,
  }: {
    data: VmRightsizingCandidate[];
    columns: Array<{ header?: unknown }>;
    onRowClick?: (row: VmRightsizingCandidate) => void;
  }) => (
    <div>
      <div>{columns.map((column) => String(column.header ?? "")).join(" | ")}</div>
      {data.map((row) => (
        <button key={row.objectKey} type="button" onClick={() => onRowClick?.(row)}>
          {row.vmName}
        </button>
      ))}
    </div>
  ),
}));

function metricStats(overrides: Partial<VmWorkloadProfileMetricStats> = {}): VmWorkloadProfileMetricStats {
  return {
    expectedSlots: 168,
    sampleCount: 168,
    coverageRatio: 1,
    average: 300,
    p50: 350,
    p95: 500,
    maximum: 700,
    ...overrides,
  };
}

function candidate(overrides: Partial<VmRightsizingCandidate> = {}): VmRightsizingCandidate {
  return {
    objectKey: "vm:vm-01",
    vmName: "vm-01",
    clusterKey: "cluster-1",
    clusterName: "Cluster A",
    hostName: "esx-01",
    vcpu: 8,
    shape: "constant",
    intensity: "moderate",
    behaviorClass: "constant-load",
    confidence: "high",
    demand: metricStats(),
    ready: metricStats({ average: 0.5, p50: 0.5, p95: 1.2, maximum: 2 }),
    mhzPerCore: 250,
    usedVcpuEquivalentP95: 2,
    usedVcpuEquivalentPeak: 2.8,
    demandBasedVcpu: 4,
    recommendationWithheldReason: null,
    recommendedVcpu: 6,
    reclaimableVcpu: 2,
    flags: { manyVcpuLowDemand: true, highCpuReady: false },
    ...overrides,
  };
}

function populatedSelection(candidateRow: VmRightsizingCandidate): RightsizingDensitySelection {
  const grid = buildRightsizingDensityGrid([candidateRow]);
  const demandRow = grid.demandBands.findIndex((band) => band.key === "25-50");
  const cell = grid.rows[demandRow].find((entry) => entry.vcpuBandKey === "5-8");
  if (!cell) throw new Error("Erwartete Rightsizing-Kachel fehlt");
  return { cell, vcpuLabel: "5–8", demandLabel: "25–50 %" };
}

describe("VmRightsizingDensityGrid", () => {
  it("öffnet belegte Kacheln per Klick mit deren VM-Schlüsseln", () => {
    const row = candidate();
    const grid = buildRightsizingDensityGrid([row]);
    const onCellClick = vi.fn();

    render(<VmRightsizingDensityGrid grid={grid} onCellClick={onCellClick} />);

    fireEvent.click(screen.getByRole("button", { name: /5–8 vCPU, 25–50 % CPU Demand P95: 1 VMs, Details öffnen/ }));

    expect(onCellClick).toHaveBeenCalledWith(expect.objectContaining({
      cell: expect.objectContaining({ candidateKeys: ["vm:vm-01"] }),
      vcpuLabel: "5–8",
      demandLabel: "25–50 %",
    }));
  });
});

describe("VmRightsizingDensityDialog", () => {
  it("zeigt die VMs einer Kachel mit den wichtigsten Rightsizing-Metriken", () => {
    const row = candidate();
    const onOpenChange = vi.fn();
    const onOpenVm = vi.fn();

    render(
      <TooltipProvider>
        <VmRightsizingDensityDialog
          selection={populatedSelection(row)}
          candidates={[row]}
          techInfoIndex={new Map([["vm-01", { sysv: "Ada Admin", sysvDepartment: "RAITEC/IN-VIA" }]])}
          onOpenChange={onOpenChange}
          onOpenVm={onOpenVm}
        />
      </TooltipProvider>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("5–8 konfigurierte vCPU · 25–50 % CPU Demand P95");
    expect(screen.getByText("vm-01")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("CPU Demand P95");
    expect(dialog).toHaveTextContent("Demand P95 %");
    expect(dialog).toHaveTextContent("Ready P95");
    expect(dialog).toHaveTextContent("Empfohlen");
    expect(dialog).toHaveTextContent("Rückgewinnbar");
    expect(dialog).toHaveTextContent("Abteilung");
    fireEvent.click(screen.getByText("vm-01"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOpenVm).toHaveBeenCalledWith(row);
  });
});
