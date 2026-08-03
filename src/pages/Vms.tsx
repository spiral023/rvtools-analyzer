import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Cpu, Layers, Monitor, MemoryStick, Power } from "lucide-react";
import { AverageVmPanel } from "@/components/dashboard/AverageVmPanel";
import { VmLoadDistributionTab } from "@/components/dashboard/insights/VmLoadDistributionTab";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageLoadingState, PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveSnapshotIds, useVmsWithTechInfo } from "@/hooks/useActiveSnapshots";
import { useAverageVm } from "@/hooks/useAverageVm";
import { useVmDetailDialog } from "@/hooks/useVmDetailDialog";
import { VmInventoryTable, type OverviewVmRow } from "@/components/vm/VmInventoryTable";
import { VmOperationsPanel } from "@/components/vm/VmOperationsPanel";
import { VmPerformancePanel } from "@/components/vm/VmPerformancePanel";
import { VmComplianceLifecyclePanel } from "@/components/vm/VmComplianceLifecyclePanel";
import { VmWorkloadProfilePanel } from "@/components/vm/VmWorkloadProfilePanel";
import { VmRightsizingPanel } from "@/components/vm/VmRightsizingPanel";
import { VmRamRightsizingPanel } from "@/components/vm/VmRamRightsizingPanel";
import { formatBytes, formatNum } from "@/lib/xlsx/parseHelpers";
import { OVERVIEW_KPI } from "@/lib/glossary";

type VmTab = "inventory" | "load-distribution" | "operations" | "performance" | "compliance" | "vm-profiles" | "rightsizing" | "ram-rightsizing";

function isVmTab(value: string | null): value is VmTab {
  return value === "inventory"
    || value === "load-distribution"
    || value === "operations"
    || value === "performance"
    || value === "compliance"
    || value === "vm-profiles"
    || value === "rightsizing"
    || value === "ram-rightsizing";
}

export default function Vms() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTab = searchParams.get("tab");
  const activeTab: VmTab = isVmTab(queryTab) ? queryTab : "inventory";
  const { snapshots, filters, snapshotsLoading } = useActiveSnapshotIds();
  const { vmsWithTechInfo, isLoading: vmsLoading } = useVmsWithTechInfo();

  const vms = useMemo<OverviewVmRow[]>(() => (
    [...vmsWithTechInfo]
      .sort((a, b) => a.vmName.localeCompare(b.vmName))
      .map((vm) => ({ ...vm, sysv: vm.techInfo?.sysv ?? null, sysvDepartment: vm.techInfo?.sysvDepartment ?? null }))
  ), [vmsWithTechInfo]);
  const { openVmDetail, vmDetailDialog } = useVmDetailDialog(vms);
  // Dieselbe Auswertung wie in der Overview – auf denselben gefilterten Bestand angewandt.
  const averageVm = useAverageVm(vmsWithTechInfo);
  const handleTabChange = (value: string) => {
    if (!isVmTab(value)) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value === "inventory") next.delete("tab");
      else next.set("tab", value);
      return next;
    });
  };

  if (snapshotsLoading || vmsLoading) return <PageLoadingState title="VMs" />;

  if (snapshots.length === 0) {
    return <div className="space-y-6 animate-fade-in"><PageHeader title="VMs" /><EmptyState icon={<Monitor className="h-6 w-6" />} title="Keine Daten" description="Lade RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>;
  }

  const poweredOn = vms.filter((vm) => vm.powerState === "poweredOn").length;
  const configIssues = vms.filter((vm) => vm.configStatus === "yellow" || vm.configStatus === "red").length;
  const totalVcpu = vms.reduce((sum, vm) => sum + (vm.cpuCount ?? 0), 0);
  const totalRamMiB = vms.reduce((sum, vm) => sum + (vm.memoryMiB ?? 0), 0);
  const clusterCount = new Set(vms.filter((vm) => vm.cluster).map((vm) => vm.cluster)).size;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="VMs" />
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList>
          <TabsTrigger value="inventory">Inventar</TabsTrigger>
          <TabsTrigger value="load-distribution">Lastverteilung</TabsTrigger>
          <TabsTrigger value="operations">Betrieb</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="vm-profiles">VM-Profile</TabsTrigger>
          <TabsTrigger value="rightsizing">CPU Rightsizing</TabsTrigger>
          <TabsTrigger value="ram-rightsizing">RAM-Rightsizing</TabsTrigger>
        </TabsList>
        <TabsContent value="inventory" className="space-y-6">
          <KpiGrid>
            <KpiCard title="VMs gesamt" value={formatNum(vms.length)} icon={<Monitor className="h-4 w-4" />} info={OVERVIEW_KPI.vmsTotal} />
            <KpiCard title="Eingeschaltet" value={formatNum(poweredOn)} subtitle={`von ${formatNum(vms.length)}`} icon={<Power className="h-4 w-4" />} info={OVERVIEW_KPI.poweredOn} />
            <KpiCard title="Konfigurationsprobleme" value={formatNum(configIssues)} severity={configIssues > 0 ? "warn" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} />
            <KpiCard title="vCPU gesamt" value={formatNum(totalVcpu)} icon={<Cpu className="h-4 w-4" />} info={OVERVIEW_KPI.vcpuTotal} />
            <KpiCard title="RAM gesamt" value={formatBytes(totalRamMiB)} icon={<MemoryStick className="h-4 w-4" />} info={OVERVIEW_KPI.ramTotal} />
            <KpiCard title="Cluster" value={formatNum(clusterCount)} icon={<Layers className="h-4 w-4" />} info={OVERVIEW_KPI.clusterCount} />
          </KpiGrid>
          {averageVm.isLoading
            ? <PanelLoadingState />
            : <AverageVmPanel avg={averageVm.avg} workload={averageVm.workload} hasVropsImport={averageVm.hasVropsImport} />}
          <VmInventoryTable vms={vms} globalFilter={filters.search} onRowClick={openVmDetail} />
        </TabsContent>
        <TabsContent value="load-distribution" className="space-y-6">
          <VmLoadDistributionTab vms={vmsWithTechInfo} />
        </TabsContent>
        <TabsContent value="operations"><VmOperationsPanel /></TabsContent>
        <TabsContent value="performance"><VmPerformancePanel /></TabsContent>
        <TabsContent value="compliance"><VmComplianceLifecyclePanel /></TabsContent>
        <TabsContent value="vm-profiles"><VmWorkloadProfilePanel /></TabsContent>
        <TabsContent value="rightsizing"><VmRightsizingPanel /></TabsContent>
        <TabsContent value="ram-rightsizing"><VmRamRightsizingPanel /></TabsContent>
      </Tabs>
      {vmDetailDialog}
    </div>
  );
}
