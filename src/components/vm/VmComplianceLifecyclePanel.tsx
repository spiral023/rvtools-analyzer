import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Fingerprint, MonitorCheck, Shield, Tag } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/components/charts/recharts";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useActiveSnapshotIds, useRawSheet, useVms } from "@/hooks/useActiveSnapshots";
import { useGlobalVmFilterEngine } from "@/hooks/useGlobalVmFilter";
import { useVmDetailDialog } from "@/hooks/useVmDetailDialog";
import { CHART_AXIS_STYLE, CHART_COLORS, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/chartStyles";
import { COMPLIANCE_COLUMNS, COMPLIANCE_KPI, COMPLIANCE_SECTIONS, HW_UPGRADE_COLUMNS } from "@/lib/glossaries/compliance";
import { formatNum } from "@/lib/xlsx/parseHelpers";

interface ComplianceVm { snapshotId: string; vmName: string; hwVersion: string | null; firmware: string | null; secureBoot: boolean | null; cbt: boolean | null; osDrift: boolean; cluster: string | null; uuidMissing: boolean; annotationEmpty: boolean }
interface HwUpgradeRow { snapshotId: string; vm: string; hwVersion: string; upgradeStatus: string; upgradePolicy: string; target: string; cluster: string }

function parseVmHwVersion(value: string | null | undefined): number | null {
  const match = (value || "").trim().match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

const compColumns: ColumnDef<ComplianceVm, unknown>[] = [
  { accessorKey: "vmName", header: "VM", meta: { info: COMPLIANCE_COLUMNS.vmName } },
  { accessorKey: "hwVersion", header: "HW Version", meta: { info: COMPLIANCE_COLUMNS.hwVersion }, cell: ({ getValue }) => { const raw = getValue() as string | null; const value = parseVmHwVersion(raw); return <span className={value !== null && value < 14 ? "text-destructive font-semibold" : value !== null && value < 19 ? "text-warning" : ""}>{raw || "—"}</span>; } },
  { accessorKey: "firmware", header: "Firmware", meta: { info: COMPLIANCE_COLUMNS.firmware } },
  { accessorKey: "secureBoot", header: "Secure Boot", meta: { info: COMPLIANCE_COLUMNS.secureBoot }, cell: ({ getValue }) => getValue() === true ? <span className="text-success">Ja</span> : getValue() === false ? <span className="text-warning">Nein</span> : "—" },
  { accessorKey: "cbt", header: "CBT", meta: { info: COMPLIANCE_COLUMNS.cbt }, cell: ({ getValue }) => getValue() === true ? <span className="text-success">Ja</span> : getValue() === false ? <span className="text-warning">Nein</span> : "—" },
  { accessorKey: "osDrift", header: "OS Drift", meta: { info: COMPLIANCE_COLUMNS.osDrift }, cell: ({ getValue }) => getValue() ? <span className="text-warning">Ja</span> : "Nein" },
  { accessorKey: "uuidMissing", header: "UUID fehlt", meta: { info: COMPLIANCE_COLUMNS.uuidMissing }, cell: ({ getValue }) => getValue() ? <span className="text-warning">Ja</span> : "Nein" },
  { accessorKey: "annotationEmpty", header: "Annotation leer", meta: { info: COMPLIANCE_COLUMNS.annotationEmpty }, cell: ({ getValue }) => getValue() ? <span className="text-muted-foreground">Ja</span> : "Nein" },
  { accessorKey: "cluster", header: "Cluster", meta: { info: COMPLIANCE_COLUMNS.cluster } },
];
const hwUpgradeColumns: ColumnDef<HwUpgradeRow, unknown>[] = [
  { accessorKey: "vm", header: "VM", meta: { info: HW_UPGRADE_COLUMNS.vm } },
  { accessorKey: "hwVersion", header: "HW Version", meta: { info: HW_UPGRADE_COLUMNS.hwVersion } },
  { accessorKey: "upgradeStatus", header: "Upgrade Status", meta: { info: HW_UPGRADE_COLUMNS.upgradeStatus } },
  { accessorKey: "upgradePolicy", header: "Policy", meta: { info: HW_UPGRADE_COLUMNS.upgradePolicy } },
  { accessorKey: "target", header: "Ziel", meta: { info: HW_UPGRADE_COLUMNS.target } },
  { accessorKey: "cluster", header: "Cluster", meta: { info: HW_UPGRADE_COLUMNS.cluster } },
];

export function VmComplianceLifecyclePanel() {
  const { filters } = useActiveSnapshotIds();
  const { vms, allVms } = useVms();
  const { openVmDetail, vmDetailDialog } = useVmDetailDialog(allVms);
  const { filterVmRows } = useGlobalVmFilterEngine();
  const { data: rawInfo = [], isLoading } = useRawSheet("vInfo");
  const filteredInfo = useMemo(() => filterVmRows(rawInfo), [filterVmRows, rawInfo]);
  const complianceVms = useMemo<ComplianceVm[]>(() => vms.map((vm) => ({
      snapshotId: vm.snapshotId,
      vmName: vm.vmName,
      hwVersion: vm.hwVersion,
      firmware: vm.firmware,
      secureBoot: vm.efiSecureBoot,
      cbt: vm.cbt,
      osDrift: !!(vm.osConfig && vm.osTools && vm.osConfig !== vm.osTools),
      cluster: vm.cluster,
      uuidMissing: !vm.vmUuid,
      annotationEmpty: !vm.annotation || vm.annotation.trim() === "",
    })), [vms]);
  const stats = useMemo(() => complianceVms.reduce((acc, vm) => {
    if (vm.secureBoot === false) acc.noSecureBoot++;
    if (vm.cbt === false) acc.noCbt++;
    if (vm.osDrift) acc.osDrift++;
    if (vm.firmware && vm.firmware.toLowerCase() !== "efi") acc.biosVms++;
    if (vm.uuidMissing) acc.uuidMissing++;
    if (vm.annotationEmpty) acc.annotationEmpty++;
    return acc;
  }, { noSecureBoot: 0, noCbt: 0, osDrift: 0, biosVms: 0, uuidMissing: 0, annotationEmpty: 0 }), [complianceVms]);
  const hwVersionChart = useMemo(() => {
    const counts = new Map<string, number>();
    for (const vm of complianceVms) { const name = vm.hwVersion ? `vmx-${vm.hwVersion.replace(/^vmx-/i, "")}` : "Unknown"; counts.set(name, (counts.get(name) ?? 0) + 1); }
    return [...counts.entries()].map(([name, value]) => ({ name, value })).sort((left, right) => left.name.localeCompare(right.name, "de-DE", { numeric: true }));
  }, [complianceVms]);
  const hwUpgradeBacklog = useMemo<HwUpgradeRow[]>(() => filteredInfo.flatMap((row) => {
    const status = String(row.data["HW upgrade status"] || "");
    if (!status || status === "none") return [];
    return [{ snapshotId: row.snapshotId, vm: String(row.data["VM"] || ""), hwVersion: String(row.data["HW version"] || ""), upgradeStatus: status, upgradePolicy: String(row.data["HW upgrade policy"] || ""), target: String(row.data["HW target"] || ""), cluster: String(row.data["Cluster"] || "") }];
  }), [filteredInfo]);
  if (isLoading) return <PanelLoadingState />;

  return <div className="space-y-6">
    <KpiGrid>
      <KpiCard title="Kein Secure Boot" value={formatNum(stats.noSecureBoot)} severity={stats.noSecureBoot > 0 ? "warn" : "ok"} icon={<Shield className="h-4 w-4" />} info={COMPLIANCE_KPI.noSecureBoot} />
      <KpiCard title="BIOS (kein EFI)" value={formatNum(stats.biosVms)} severity={stats.biosVms > 0 ? "warn" : "ok"} info={COMPLIANCE_KPI.biosVms} />
      <KpiCard title="Kein CBT" value={formatNum(stats.noCbt)} severity={stats.noCbt > 0 ? "warn" : "ok"} info={COMPLIANCE_KPI.noCbt} />
      <KpiCard title="OS Drift" value={formatNum(stats.osDrift)} severity={stats.osDrift > 0 ? "warn" : "ok"} icon={<MonitorCheck className="h-4 w-4" />} info={COMPLIANCE_KPI.osDrift} />
      <KpiCard title="UUID fehlt" value={formatNum(stats.uuidMissing)} severity={stats.uuidMissing > 0 ? "warn" : "ok"} icon={<Fingerprint className="h-4 w-4" />} info={COMPLIANCE_KPI.uuidMissing} />
      <KpiCard title="Annotation leer" value={formatNum(stats.annotationEmpty)} subtitle={`${complianceVms.length > 0 ? Math.round(stats.annotationEmpty / complianceVms.length * 100) : 0}%`} icon={<Tag className="h-4 w-4" />} info={COMPLIANCE_KPI.annotationEmpty} />
    </KpiGrid>
    <div><InfoTooltip entry={COMPLIANCE_SECTIONS.complianceTable} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">VM Compliance ({complianceVms.length})</h3></InfoTooltip><VirtualTable tableId="vms/compliance" columnPicker data={complianceVms} columns={compColumns} globalFilter={filters.search} onRowClick={openVmDetail} /></div>
    <div className="rounded-lg border border-border/50 bg-card/30 p-4"><InfoTooltip entry={COMPLIANCE_SECTIONS.hwVersionDistribution} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">HW Version Verteilung</h3></InfoTooltip><ResponsiveContainer width="100%" height={280}><BarChart data={hwVersionChart}><XAxis dataKey="name" tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} /><Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} /><Bar dataKey="value" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
    {hwUpgradeBacklog.length > 0 && <div><InfoTooltip entry={COMPLIANCE_SECTIONS.hwUpgradeBacklog} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">VM HW Upgrade Backlog ({hwUpgradeBacklog.length})</h3></InfoTooltip><VirtualTable tableId="vms/compliance-hardware-upgrade" columnPicker data={hwUpgradeBacklog} columns={hwUpgradeColumns} globalFilter={filters.search} height={300} onRowClick={openVmDetail} /></div>}
    {vmDetailDialog}
  </div>;
}
