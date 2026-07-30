import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FilterProvider } from "@/hooks/useFilterState";
import { SelectionProvider } from "@/hooks/useSelection";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedCluster, NormalizedHost, NormalizedVm, Scenario, SheetRow, SnapshotMeta } from "@/domain/models/types";
import type { WhatIfClusterResult } from "@/domain/services/planningHelpers";
import type { ClusterMetrics } from "@/domain/services/clusterCapacityEngine";
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

const capacityPolicies = [{ id: "standard-server-windows", name: "Standard Server Windows", version: 1 }];
const capacityPolicyAssignments: never[] = [];

let whatIfResult: WhatIfClusterResult[] | null = null;

const whatIfMetrics = (overrides: Partial<ClusterMetrics> = {}): ClusterMetrics => ({
  clusterName: "What-If Zielcluster",
  hosts: 2,
  totalCores: 16,
  totalMemoryMiB: 128_000,
  totalVms: 10,
  totalVcpus: 20,
  vRamMiB: 40_000,
  cpuUsagePct: 30,
  memoryUsagePct: 40,
  vcpuPerCore: 2,
  ramCommitPct: 50,
  ramActivePct: 20,
  swapBalloonPct: 0,
  riskScore: 1,
  risk: "niedrig",
  riskFactors: [],
  siteFailoverOverride: false,
  maxHostFailures: 1,
  hostFailureBreaches: [],
  projected: false,
  incompleteVmCount: 0,
  ...overrides,
});

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
  useAllVropsLatest: () => ({ data: [] as never[], isLoading: false }),
  useTechInfoLatestByVmNames: () => ({ data: [] as never[], isLoading: false }),
  useTechInfoClientLatestByClientNames: () => ({ data: [] as never[], isFetching: false }),
}));

vi.mock("@/hooks/useMaintenance", () => ({
  useMaintenanceAssignments: () => ({ assignments: [] as never[], saveAssignment: vi.fn(), isSaving: false }),
  useMaintenanceSettings: () => ({ settings: { firstName: "", lastName: "", companyName: "Test GmbH" } }),
}));

vi.mock("@/hooks/useCapacityPolicies", () => ({
  useCapacityPolicies: () => ({
    policies: capacityPolicies,
    assignments: capacityPolicyAssignments,
    saveAssignment: vi.fn(),
    isLoading: false,
    isSaving: false,
  }),
}));

vi.mock("@/hooks/useScenarios", () => ({
  useScenarios: () => ({
    scenarios: planningScenarios,
    saveScenario: vi.fn().mockResolvedValue(undefined),
    deleteScenario: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@/hooks/useWhatIf", () => ({
  useWhatIf: () => whatIfResult ? { clusters: whatIfResult, totalMovedVms: 1, incompleteVmCount: 0 } : null,
}));

vi.mock("@/components/tables/VirtualTable", () => ({
  VirtualTable: ({ data, columns = [], onRowClick }: {
    data: Array<Record<string, unknown>>;
    columns?: Array<{ id?: string; accessorKey?: string; header?: string }>;
    onRowClick?: (row: Record<string, unknown>) => void;
  }) => (
    <div>
      {columns.map((column) => typeof column.header === "string" && <span key={column.id ?? column.accessorKey ?? column.header}>{column.header}</span>)}
      {data.map((row) => (
        <div key={String(row.clusterKey ?? row.snapshotId ?? row.key ?? Object.values(row).join("|"))}>
          {Object.entries(row).map(([field, value]) => <span key={field}>{String(value)}</span>)}
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

function renderToolPage(page: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <FilterProvider>
          <SelectionProvider>
            <MemoryRouter>{page}</MemoryRouter>
          </SelectionProvider>
        </FilterProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  whatIfResult = null;
});

describe("Clusters", () => {
  it("opens capacity from the query tab", async () => {
    renderClusters("/clusters?tab=capacity", true);

    expect(await screen.findByRole("tablist")).toHaveClass("w-full");
    const capacityTab = await screen.findByRole("tab", { name: "Kapazität" });
    expect(capacityTab).toHaveAttribute("data-state", "active");

    expect(screen.queryByRole("tab", { name: "Wartung" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Planung" })).not.toBeInTheDocument();
  });

  it("renders the filtered cluster overview with separate vCenter cells", async () => {
    renderClusters();

    expect(await screen.findByRole("heading", { name: "Cluster" })).toBeInTheDocument();
    expect(screen.queryByText(/aktive Snapshots?/)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "vCenter für Diagramme" })).not.toBeInTheDocument();
    expect(screen.getByText("Clusterübersicht")).toBeInTheDocument();
    expect(screen.getByText("Ausfallskapazität")).toBeInTheDocument();
    expect(screen.getByText(/Betriebssysteme je Cluster/)).toBeInTheDocument();
    expect(screen.queryByText("Datacenter")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "According to VMware Tools" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Configuration file" })).not.toBeChecked();
    expect(screen.getAllByText("vcsa-a").length).toBeGreaterThan(0);
    expect(screen.getAllByText("vcsa-b").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Cluster Production öffnen" })[0]);
    expect(await screen.findByRole("dialog")).toHaveTextContent("vcsa-a · DC1");
  });

  it("switches the OS source to the configuration file", async () => {
    const originalOsConfig = vms[0]!.osConfig;
    vms[0]!.osConfig = "Windows Server 2022 (config)";

    try {
      renderClusters();

      const configSource = await screen.findByRole("radio", { name: "Configuration file" });
      fireEvent.click(configSource);

      expect(configSource).toBeChecked();
      expect(screen.getByText("Windows Server 2022 (config)")).toBeInTheDocument();
    } finally {
      vms[0]!.osConfig = originalOsConfig;
    }
  });

  it("opens the cluster OS detail with a Markdown copy action", async () => {
    renderClusters();

    const detailButtons = await screen.findAllByRole("button", { name: "Cluster Production öffnen" });
    fireEvent.click(detailButtons.at(-1)!);

    expect(await screen.findByRole("dialog")).toHaveTextContent("Betriebssysteme · Production");
    expect(screen.getByRole("button", { name: "OS-Details als Markdown kopieren" })).toBeInTheDocument();
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
    expect(screen.queryByRole("combobox", { name: "vCenter für Diagramme" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Nur auffällige Hosts/ })).toBeInTheDocument();
    expect(screen.getByText("Host Dichte (VMs vs vCPU/Core)").closest("section")).toContainElement(screen.getByRole("checkbox", { name: /Nur auffällige Hosts/ }));
  });

  it("shows maintenance assignments on its own page", async () => {
    renderToolPage(<Wartungsankuendigung />);

    expect(await screen.findByRole("heading", { name: "Wartung" })).toBeInTheDocument();
    expect(screen.getByText("Cluster")).toBeInTheDocument();
    expect(screen.getByText("VMs im Scope")).toBeInTheDocument();
    expect(screen.getByText("Ohne Wartungsfenster")).toBeInTheDocument();
    expect(screen.getByText("Cluster-Zuweisungen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mail erstellen" })).not.toBeInTheDocument();
  });

  it("shows planning KPIs and the What-If metrics table above the summary", async () => {
    whatIfResult = [{
      clusterKey: "cluster-a",
      clusterName: "What-If Zielcluster",
      before: whatIfMetrics(),
      after: whatIfMetrics({ cpuUsagePct: 40, memoryUsagePct: 50, vcpuPerCore: 3, ramCommitPct: 60, riskScore: 2, risk: "mittel", maxHostFailures: 0, projected: true }),
      vropsRamAssignedHighPctBefore: null,
      vropsRamAssignedHighPctAfter: null,
      siteFailoverRiskBefore: null,
      siteFailoverRiskAfter: null,
      incomingVmCount: 1,
      outgoingVmCount: 0,
      vropsMissing: false,
    }];
    renderToolPage(<Planning />);

    expect(await screen.findByRole("heading", { name: "Planung" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "What-if" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: "Fill up" })).toBeInTheDocument();
    expect(screen.getAllByText("Szenarien").length).toBeGreaterThan(0);
    expect(screen.getByText("Migrationsgruppen")).toBeInTheDocument();
    expect(screen.getByText("Cluster im Scope")).toBeInTheDocument();
    expect(screen.getByText("VMs im Scope")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Szenarien" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Migration Production"));
    const comparison = screen.getByRole("heading", { name: "What-If Vergleich" });
    const summary = screen.getByRole("heading", { name: "What-If Zusammenfassung" });
    expect(screen.getAllByText("What-If Zielcluster")).toHaveLength(2);
    expect(comparison.closest(".grid")).toHaveClass("lg:grid-cols-[280px_minmax(0,1fr)]");
    expect(comparison.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const fillUpTab = screen.getByRole("tab", { name: "Fill up" });
    fireEvent.mouseDown(fillUpTab);
    fireEvent.click(fillUpTab);
    expect(screen.getByRole("tab", { name: "Fill up" })).toHaveAttribute("data-state", "active");
    expect(screen.queryByText("Migrationsgruppen")).not.toBeInTheDocument();
    expect(await screen.findByText("Ø +VM pro Cluster")).toBeInTheDocument();
    expect(screen.getByText("N-1 bereit")).toBeInTheDocument();

    const policiesTab = screen.getByRole("tab", { name: "Policies" });
    fireEvent.mouseDown(policiesTab);
    fireEvent.click(policiesTab);
    expect(await screen.findByText("Eigene Policies")).toBeInTheDocument();
    expect(screen.getByText("Explizit zugewiesen")).toBeInTheDocument();
    expect(screen.getByText("Cluster mit Overrides")).toBeInTheDocument();
  });

  it("entfernt den Infrastruktur-Tab samt CPU- und Treiberinventar", async () => {
    renderClusters();

    expect(screen.queryByRole("tab", { name: "Infrastruktur" })).not.toBeInTheDocument();
    expect(screen.queryByText("CPU-Generationen Mix je Cluster")).not.toBeInTheDocument();
    expect(screen.queryByText(/HBA\/NIC Treiberinventar/)).not.toBeInTheDocument();
  });

  it("redirects former cluster tabs to the dedicated pages", async () => {
    renderClusters("/clusters?tab=maintenance", true);
    expect(await screen.findByText("/wartungsankuendigung")).toBeInTheDocument();

    renderClusters("/clusters?tab=planning", true);
    expect(await screen.findByText("/planning")).toBeInTheDocument();
  });
});
