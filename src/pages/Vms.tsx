import { useMemo } from "react";
import { AlertTriangle, Monitor, Power } from "lucide-react";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageLoadingState } from "@/components/dashboard/PageLoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { useActiveSnapshotIds, useVmsWithTechInfo } from "@/hooks/useActiveSnapshots";
import { VmInventoryTable, type OverviewVmRow } from "@/pages/Overview";
import { VmPerformanceDetails } from "@/pages/PerformancePage";
import { VmDailyOpsDetails } from "@/pages/DailyOps";
import { VmComplianceDetails } from "@/pages/ComplianceLifecycle";
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
      <KpiGrid>
        <KpiCard title="VMs gesamt" value={formatNum(vms.length)} icon={<Monitor className="h-4 w-4" />} info={OVERVIEW_KPI.vmsTotal} />
        <KpiCard title="Eingeschaltet" value={formatNum(poweredOn)} subtitle={`von ${formatNum(vms.length)}`} icon={<Power className="h-4 w-4" />} info={OVERVIEW_KPI.poweredOn} />
        <KpiCard title="Konfigurationsprobleme" value={formatNum(configIssues)} severity={configIssues > 0 ? "warn" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} />
      </KpiGrid>
      <VmInventoryTable vms={vms} globalFilter={filters.search} />
      <VmPerformanceDetails />
      <VmDailyOpsDetails />
      <VmComplianceDetails />
    </div>
  );
}
