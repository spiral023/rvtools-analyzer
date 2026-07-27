import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssignmentPanel } from "./ClusterMaintenancePanel";
import type { MaintenanceClusterRow } from "@/lib/maintenance";

const row: MaintenanceClusterRow = {
  key: "vc-1::CL-Prod",
  vcenterId: "vc-1",
  snapshotId: "snapshot-1",
  name: "CL-Prod",
  hosts: 2,
  cores: 16,
  totalCpuGhz: 48,
  totalRamMiB: 131_072,
  totalVms: 25,
  cpuAllocationPct: null,
  cpuUsagePct: null,
  ramAllocationPct: null,
  ramUsagePct: null,
  type: "Normal",
  windows: [],
  contacts: [],
  additionalEmails: [],
};

describe("AssignmentPanel", () => {
  it("speichert einen noch nicht hinzugefügten Wartungsfenster-Text", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <AssignmentPanel
        activeRow={row}
        selectedRows={[]}
        suggestions={[]}
        onSave={onSave}
        isSaving={false}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("z. B. Werktags 22:00-05:00 Uhr"), {
      target: { value: "  Freitag 22:00-02:00 Uhr  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledWith([row], expect.objectContaining({
      windows: [expect.objectContaining({ label: "Freitag 22:00-02:00 Uhr" })],
    }));
    await waitFor(() => expect(screen.getByPlaceholderText("z. B. Werktags 22:00-05:00 Uhr")).toHaveValue(""));
  });
});
