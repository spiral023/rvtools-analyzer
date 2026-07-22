import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FilterProvider } from "@/hooks/useFilterState";
import { SelectionProvider } from "@/hooks/useSelection";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedCluster, NormalizedHost, NormalizedVm, Scenario, SheetRow, SnapshotMeta } from "@/domain/models/types";
import { clusterScopeKey } from "@/lib/clusterIdentity";

const snapshots: SnapshotMeta[] = [
  { snapshotId: "snap-a", vcenterId: "vc-a", vcenterDisplayName: "vcsa-a", exportTs: "2026-07-22T00:00:00.000Z", importedAt: "2026-07-22T00:00:00.000Z", fileName: "a.xlsx", fileChecksum: "a", sheetStats: {} },
  { snapshotId: "snap-b", vcenterId: "vc-b", vcenterDisplayName: "vcsa-b", exportTs: "2026-07-22T00:00:00.000Z", importedAt: "2026-07-22T00:00:00.000Z", fileName: "b.xlsx", fileChecksum: "b", sheetStats: {} },
];

const clusters: NormalizedCluster[] = snapshots.map((snapshot): NormalizedCluster => ({
  snapshotId: snapshot.snapshotId,
  vcenterId: snapshot.vcenterId,
  clusterKey: clusterScopeKey(snapshot.vcenterId, "DC1", "Production"),
  name: "Production",
  datacenter: "DC1",
  haEnabled: true,
  drsEnabled: true,
  numHosts: 1,
  numCpuCores: 8,
  numCpuThreads: 16,
  totalMemoryMiB: 64_000,
  totalCpuMHz: null,
  numEffectiveHosts: 1,
}));

const hosts: NormalizedHost[] = snapshots.flatMap((snapshot, snapshotIndex) => ["Intel Xeon Gold 6130", "Intel Xeon Gold 6240"].map((cpuModel, hostIndex): NormalizedHost => ({
  snapshotId: snapshot.snapshotId,
  vcenterId: snapshot.vcenterId,
  hostKey: `host-${snapshotIndex}-${hostIndex}`,
  host: `esx-${snapshotIndex + 1}${hostIndex + 1}`,
  cluster: "Production",
  datacenter: "DC1",
  cpuModel,
  cpuTotalMHz: null,
  cpuCores: 8,
  cpuThreads: 16,
  memoryTotalMiB: 64_000,
  version: "8.0.2",
  build: "22380479",
  vendor: null,
  model: null,
  connectionState: null,
  powerState: null,
  maintenanceMode: null,
  vmCount: null,
})));

const vms: NormalizedVm[] = snapshots.map((snapshot, index): NormalizedVm => ({
  snapshotId: snapshot.snapshotId,
  vcenterId: snapshot.vcenterId,
  vmKey: `vm-${index}`,
  vmUuid: null,
  vmName: `VM-${index + 1}`,
  cluster: "Production",
  host: `esx-0${index + 1}`,
  powerState: "poweredOn",
  cpuCount: 2,
  memoryMiB: 4_096,
  provisionedMiB: null,
  inUseMiB: null,
  configStatus: null,
  connectionState: null,
  consolidationNeeded: null,
  osConfig: "Windows Server 2022",
  osTools: "Windows Server 2022",
  hwVersion: null,
  toolsStatus: null,
  toolsVersion: null,
  datacenter: "DC1",
  folder: null,
  resourcePool: null,
  annotation: null,
  cpuReady: null,
  firmware: null,
  efiSecureBoot: null,
  cbt: null,
}));

const rawVHostRows: SheetRow[] = hosts.map((host) => ({
  snapshotId: host.snapshotId,
  sheetName: "vHost",
  rowIndex: 0,
  data: { Cluster: "Production", Datacenter: "DC1", Host: host.host, "# Cores": 8, "# Memory": 64_000, "# VMs": 1, "# vCPUs": 2 },
}));

const rawHBARows: SheetRow[] = hosts.map((host, index) => ({
  snapshotId: host.snapshotId,
  sheetName: "vHBA",
  rowIndex: index,
  data: { Host: host.host, Cluster: "Production", Device: `vmhba${index}`, Type: "FC", Driver: `lpfc-${index}`, Model: "Emulex" },
}));

const rawNICRows: SheetRow[] = hosts.map((host, index) => ({
  snapshotId: host.snapshotId,
  sheetName: "vNIC",
  rowIndex: index,
  data: { Host: host.host, Cluster: "Production", "Network Device": `vmnic${index}`, Driver: `nmlx5-${index}` },
}));

const planningScenarios: Scenario[] = [{
  id: "scenario-1",
  name: "Migration Production",
  type: "cluster-migration",
  createdAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z",
  vcenterScope: [],
  groups: [],
  notes: null,
}];

vi.mock("@/hooks/useActiveSnapshots", () => ({
  useActiveSnapshotIds: () => ({ snapshots, activeSnapshotIds: snapshots.map((snapshot) => snapshot.snapshotId), filters: { clusters: [] as string[], search: "" }, snapshotsLoading: false }),
  useClusters: () => ({ data: clusters, isLoading: false }),
  useHosts: () => ({ data: hosts, isLoading: false }),
  useVms: () => ({ vms, isLoading: false }),
  useDatastores: () => ({ data: [] as never[], isLoading: false }),
  useRawSheet: (sheetName: string) => ({
    data: sheetName === "vHost" ? rawVHostRows : sheetName === "vHBA" ? rawHBARows : sheetName === "vNIC" ? rawNICRows : [],
    isLoading: false,
  }),
  useTechInfoLatestByVmNames: () => ({ data: [] as never[], isLoading: false }),
}));

vi.mock("@/hooks/useMaintenance", () => ({
  useMaintenanceAssignments: () => ({ assignments: [] as never[], saveAssignment: vi.fn(), isSaving: false }),
  useMaintenanceSettings: () => ({ settings: { firstName: "", lastName: "", companyName: "Test GmbH" } }),
}));

vi.mock("@/hooks/useScenarios", () => ({
  useScenarios: () => ({
    scenarios: planningScenarios,
    saveScenario: vi.fn().mockResolvedValue(undefined),
    deleteScenario: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@/hooks/useWhatIf", () => ({
  useWhatIf: (): null => null,
}));

vi.mock("@/components/tables/VirtualTable", () => ({
  VirtualTable: ({ data, onRowClick }: { data: Array<Record<string, unknown>>; onRowClick?: (row: Record<string, unknown>) => void }) => (
    <div>
      {data.map((row, index) => (
        <div key={index}>
          {Object.values(row).map((value, valueIndex) => <span key={valueIndex}>{String(value)}</span>)}
          {onRowClick && <button type="button" onClick={() => onRowClick(row)}>Cluster {String(row.cluster)} öffnen</button>}
        </div>
      ))}
    </div>
  ),
}));

const { default: Clusters } = await import("@/pages/Clusters");
const { default: Wartungsankuendigung } = await import("@/pages/Wartungsankuendigung");
const { default: Planning } = await import("@/pages/Planning");

function LocationProbe() {
  const location = useLocation();
  return <output>{`${location.pathname}${location.search}`}</output>;
}

function renderClusters(initialEntry = "/clusters", includeLocation = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <FilterProvider>
          <SelectionProvider>
            <MemoryRouter initialEntries={[initialEntry]}>
              <Clusters />
              {includeLocation && <LocationProbe />}
            </MemoryRouter>
          </SelectionProvider>
        </FilterProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Clusters", () => {
  it("opens capacity from the query tab", async () => {
    renderClusters("/clusters?tab=capacity", true);

    expect(await screen.findByRole("tablist")).toHaveClass("w-full");
    const capacityTab = await screen.findByRole("tab", { name: "Kapazität" });
    expect(capacityTab).toHaveAttribute("data-state", "active");

    const planningTab = screen.getByRole("tab", { name: "Planung" });
    fireEvent.mouseDown(planningTab);
    fireEvent.click(planningTab);
    expect(screen.getByText("/clusters?tab=planning")).toBeInTheDocument();
  });

  it("renders the filtered cluster overview with separate vCenter cells", async () => {
    renderClusters();

    expect(await screen.findByRole("heading", { name: "Cluster" })).toBeInTheDocument();
    expect(screen.queryByText(/aktive Snapshots?/)).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "vCenter für Diagramme" })).toBeInTheDocument();
    expect(screen.getByText("Clusterübersicht")).toBeInTheDocument();
    expect(screen.getByText(/Betriebssysteme je Cluster/)).toBeInTheDocument();
    expect(screen.getAllByText("vcsa-a").length).toBeGreaterThan(0);
    expect(screen.getAllByText("vcsa-b").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Cluster Production öffnen" })[0]);
    expect(await screen.findByRole("dialog")).toHaveTextContent("vcsa-a · DC1");
  });

  it("opens details for a previously imported cluster with a legacy key", async () => {
    const originalKey = clusters[0]!.clusterKey;
    clusters[0]!.clusterKey = "Production::vc-a";

    try {
      renderClusters();

      await screen.findByRole("heading", { name: "Cluster" });
      fireEvent.click(screen.getAllByRole("button", { name: "Cluster Production öffnen" })[0]);

      expect(await screen.findByRole("dialog")).toHaveTextContent("vcsa-a · DC1");
    } finally {
      clusters[0]!.clusterKey = originalKey;
    }
  });

  it("shows the cluster capacity analysis in the Kapazität tab", async () => {
    renderClusters();

    const capacityTab = await screen.findByRole("tab", { name: "Kapazität" });
    fireEvent.mouseDown(capacityTab);
    fireEvent.click(capacityTab);

    expect(screen.getByText(/Cluster Capacity Health/)).toBeInTheDocument();
    expect(screen.getByText(/Cluster Overcommit/)).toBeInTheDocument();
    expect(screen.getByText(/Host Dichte/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "vCenter für Diagramme" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Nur auffällige Hosts/ })).toBeInTheDocument();
  });

  it("shows maintenance assignments in the Wartung tab", async () => {
    renderClusters();

    const maintenanceTab = await screen.findByRole("tab", { name: "Wartung" });
    fireEvent.mouseDown(maintenanceTab);
    fireEvent.click(maintenanceTab);

    expect(screen.getByText("Cluster-Zuweisungen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mail erstellen" })).toBeInTheDocument();
  });

  it("shows scenario management and What-If in the Planung tab", async () => {
    renderClusters();

    const planningTab = await screen.findByRole("tab", { name: "Planung" });
    fireEvent.mouseDown(planningTab);
    fireEvent.click(planningTab);

    expect(screen.getByRole("heading", { name: "Szenarien" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Migration Production"));
    expect(screen.getByRole("button", { name: "What-If" })).toBeInTheDocument();
  });

  it("shows vCenter-safe infrastructure inventory in the Infrastruktur tab", async () => {
    renderClusters();

    const infrastructureTab = await screen.findByRole("tab", { name: "Infrastruktur" });
    fireEvent.mouseDown(infrastructureTab);
    fireEvent.click(infrastructureTab);

    expect(screen.getByText("CPU-Generationen Mix je Cluster")).toBeInTheDocument();
    expect(screen.getByText(/Host Inventar/)).toBeInTheDocument();
    expect(screen.getByText(/HBA\/NIC Treiberinventar/)).toBeInTheDocument();
    expect(screen.getAllByText("vc-a").length).toBeGreaterThan(0);
    expect(screen.getAllByText("vc-b").length).toBeGreaterThan(0);
    expect(screen.getByText("lpfc-0")).toBeInTheDocument();
    expect(screen.getByText("lpfc-2")).toBeInTheDocument();
  });

  it("redirects the legacy maintenance URL to the maintenance tab", async () => {
    render(
      <MemoryRouter initialEntries={["/wartungsankuendigung"]}>
        <Routes>
          <Route path="/wartungsankuendigung" element={<Wartungsankuendigung />} />
          <Route path="/clusters" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("/clusters?tab=maintenance")).toBeInTheDocument();
  });

  it("redirects the legacy planning URL to the planning tab", async () => {
    render(
      <MemoryRouter initialEntries={["/planning"]}>
        <Routes>
          <Route path="/planning" element={<Planning />} />
          <Route path="/clusters" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("/clusters?tab=planning")).toBeInTheDocument();
  });
});
