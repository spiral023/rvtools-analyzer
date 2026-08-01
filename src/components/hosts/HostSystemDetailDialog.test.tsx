import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HostSystemDetailDialog } from "@/components/hosts/HostSystemDetailDialog";
import type { NormalizedHost } from "@/domain/models/types";
import type { VropsObjectTrendPoint } from "@/hooks/useVropsObjectSeries";
import type { HostDetail } from "@/lib/conversion";

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useHosts: () => ({ data: [] as NormalizedHost[] }),
}));

vi.mock("@/hooks/useVropsObjectSeries", () => ({
  useVropsObjectSeries: () => ({
    hourly: [] as VropsObjectTrendPoint[], importedAt: null as string | null,
    cpuCapacityMHz: null as number | null, secondaryCapacity: null as number | null,
    hasImport: false, isMatched: false, isLoading: false,
  }),
}));

vi.mock("@/components/vrops/VropsTrendChart", () => ({
  VropsTrendChart: () => <div data-testid="vrops-trend" />,
}));

const host: HostDetail = {
  host: "esx-01", datacenter: "DC1", cluster: "Production", model: "PowerEdge",
  vendor: "Dell", serial: "SERIAL", cpuModel: "Xeon", cpuSockets: 2, coresPerCpu: 8,
  totalCores: 16, threads: 32, speedMHz: 2_600, memoryMiB: 131_072,
  esxVersion: "8.0", biosVendor: "Dell", biosVersion: "1.0", biosDate: "2026-01-01",
  vmCount: 0, nicCount: 0, hbaCount: 0, htActive: true, maintenanceMode: false,
  serviceTag: "SERVICE",
};

describe("HostSystemDetailDialog", () => {
  it("zeigt den Auslastungsverlauf direkt nach den KPI-Kacheln", () => {
    render(
      <HostSystemDetailDialog
        host={host}
        hbaRows={[]}
        nicRows={[]}
        vmRows={[]}
        open
        onClose={() => {}}
      />,
    );

    const kpi = screen.getByText("Betriebszustand");
    const trend = screen.getByRole("heading", { name: "Auslastung · sieben Tage" });
    const identity = screen.getByRole("heading", { name: "Identität & Lifecycle" });
    expect(kpi.compareDocumentPosition(trend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(trend.compareDocumentPosition(identity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("vrops-trend")).toBeInTheDocument();
  });
});
