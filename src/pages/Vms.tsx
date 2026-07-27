import { useMemo } from "react";
import { AlertTriangle, Monitor, Power } from "lucide-react";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageLoadingState } from "@/components/dashboard/PageLoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GlobalFilterScopeHint } from "@/components/global-filter/GlobalFilterScopeHint";
import { useActiveSnapshotIds, useVmsWithTechInfo } from "@/hooks/useActiveSnapshots";
import { VmInventoryTable, type OverviewVmRow } from "@/components/vm/VmInventoryTable";
import { VmOperationsPanel } from "@/components/vm/VmOperationsPanel";
import { VmPerformancePanel } from "@/components/vm/VmPerformancePanel";
import { VmComplianceLifecyclePanel } from "@/components/vm/VmComplianceLifecyclePanel";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import { OVERVIEW_KPI } from "@/lib/glossary";

export default function Vms() {
  const { snapshots, filters, snapshotsLoading } = useActiveSnapshotIds();
  const { vmsWithTechInfo, isLoading: vmsLoading } = useVmsWithTechInfo();

  const vms = useMemo<OverviewVmRow[]>(() => (
    [...vmsWithTechInfo]
      .sort((a, b) => a.vmName.localeCompare(b.vmName))
      .map((vm) => ({ ...vm, sysv: vm.techInfo?.sysv ?? null }))
  ), [vmsWithTechInfo]);

  if (snapshotsLoading || vmsLoading) return <PageLoadingState title="VMs" />;

  if (snapshots.length === 0) {
    return <div className="space-y-6 animate-fade-in"><PageHeader title="VMs" /><EmptyState icon={<Monitor className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>;
  }

  const poweredOn = vms.filter((vm) => vm.powerState === "poweredOn").length;
  const configIssues = vms.filter((vm) => vm.configStatus === "yellow" || vm.configStatus === "red").length;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="VMs" />
      <GlobalFilterScopeHint text="Die VM-Tabs folgen dem globalen Filter und strukturieren Inventar, Betrieb, Performance und Compliance für die aktuelle Sitzung." />
      <Tabs defaultValue="inventory" className="space-y-4">
        <TabsList className="h-auto w-full justify-start gap-1 p-1">
          <TabsTrigger value="inventory">Inventar</TabsTrigger>
          <TabsTrigger value="operations">Betrieb</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
        </TabsList>
        <TabsContent value="inventory" className="space-y-6">
          <KpiGrid>
            <KpiCard title="VMs gesamt" value={formatNum(vms.length)} icon={<Monitor className="h-4 w-4" />} info={OVERVIEW_KPI.vmsTotal} />
            <KpiCard title="Eingeschaltet" value={formatNum(poweredOn)} subtitle={`von ${formatNum(vms.length)}`} icon={<Power className="h-4 w-4" />} info={OVERVIEW_KPI.poweredOn} />
            <KpiCard title="Konfigurationsprobleme" value={formatNum(configIssues)} severity={configIssues > 0 ? "warn" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} />
          </KpiGrid>
          <VmInventoryTable vms={vms} globalFilter={filters.search} />
        </TabsContent>
        <TabsContent value="operations"><VmOperationsPanel /></TabsContent>
        <TabsContent value="performance"><VmPerformancePanel /></TabsContent>
        <TabsContent value="compliance"><VmComplianceLifecyclePanel /></TabsContent>
      </Tabs>
    </div>
  );
}
