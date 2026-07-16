import { useMemo } from "react";
import { useActiveSnapshotIds, useVms, useTechInfoLatestByVmNames, useAllTechInfoClientLatest } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Badge } from "@/components/ui/badge";
import { useGlobalVmFilterEngine } from "@/hooks/useGlobalVmFilter";
import { useVmDetailDialog } from "@/hooks/useVmDetailDialog";
import { useClientDetailDialog } from "@/hooks/useClientDetailDialog";
import { Monitor, ClipboardList, Link2Off } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { formatNum, hasIdenticalSysvAndDeputy } from "@/lib/xlsx/parseHelpers";
import { formatIsoDateTime } from "@/lib/clientDetail";
import { applyVmScopeToVms } from "@/lib/vmScope";
import { partitionTechInfoByActiveVms } from "@/lib/techInfoVmScope";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  TECHINFO_KPI,
  TECHINFO_SERVER_COLUMNS,
  TECHINFO_CLIENT_COLUMNS,
  TECHINFO_SECTIONS,
} from "@/lib/glossaries/techInfo";
import type { NormalizedVm, TechInfoClientLatest } from "@/domain/models/types";

interface TechInfoVmRow {
  vmName: string;
  serverType: string | null;
  maintenanceWindow: string | null;
  operatingSystem: string | null;
  comment: string | null;
  sysv: string | null;
  sysvDepartment: string | null;
  sysvDeputy: string | null;
  sysvDeputyConflict: boolean | null;
  sysvDeputyDepartment: string | null;
  bz: string | null;
  clusterFromTechInfo: string | null;
  cvBackup: boolean | null;
  az: string | null;
  hasTechInfo: boolean;
}

const columns: ColumnDef<TechInfoVmRow, unknown>[] = [
  { accessorKey: "vmName", header: "VM", meta: { info: TECHINFO_SERVER_COLUMNS.vmName } },
  { accessorKey: "serverType", header: "Servertyp", meta: { info: TECHINFO_SERVER_COLUMNS.serverType }, cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "maintenanceWindow", header: "Wartungsfenster", meta: { info: TECHINFO_SERVER_COLUMNS.maintenanceWindow }, cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "operatingSystem", header: "Betriebssystem", meta: { info: TECHINFO_SERVER_COLUMNS.operatingSystem }, cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "comment", header: "Kommentar", meta: { info: TECHINFO_SERVER_COLUMNS.comment }, cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "sysv", header: "SysV", meta: { info: TECHINFO_SERVER_COLUMNS.sysv }, cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "sysvDepartment", header: "SysV Abteilung", meta: { info: TECHINFO_SERVER_COLUMNS.sysvDepartment }, cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "sysvDeputy", header: "SysVStv", meta: { info: TECHINFO_SERVER_COLUMNS.sysvDeputy }, cell: ({ getValue }) => getValue() || "—" },
  {
    accessorKey: "sysvDeputyConflict",
    header: "SysV = SysVStv",
    meta: { info: TECHINFO_SERVER_COLUMNS.sysvDeputyConflict },
    cell: ({ getValue }) => {
      const conflict = getValue() as boolean | null;
      if (conflict === null) return "—";
      if (!conflict) return <Badge variant="secondary">OK</Badge>;
      return <Badge variant="destructive">Verstoß</Badge>;
    },
  },
  { accessorKey: "sysvDeputyDepartment", header: "SysVStv Abteilung", meta: { info: TECHINFO_SERVER_COLUMNS.sysvDeputyDepartment }, cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "clusterFromTechInfo", header: "Cluster", meta: { info: TECHINFO_SERVER_COLUMNS.clusterFromTechInfo }, cell: ({ getValue }) => getValue() || "—" },
  {
    accessorKey: "cvBackup",
    header: "CV-Backup",
    meta: { info: TECHINFO_SERVER_COLUMNS.cvBackup },
    cell: ({ getValue }) => {
      const val = getValue() as boolean | null;
      if (val === null) return "—";
      return val ? "Ja" : "Nein";
    },
  },
  { accessorKey: "bz", header: "BZ", meta: { info: TECHINFO_SERVER_COLUMNS.bz }, cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "az", header: "AZ", meta: { info: TECHINFO_SERVER_COLUMNS.az }, cell: ({ getValue }) => getValue() || "—" },
];

const clientColumns: ColumnDef<TechInfoClientLatest, unknown>[] = [
  { accessorKey: "clientName", header: "Name", meta: { info: TECHINFO_CLIENT_COLUMNS.clientName } },
  { accessorKey: "blz", header: "BLZ", meta: { info: TECHINFO_CLIENT_COLUMNS.blz }, cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "standort", header: "Standort", meta: { info: TECHINFO_CLIENT_COLUMNS.standort }, cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "ip", header: "IP", meta: { info: TECHINFO_CLIENT_COLUMNS.ip }, cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "macAddress", header: "MAC Adresse", meta: { info: TECHINFO_CLIENT_COLUMNS.macAddress }, cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "poolName", header: "Poolname", meta: { info: TECHINFO_CLIENT_COLUMNS.poolName }, cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "modifiedBy", header: "Geändert von", meta: { info: TECHINFO_CLIENT_COLUMNS.modifiedBy }, cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "modifiedAt", header: "Änderungsdatum", meta: { info: TECHINFO_CLIENT_COLUMNS.modifiedAt }, cell: ({ getValue }) => formatIsoDateTime(getValue() as string | null) },
  { accessorKey: "createdBy", header: "Erstellt von", meta: { info: TECHINFO_CLIENT_COLUMNS.createdBy }, cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "createdAt", header: "Erstellungsdatum", meta: { info: TECHINFO_CLIENT_COLUMNS.createdAt }, cell: ({ getValue }) => formatIsoDateTime(getValue() as string | null) },
  { accessorKey: "user", header: "User", meta: { info: TECHINFO_CLIENT_COLUMNS.user }, cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "hardware", header: "Hardware", meta: { info: TECHINFO_CLIENT_COLUMNS.hardware }, cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "os", header: "OS", meta: { info: TECHINFO_CLIENT_COLUMNS.os }, cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "cluster", header: "Cluster", meta: { info: TECHINFO_CLIENT_COLUMNS.cluster }, cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "vcenter", header: "vCenter", meta: { info: TECHINFO_CLIENT_COLUMNS.vcenter }, cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "site", header: "Site", meta: { info: TECHINFO_CLIENT_COLUMNS.site }, cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "insider", header: "Insider", meta: { info: TECHINFO_CLIENT_COLUMNS.insider }, cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "hwChanges", header: "HW Änderungen", meta: { info: TECHINFO_CLIENT_COLUMNS.hwChanges }, cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "monitoring", header: "Monitoring", meta: { info: TECHINFO_CLIENT_COLUMNS.monitoring }, cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "domain", header: "Domäne", meta: { info: TECHINFO_CLIENT_COLUMNS.domain }, cell: ({ getValue }) => getValue() || "—" },
];

const unassignedColumns: ColumnDef<NormalizedVm, unknown>[] = [
  { accessorKey: "vmName", header: "VM" },
  { accessorKey: "cluster", header: "Cluster", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "host", header: "Host", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "powerState", header: "Power-Status", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "osConfig", header: "Betriebssystem", cell: ({ getValue }) => getValue() || "—" },
];

export default function TechInfo() {
  const { snapshots, filters, snapshotsLoading } = useActiveSnapshotIds();
  const { allVms } = useVms();
  const { openVmDetail, vmDetailDialog } = useVmDetailDialog(allVms);
  const { openClientDetail, clientDetailDialog } = useClientDetailDialog(allVms);
  const { hasActiveFilter, matchingVmKeys } = useGlobalVmFilterEngine();
  const clusterFilterSet = useMemo(() => new Set(filters.clusters), [filters.clusters]);
  const hostFilterSet = useMemo(() => new Set(filters.hosts), [filters.hosts]);

  const scopeVms = useMemo(
    () =>
      applyVmScopeToVms(allVms, {
        vmNameList: filters.vmNameList,
        vmPowerScope: filters.vmPowerScope,
        excludeVclsVms: filters.excludeVclsVms,
      }).filter((vm) => {
        if (hasActiveFilter && matchingVmKeys && !matchingVmKeys.has(vm.vmKey)) return false;
        if (clusterFilterSet.size > 0 && (!vm.cluster || !clusterFilterSet.has(vm.cluster))) return false;
        if (hostFilterSet.size > 0 && (!vm.host || !hostFilterSet.has(vm.host))) return false;
        return true;
      }),
    [allVms, clusterFilterSet, filters.excludeVclsVms, filters.vmNameList, filters.vmPowerScope, hasActiveFilter, hostFilterSet, matchingVmKeys],
  );

  const { data: techInfoLatest = [] } = useTechInfoLatestByVmNames(scopeVms.map((vm) => vm.vmName));
  const { data: techInfoClients = [] } = useAllTechInfoClientLatest();

  const byVmName = useMemo(() => {
    const map = new Map<string, (typeof techInfoLatest)[number]>();
    for (const entry of techInfoLatest) map.set(entry.vmNameNorm, entry);
    return map;
  }, [techInfoLatest]);

  const { serverVms, clientRows, vmsWithoutTechInfo } = useMemo(
    () => partitionTechInfoByActiveVms(scopeVms, techInfoLatest, techInfoClients),
    [scopeVms, techInfoLatest, techInfoClients],
  );

  const rows = useMemo<TechInfoVmRow[]>(
    () =>
      serverVms.map((vm) => {
        const techInfo = byVmName.get(vm.vmName.trim().toLowerCase())!;
        return {
          vmName: vm.vmName,
          serverType: techInfo.serverType,
          maintenanceWindow: techInfo.maintenanceWindow,
          operatingSystem: techInfo.operatingSystem,
          comment: techInfo.comment,
          sysv: techInfo.sysv,
          sysvDepartment: techInfo.sysvDepartment,
          sysvDeputy: techInfo.sysvDeputy,
          sysvDeputyConflict: hasIdenticalSysvAndDeputy(techInfo.sysv, techInfo.sysvDeputy),
          sysvDeputyDepartment: techInfo.sysvDeputyDepartment,
          bz: techInfo.bz,
          clusterFromTechInfo: techInfo.clusterFromTechInfo,
          cvBackup: techInfo.cvBackup,
          az: techInfo.az,
          hasTechInfo: true,
        };
      }),
    [serverVms, byVmName],
  );

  const searchedRows = useMemo(() => {
    const byVmNameAsc = (a: TechInfoVmRow, b: TechInfoVmRow) =>
      a.vmName.localeCompare(b.vmName, "de-DE", { numeric: true, sensitivity: "base" });
    const q = filters.search.trim().toLowerCase();
    if (!q) return rows.slice().sort(byVmNameAsc);
    return rows.filter((row) => {
      const values = [
        row.vmName,
        row.serverType,
        row.maintenanceWindow,
        row.operatingSystem,
        row.comment,
        row.sysv,
        row.sysvDepartment,
        row.sysvDeputy,
        row.sysvDeputyConflict === null ? "—" : row.sysvDeputyConflict ? "sysv sysvstv identisch verstoß" : "ok",
        row.sysvDeputyDepartment,
        row.bz,
        row.clusterFromTechInfo,
        row.az,
        row.hasTechInfo ? "mit tech-info" : "ohne tech-info",
        row.cvBackup === null ? "—" : row.cvBackup ? "ja" : "nein",
      ];
      return values.some((v) => String(v ?? "").toLowerCase().includes(q));
    }).sort(byVmNameAsc);
  }, [rows, filters.search]);

  const searchedClientRows = useMemo(() => {
    const byClientNameAsc = (a: TechInfoClientLatest, b: TechInfoClientLatest) =>
      a.clientName.localeCompare(b.clientName, "de-DE", { numeric: true, sensitivity: "base" });
    const q = filters.search.trim().toLowerCase();
    if (!q) return clientRows.slice().sort(byClientNameAsc);
    return clientRows.filter((row) => {
      const values = [
        row.clientName, row.blz, row.standort, row.ip, row.macAddress, row.poolName,
        row.modifiedBy, row.modifiedAt, row.createdBy, row.createdAt, row.user,
        row.hardware, row.os, row.cluster, row.vcenter, row.site, row.insider,
        row.hwChanges, row.monitoring, row.domain,
      ];
      return values.some((v) => String(v ?? "").toLowerCase().includes(q));
    }).sort(byClientNameAsc);
  }, [clientRows, filters.search]);

  const searchedUnassignedRows = useMemo(() => {
    const byVmNameAsc = (a: NormalizedVm, b: NormalizedVm) =>
      a.vmName.localeCompare(b.vmName, "de-DE", { numeric: true, sensitivity: "base" });
    const q = filters.search.trim().toLowerCase();
    if (!q) return vmsWithoutTechInfo.slice().sort(byVmNameAsc);
    return vmsWithoutTechInfo.filter((vm) => {
      const values = [vm.vmName, vm.cluster, vm.host, vm.powerState, vm.osConfig];
      return values.some((value) => String(value ?? "").toLowerCase().includes(q));
    }).sort(byVmNameAsc);
  }, [filters.search, vmsWithoutTechInfo]);

  const vmTotal = scopeVms.length;
  const vmWithoutTechInfoTotal = vmsWithoutTechInfo.length;
  const vmWithTechInfo = vmTotal - vmWithoutTechInfoTotal;

  if (snapshotsLoading) return <PageLoadingState title="Tech-Info" />;

  if (snapshots.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold">Tech-Info</h1>
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title="Keine Daten"
          description="Laden Sie RVTools- und Tech-Info-Daten hoch."
          actionLabel="Zum Upload"
          actionTo="/upload"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Tech-Info</h1>
      <FilterBar />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard title="Aktive VMs gesamt" value={formatNum(vmTotal)} icon={<Monitor className="h-4 w-4" />} info={TECHINFO_KPI.vmTotal} />
        <KpiCard title="VMs mit Tech-Info" value={formatNum(vmWithTechInfo)} severity="ok" icon={<ClipboardList className="h-4 w-4" />} info={TECHINFO_KPI.vmWithTechInfo} />
        <KpiCard title="VMs ohne Zuordnung" value={formatNum(vmWithoutTechInfoTotal)} severity={vmWithoutTechInfoTotal > 0 ? "warn" : "ok"} icon={<Link2Off className="h-4 w-4" />} info={TECHINFO_KPI.vmWithoutTechInfo} />
      </div>
      <div>
        <InfoTooltip entry={TECHINFO_SECTIONS.serverTable} side="bottom">
          <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">VM Tech-Info Server ({searchedRows.length})</h3>
        </InfoTooltip>
        <VirtualTable data={searchedRows} columns={columns} height={460} onRowClick={openVmDetail} />
      </div>
      <div>
        <InfoTooltip entry={TECHINFO_SECTIONS.clientTable} side="bottom">
          <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">VM Tech-Info Clients ({searchedClientRows.length})</h3>
        </InfoTooltip>
        {techInfoClients.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Tech-Info-Client-Datei importiert.</p>
        ) : (
          <VirtualTable data={searchedClientRows} columns={clientColumns} height={460} exportFileName="tech-info-clients" onRowClick={openClientDetail} />
        )}
      </div>
      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">VMs ohne Tech-Info ({searchedUnassignedRows.length})</h3>
        <VirtualTable data={searchedUnassignedRows} columns={unassignedColumns} height={460} onRowClick={openVmDetail} />
      </div>
      {vmDetailDialog}
      {clientDetailDialog}
    </div>
  );
}
