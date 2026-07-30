import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DiagnosticsPanel } from "@/components/uploads/DiagnosticsPanel";

vi.mock("@/hooks/useDiagnostics", () => ({
  useDiagnostics: () => ({
    data: {
      snapshots: [{
        snapshotId: "snap-1",
        fileName: "rvtools.xlsx",
        fileSizeBytes: 1024,
        importDurationMs: 1000,
        sheetStats: {},
      }],
      stores: [
        { storeName: "entities_vms", count: 12, estimatedSizeBytes: 2048 },
        { storeName: "entities_hosts", count: 3, estimatedSizeBytes: 1024 },
      ],
      storage: { supported: true, usageBytes: 4096, quotaBytes: 8192 },
      sampleQuery: { rowCount: 12, durationMs: 4 },
      memory: { supported: false, usedJSHeapSizeBytes: null as number | null, totalJSHeapSizeBytes: null as number | null },
      cache: [{ queryKey: "vms", entryCount: 12 }, { queryKey: "hosts", entryCount: 3 }],
      queryTimings: [] as Array<{ queryKey: string; lastDurationMs: number; avgDurationMs: number; lastRowCount: number; sampleCount: number }>,
    },
    isFetching: false,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/components/dashboard/KpiCard", () => ({
  KpiCard: ({ title }: { title: string }) => <div data-testid="diagnostics-kpi">{title}</div>,
}));
vi.mock("@/components/dashboard/KpiGrid", () => ({
  KpiGrid: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe("DiagnosticsPanel", () => {
  it("zeigt sechs Diagnose-KPIs", () => {
    render(<DiagnosticsPanel />);

    expect(screen.getAllByTestId("diagnostics-kpi").map((card) => card.textContent)).toEqual([
      "Snapshots",
      "IndexedDB-Einträge",
      "Speicher belegt",
      "Daten-Stores",
      "Query-Cache",
      "Messungen",
    ]);
  });
});
