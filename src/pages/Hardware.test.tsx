import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";
import type { HardwareModelGroup } from "@/lib/hardwareVariants";
import type { HostDetail } from "@/lib/conversion";
import * as HardwareModule from "./Hardware";

type VariantDetailDialogProps = {
  group: HardwareModelGroup | null;
  open: boolean;
  onClose: () => void;
  onSelectHost: () => void;
};

type ModelCardProps = {
  group: HardwareModelGroup;
  onSelect: (host: HostDetail) => void;
  onSelectCluster: (host: HostDetail) => void;
};

const clusterHost: HostDetail = {
  host: "esx01.lab.local", datacenter: "DC1", cluster: "Production", model: "PowerEdge R750", vendor: "Dell Inc.",
  serial: "", cpuModel: "Intel Xeon Gold", cpuSockets: 2, coresPerCpu: 24, totalCores: 48, threads: 96,
  speedMHz: 2200, memoryMiB: 524288, esxVersion: "8.0", biosVendor: "", biosVersion: "", biosDate: "",
  vmCount: 12, nicCount: 4, hbaCount: 2, htActive: true, maintenanceMode: false, serviceTag: "",
};

const group: HardwareModelGroup = {
  signature: "dell|r750",
  modelLabel: "PowerEdge R750",
  models: ["PowerEdge R750"],
  vendor: "Dell Inc.",
  cpuModel: "Intel Xeon Gold",
  cpuSockets: 2,
  coresPerCpu: 24,
  totalCores: 48,
  speedMHz: 2200,
  memoryMiB: 524288,
  memoryValuesMiB: [524288],
  hosts: [clusterHost],
  count: 1,
};

describe("VariantDetailDialog", () => {
  it("offers copying variant details as Markdown", () => {
    const VariantDetailDialog = (HardwareModule as unknown as {
      VariantDetailDialog?: ComponentType<VariantDetailDialogProps>;
    }).VariantDetailDialog;

    expect(VariantDetailDialog).toBeDefined();
    if (!VariantDetailDialog) return;

    render(
      <VariantDetailDialog
        group={group}
        open
        onClose={vi.fn()}
        onSelectHost={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Varianten-Details als Markdown kopieren" })).toBeInTheDocument();
  });

  it("öffnet die Cluster-Detailansicht über einen Cluster-Chip", () => {
    const ModelCard = (HardwareModule as unknown as {
      ModelCard?: ComponentType<ModelCardProps>;
    }).ModelCard;

    expect(ModelCard).toBeDefined();
    if (!ModelCard) return;

    const onSelectCluster = vi.fn();
    render(<ModelCard group={group} onSelect={vi.fn()} onSelectCluster={onSelectCluster} />);

    fireEvent.click(screen.getByRole("button", { name: "Cluster Production öffnen" }));

    expect(onSelectCluster).toHaveBeenCalledWith(clusterHost);
  });
});
