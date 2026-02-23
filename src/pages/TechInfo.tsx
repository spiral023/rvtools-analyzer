import { useMemo } from "react";
import { useActiveSnapshotIds, useVmsWithTechInfo } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Monitor, ClipboardList, Link2Off } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { formatNum } from "@/lib/xlsx/parseHelpers";

interface TechInfoVmRow {
  vmName: string;
  maintenanceWindow: string | null;
  operatingSystem: string | null;
  comment: string | null;
  sysv: string | null;
  sysvDepartment: string | null;
  sysvDeputy: string | null;
  sysvDeputyDepartment: string | null;
  bz: string | null;
  clusterFromTechInfo: string | null;
  cvBackup: boolean | null;
  az: string | null;
  hasTechInfo: boolean;
}

const columns: ColumnDef<TechInfoVmRow, unknown>[] = [
  { accessorKey: "vmName", header: "VM" },
  { accessorKey: "maintenanceWindow", header: "Wartungsfenster", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "operatingSystem", header: "Betriebssystem", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "comment", header: "Kommentar", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "sysv", header: "SysV", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "sysvDepartment", header: "SysV Abteilung", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "sysvDeputy", header: "SysVStv", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "sysvDeputyDepartment", header: "SysVStv Abteilung", cell: ({ getValue }) => getValue() || "—" },
  { accessorKey: "bz", header: "BZ", cell: ({ getValue }) => getValue() || "—" },
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
  { accessorKey: "az", header: "AZ", cell: ({ getValue }) => getValue() || "—" },
];

export default function TechInfo() {
  const { snapshots, filters } = useActiveSnapshotIds();
  const { vmsWithTechInfo } = useVmsWithTechInfo();

  const rows = useMemo<TechInfoVmRow[]>(
    () =>
      vmsWithTechInfo.map((vm) => ({
        vmName: vm.vmName,
        maintenanceWindow: vm.techInfo?.maintenanceWindow ?? null,
        operatingSystem: vm.techInfo?.operatingSystem ?? null,
        comment: vm.techInfo?.comment ?? null,
        sysv: vm.techInfo?.sysv ?? null,
        sysvDepartment: vm.techInfo?.sysvDepartment ?? null,
        sysvDeputy: vm.techInfo?.sysvDeputy ?? null,
        sysvDeputyDepartment: vm.techInfo?.sysvDeputyDepartment ?? null,
        bz: vm.techInfo?.bz ?? null,
        clusterFromTechInfo: vm.techInfo?.clusterFromTechInfo ?? null,
        cvBackup: vm.techInfo?.cvBackup ?? null,
        az: vm.techInfo?.az ?? null,
        hasTechInfo: vm.techInfo !== null,
      })),
    [vmsWithTechInfo],
  );

  const vmTotal = rows.length;
  const vmWithTechInfo = rows.filter((row) => row.hasTechInfo).length;
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
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">VM Tech-Info ({rows.length})</h3>
        <VirtualTable data={rows} columns={columns} globalFilter={filters.search} height={460} />
      </div>
    </div>
  );
}
