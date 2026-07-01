import { describe, expect, it } from "vitest";
import type { NormalizedCluster, NormalizedDatastore, NormalizedHost, NormalizedVm } from "@/domain/models/types";
import type { HostDetail } from "@/lib/conversion";
import {
  buildClusterDetailMarkdown,
  buildHostDetailMarkdown,
  buildVmDetailMarkdown,
} from "@/lib/detailMarkdown";

const vm: NormalizedVm = {
  snapshotId: "snap-1",
  vcenterId: "vc-1",
  vmKey: "vm-1",
  vmUuid: "uuid-1",
  vmName: "APP-01",
  cluster: "Cluster-A",
  host: "esx01.local",
  powerState: "poweredOn",
  cpuCount: 4,
  memoryMiB: 8192,
  provisionedMiB: 102400,
  inUseMiB: 51200,
  configStatus: "green",
  connectionState: "connected",
  consolidationNeeded: false,
  osConfig: "Windows Server",
  osTools: "Windows Server 2022",
  hwVersion: "vmx-21",
  toolsStatus: "toolsOk",
  toolsVersion: "12345",
  datacenter: "DC1",
  folder: "Prod",
  resourcePool: "RP-App",
  annotation: null,
  cpuReady: null,
  firmware: "efi",
  efiSecureBoot: true,
  cbt: true,
};

const host: HostDetail = {
  host: "esx01.local",
  datacenter: "DC1",
  cluster: "Cluster-A",
  model: "PowerEdge R750",
  vendor: "Dell Inc.",
  serial: "SER123",
  cpuModel: "Intel Xeon Gold",
  cpuSockets: 2,
  coresPerCpu: 24,
  totalCores: 48,
  threads: 96,
  speedMHz: 2200,
  memoryMiB: 524288,
  esxVersion: "8.0.3",
  biosVendor: "Dell",
  biosVersion: "1.2.3",
  biosDate: "2025-01-01",
  vmCount: 20,
  nicCount: 4,
  hbaCount: 2,
  htActive: true,
  maintenanceMode: false,
  serviceTag: "TAG123",
};

const normalizedHost: NormalizedHost = {
  snapshotId: "snap-1",
  vcenterId: "vc-1",
  hostKey: "esx01::vc-1",
  host: "esx01.local",
  cluster: "Cluster-A",
  datacenter: "DC1",
  cpuModel: "Intel Xeon Gold",
  cpuTotalMHz: 105600,
  cpuCores: 48,
  cpuThreads: 96,
  memoryTotalMiB: 524288,
  version: "8.0.3",
  build: "24022510",
  vendor: "Dell Inc.",
  model: "PowerEdge R750",
  connectionState: "connected",
  powerState: "poweredOn",
  maintenanceMode: "False",
  vmCount: 20,
};

const cluster: NormalizedCluster = {
  snapshotId: "snap-1",
  vcenterId: "vc-1",
  clusterKey: "cluster-a::vc-1",
  name: "Cluster-A",
  datacenter: "DC1",
  haEnabled: true,
  drsEnabled: true,
  numHosts: 1,
  numCpuCores: 48,
  numCpuThreads: 96,
  totalMemoryMiB: 524288,
  totalCpuMHz: 105600,
  numEffectiveHosts: 1,
};

const datastore: NormalizedDatastore = {
  snapshotId: "snap-1",
  vcenterId: "vc-1",
  dsKey: "ds-1",
  name: "DS01",
  clusterName: "Cluster-A",
  type: "VMFS",
  capacityMiB: 1024000,
  inUseMiB: 512000,
  freeMiB: 512000,
  freePct: 50,
  version: "8",
  siocEnabled: true,
};

describe("detail markdown builders", () => {
  it("builds a readable VM detail summary", () => {
    const markdown = buildVmDetailMarkdown(vm, {
      diskRows: [{ snapshotId: "snap-1", sheetName: "vDisk", rowIndex: 1, data: { Disk: "Hard disk 1", "Capacity MiB": 102400, "Disk Mode": "persistent" } }],
      networkRows: [{ snapshotId: "snap-1", sheetName: "vNetwork", rowIndex: 1, data: { "NIC label": "Network adapter 1", Network: "VM Network", "IPv4 Address": "10.0.0.10" } }],
      snapshotRows: [],
      toolsRows: [],
    });

    expect(markdown).toContain("# VM APP-01");
    expect(markdown).toContain("| vCPU | 4 |");
    expect(markdown).toContain("| RAM | 8.0 GiB |");
    expect(markdown).toContain("## Disks");
    expect(markdown).toContain("| Hard disk 1 | 100.0 GiB | persistent |");
  });

  it("builds a host detail summary with component tables", () => {
    const markdown = buildHostDetailMarkdown(host, {
      hbas: [{ device: "vmhba0", type: "SAS", status: "online", driver: "lsi", model: "HBA", wwn: "", pci: "0000:01:00.0" }],
      nics: [{ device: "vmnic0", driver: "bnxtnet", speed: "25000", duplex: true, mac: "00:11:22:33:44:55", switchName: "vDS", uplinkPort: "Uplink 1", pci: "0000:02:00.0", wakeOn: false }],
      runningVms: [vm],
    });

    expect(markdown).toContain("# ESXi Host esx01.local");
    expect(markdown).toContain("| Modell | PowerEdge R750 |");
    expect(markdown).toContain("| RAM | 512.0 GiB |");
    expect(markdown).toContain("## Laufende VMs");
    expect(markdown).toContain("| APP-01 | poweredOn | 4 | 8.0 GiB |");
  });

  it("builds a cluster detail summary with capacity and inventory", () => {
    const markdown = buildClusterDetailMarkdown("Cluster-A", {
      clusters: [cluster],
      hosts: [normalizedHost],
      runningVms: [vm],
      datastores: [datastore],
    });

    expect(markdown).toContain("# Cluster Cluster-A");
    expect(markdown).toContain("| Hosts | 1 |");
    expect(markdown).toContain("| Total RAM | 512.0 GiB |");
    expect(markdown).toContain("## Datastores");
    expect(markdown).toContain("| DS01 | VMFS | 1000.0 GiB | 500.0 GiB | 50.0% |");
  });
});
