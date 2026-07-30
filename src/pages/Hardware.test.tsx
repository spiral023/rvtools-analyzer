import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";
import type { HardwareModelGroup } from "@/lib/hardwareVariants";
import type { HostDetail } from "@/lib/conversion";
import type { NormalizedCluster, NormalizedHost, NormalizedVm } from "@/domain/models/types";
import { findClusterForHost } from "@/lib/hardwareClusterSelection";
import { HostDetailDialog } from "./Hardware";
import * as HardwareModule from "./Hardware";

type VariantDetailDialogProps = {
  group: HardwareModelGroup | null;
  open: boolean;
  onClose: () => void;
  onSelectHost: () => void;
  onSelectCluster: (host: HostDetail) => void;
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
        onSelectCluster={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Varianten-Details als Markdown kopieren" })).toBeInTheDocument();
  });

  it("öffnet die Cluster-Detailansicht beim Klick auf eine Cluster-Zeile in der Varianten-Detailansicht", () => {
    const VariantDetailDialog = (HardwareModule as unknown as {
      VariantDetailDialog?: ComponentType<VariantDetailDialogProps>;
    }).VariantDetailDialog;

    expect(VariantDetailDialog).toBeDefined();
    if (!VariantDetailDialog) return;

    const onSelectCluster = vi.fn();
    render(
      <VariantDetailDialog
        group={group}
        open
        onClose={vi.fn()}
        onSelectHost={vi.fn()}
        onSelectCluster={onSelectCluster}
      />,
    );

    fireEvent.click(screen.getAllByText("Production")[0]);

    expect(onSelectCluster).toHaveBeenCalledWith(clusterHost);
  });

  it("öffnet die Cluster-Detailansicht beim Klick auf das Cluster-Label eines Hosts (statt die Host-Ansicht)", () => {
    const VariantDetailDialog = (HardwareModule as unknown as {
      VariantDetailDialog?: ComponentType<VariantDetailDialogProps>;
    }).VariantDetailDialog;

    expect(VariantDetailDialog).toBeDefined();
    if (!VariantDetailDialog) return;

    const onSelectCluster = vi.fn();
    const onSelectHost = vi.fn();
    render(
      <VariantDetailDialog
        group={group}
        open
        onClose={vi.fn()}
        onSelectHost={onSelectHost}
        onSelectCluster={onSelectCluster}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cluster Production öffnen" }));

    expect(onSelectCluster).toHaveBeenCalledWith(clusterHost);
    expect(onSelectHost).not.toHaveBeenCalled();
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

describe("findClusterForHost", () => {
  it("öffnet den Cluster auch wenn sein vCluster-Datensatz kein Datacenter enthält", () => {
    const normalizedHost: NormalizedHost = {
      snapshotId: "snap-1", vcenterId: "vc-1", hostKey: "host-1", host: clusterHost.host,
      cluster: clusterHost.cluster, datacenter: "DC1", cpuModel: null, cpuTotalMHz: null,
      cpuCores: null, cpuThreads: null, memoryTotalMiB: null, version: null, build: null,
      vendor: null, model: null, connectionState: null, powerState: null, maintenanceMode: null,
      vmCount: null,
    };
    const cluster: NormalizedCluster = {
      snapshotId: "snap-1", vcenterId: "vc-1", clusterKey: "vc-1\\u0000\\u0000Production",
      name: "Production", datacenter: null, haEnabled: null, drsEnabled: null, numHosts: null,
      numCpuCores: null, numCpuThreads: null, totalMemoryMiB: null, totalCpuMHz: null,
      numEffectiveHosts: null,
    };

    expect(findClusterForHost(clusterHost, [normalizedHost], [cluster])).toBe(cluster);
  });
});

describe("HostDetailDialog", () => {
  const runningVm: NormalizedVm = {
    snapshotId: "snap-1", vcenterId: "vc-1", vmKey: "vm-1", vmUuid: "uuid-1", vmName: "APP-01",
    cluster: "Production", host: "esx01.lab.local", powerState: "poweredOn", cpuCount: 4, memoryMiB: 8192,
    provisionedMiB: null, inUseMiB: null, configStatus: null, connectionState: null, consolidationNeeded: null,
    osConfig: null, osTools: null, hwVersion: null, toolsStatus: null, toolsVersion: null, datacenter: null,
    folder: null, resourcePool: null, annotation: null, cpuReady: null, firmware: null, efiSecureBoot: null, cbt: null,
  };

  it("ruft onVmClick beim Klick auf eine VM-Zeile in der Host-Detailansicht auf", () => {
    const onVmClick = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <HostDetailDialog
          host={clusterHost}
          hbaRows={[]}
          nicRows={[]}
          vmRows={[runningVm]}
          open
          onClose={vi.fn()}
          onVmClick={onVmClick}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByText("APP-01"));

    expect(onVmClick).toHaveBeenCalledWith(runningVm);
  });
});
