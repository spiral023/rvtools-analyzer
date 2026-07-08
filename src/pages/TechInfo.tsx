import { useMemo } from "react";
import { useActiveSnapshotIds, useVms, useTechInfoLatestByVmNames, useAllTechInfoClientLatest } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
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
import type { TechInfoClientLatest } from "@/domain/models/types";

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
  { accessorKey: "vmName", header: "VM" },
  { accessorKey: "serverType", header: "Servertyp", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "maintenanceWindow", header: "Wartungsfenster", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "operatingSystem", header: "Betriebssystem", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "comment", header: "Kommentar", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "sysv", header: "SysV", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "sysvDepartment", header: "SysV Abteilung", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "sysvDeputy", header: "SysVStv", cell: ({ getValue }) => getValue() || "—" },
  {
    accessorKey: "sysvDeputyConflict",
    header: "SysV = SysVStv",
    cell: ({ getValue }) => {
      const conflict = getValue() as boolean | null;
      if (conflict === null) return "—";
      if (!conflict) return <Badge variant="secondary">OK</Badge>;
      return <Badge variant="destructive">Verstoß</Badge>;
    },
  },
  { accessorKey: "sysvDeputyDepartment", header: "SysVStv Abteilung", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "clusterFromTechInfo", header: "Cluster", cell: ({ getValue }) => getValue() || "—" },
  {
    accessorKey: "cvBackup",
    header: "CV-Backup",
    cell: ({ getValue }) => {
      const val = getValue() as boolean | null;
      if (val === null) return "—";
      return val ? "Ja" : "Nein";
    },
  },
  { accessorKey: "bz", header: "BZ", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "az", header: "AZ", cell: ({ getValue }) => getValue() || "—" },
];

const clientColumns: ColumnDef<TechInfoClientLatest, unknown>[] = [
  { accessorKey: "clientName", header: "Name" },
  { accessorKey: "blz", header: "BLZ", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "standort", header: "Standort", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "ip", header: "IP", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "macAddress", header: "MAC Adresse", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "poolName", header: "Poolname", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "modifiedBy", header: "Geändert von", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "modifiedAt", header: "Änderungsdatum", cell: ({ getValue }) => formatIsoDateTime(getValue() as string | null) },
  { accessorKey: "createdBy", header: "Erstellt von", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "createdAt", header: "Erstellungsdatum", cell: ({ getValue }) => formatIsoDateTime(getValue() as string | null) },
  { accessorKey: "user", header: "User", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "hardware", header: "Hardware", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "os", header: "OS", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "cluster", header: "Cluster", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "vcenter", header: "vCenter", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "site", header: "Site", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "insider", header: "Insider", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "hwChanges", header: "HW Änderungen", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "monitoring", header: "Monitoring", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "domain", header: "Domäne", cell: ({ getValue }) => getValue() || "—" },
];

export default function TechInfo() {
  const { snapshots, filters } = useActiveSnapshotIds();
  const { allVms } = useVms();
  const { openVmDetail, vmDetailDialog } = useVmDetailDialog(allVms);
  const { openClientDetail, clientDetailDialog } = useClientDetailDialog(allVms);
  const { hasActiveFilter, matchingVmKeys } = useGlobalVmFilterEngine();
  const clusterFilterSet = useMemo(() => new Set(filters.clusters), [filters.clusters]);
  const hostFilterSet = useMemo(() => new Set(filters.hosts), [filters.hosts]);

  const scopeVms = useMemo(
    () =>
      applyVmScopeToVms(allVms, {
        vmPowerScope: filters.vmPowerScope,
        excludeVclsVms: filters.excludeVclsVms,
      }).filter((vm) => {
        if (hasActiveFilter && matchingVmKeys && !matchingVmKeys.has(vm.vmKey)) return false;
        if (clusterFilterSet.size > 0 && (!vm.cluster || !clusterFilterSet.has(vm.cluster))) return false;
        if (hostFilterSet.size > 0 && (!vm.host || !hostFilterSet.has(vm.host))) return false;
        return true;
      }),
    [allVms, clusterFilterSet, filters.excludeVclsVms, filters.vmPowerScope, hasActiveFilter, hostFilterSet, matchingVmKeys],
  );

  const { data: techInfoLatest = [] } = useTechInfoLatestByVmNames(scopeVms.map((vm) => vm.vmName));
  const { data: techInfoClients = [] } = useAllTechInfoClientLatest();

  const byVmName = useMemo(() => {
    const map = new Map<string, (typeof techInfoLatest)[number]>();
    for (const entry of techInfoLatest) map.set(entry.vmNameNorm, entry);
    return map;
  }, [techInfoLatest]);

  const rows = useMemo<TechInfoVmRow[]>(
    () =>
      scopeVms.map((vm) => {
        const techInfo = byVmName.get(vm.vmName.trim().toLowerCase()) ?? null;
        return {
          vmName: vm.vmName,
          serverType: techInfo?.serverType ?? null,
          maintenanceWindow: techInfo?.maintenanceWindow ?? null,
          operatingSystem: techInfo?.operatingSystem ?? null,
          comment: techInfo?.comment ?? null,
          sysv: techInfo?.sysv ?? null,
          sysvDepartment: techInfo?.sysvDepartment ?? null,
          sysvDeputy: techInfo?.sysvDeputy ?? null,
          sysvDeputyConflict: techInfo ? hasIdenticalSysvAndDeputy(techInfo.sysv, techInfo.sysvDeputy) : null,
          sysvDeputyDepartment: techInfo?.sysvDeputyDepartment ?? null,
          bz: techInfo?.bz ?? null,
          clusterFromTechInfo: techInfo?.clusterFromTechInfo ?? null,
          cvBackup: techInfo?.cvBackup ?? null,
          az: techInfo?.az ?? null,
          hasTechInfo: techInfo !== null,
        };
      }),
    [scopeVms, byVmName],
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
    if (!q) return techInfoClients.slice().sort(byClientNameAsc);
    return techInfoClients.filter((row) => {
      const values = [
        row.clientName, row.blz, row.standort, row.ip, row.macAddress, row.poolName,
        row.modifiedBy, row.modifiedAt, row.createdBy, row.createdAt, row.user,
        row.hardware, row.os, row.cluster, row.vcenter, row.site, row.insider,
        row.hwChanges, row.monitoring, row.domain,
      ];
      return values.some((v) => String(v ?? "").toLowerCase().includes(q));
    }).sort(byClientNameAsc);
  }, [techInfoClients, filters.search]);

  const vmTotal = searchedRows.length;
  const vmWithTechInfo = searchedRows.filter((row) => row.hasTechInfo).length;
  const vmWithoutTechInfo = vmTotal - vmWithTechInfo;

  if (snapshots.length === 0 && techInfoClients.length === 0) {
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
        <KpiCard title="Aktive VMs gesamt" value={formatNum(vmTotal)} icon={<Monitor className="h-4 w-4" />} />
        <KpiCard title="VMs mit Tech-Info" value={formatNum(vmWithTechInfo)} severity="ok" icon={<ClipboardList className="h-4 w-4" />} />
        <KpiCard title="VMs ohne Zuordnung" value={formatNum(vmWithoutTechInfo)} severity={vmWithoutTechInfo > 0 ? "warn" : "ok"} icon={<Link2Off className="h-4 w-4" />} />
      </div>
      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">VM Tech-Info Server ({searchedRows.length})</h3>
        <VirtualTable data={searchedRows} columns={columns} height={460} onRowClick={openVmDetail} />
      </div>
      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">VM Tech-Info Clients ({searchedClientRows.length})</h3>
        {techInfoClients.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Tech-Info-Client-Datei importiert.</p>
        ) : (
          <VirtualTable data={searchedClientRows} columns={clientColumns} height={460} exportFileName="tech-info-clients" onRowClick={openClientDetail} />
        )}
      </div>
      {vmDetailDialog}
      {clientDetailDialog}
    </div>
  );
}
