import { useMemo } from "react";
import { useActiveSnapshotIds, useVms, useTechInfoLatestByVmNames } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Badge } from "@/components/ui/badge";
import { useGlobalVmFilterEngine } from "@/hooks/useGlobalVmFilter";
import { useVmDetailDialog } from "@/hooks/useVmDetailDialog";
import { Monitor, ClipboardList, Link2Off } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { formatNum, hasIdenticalSysvAndDeputy } from "@/lib/xlsx/parseHelpers";

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

export default function TechInfo() {
  const { snapshots, filters } = useActiveSnapshotIds();
  const { allVms } = useVms();
  const { openVmDetail, vmDetailDialog } = useVmDetailDialog(allVms);
  const { hasActiveFilter, matchingVmKeys } = useGlobalVmFilterEngine();

  const scopeVms = useMemo(
    () =>
      allVms.filter((vm) => {
        if (hasActiveFilter && matchingVmKeys && !matchingVmKeys.has(vm.vmKey)) return false;
        if (filters.clusters.length > 0 && (!vm.cluster || !filters.clusters.includes(vm.cluster))) return false;
        if (filters.hosts.length > 0 && (!vm.host || !filters.hosts.includes(vm.host))) return false;
        return true;
      }),
    [allVms, filters.clusters, filters.hosts, hasActiveFilter, matchingVmKeys],
  );

  const { data: techInfoLatest = [] } = useTechInfoLatestByVmNames(scopeVms.map((vm) => vm.vmName));

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

  const vmTotal = searchedRows.length;
  const vmWithTechInfo = searchedRows.filter((row) => row.hasTechInfo).length;
  const vmWithoutTechInfo = vmTotal - vmWithTechInfo;

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
        <KpiCard title="Aktive VMs gesamt" value={formatNum(vmTotal)} icon={<Monitor className="h-4 w-4" />} />
        <KpiCard title="VMs mit Tech-Info" value={formatNum(vmWithTechInfo)} severity="ok" icon={<ClipboardList className="h-4 w-4" />} />
        <KpiCard title="VMs ohne Zuordnung" value={formatNum(vmWithoutTechInfo)} severity={vmWithoutTechInfo > 0 ? "warn" : "ok"} icon={<Link2Off className="h-4 w-4" />} />
      </div>
      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">VM Tech-Info ({searchedRows.length})</h3>
        <VirtualTable data={searchedRows} columns={columns} height={460} onRowClick={openVmDetail} />
      </div>
      {vmDetailDialog}
    </div>
  );
}
