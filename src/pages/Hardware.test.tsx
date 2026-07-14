import { render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";
import type { HardwareModelGroup } from "@/lib/hardwareVariants";
import * as HardwareModule from "./Hardware";

type VariantDetailDialogProps = {
  group: HardwareModelGroup | null;
  open: boolean;
  onClose: () => void;
  onSelectHost: () => void;
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
  hosts: [],
  count: 0,
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
});
