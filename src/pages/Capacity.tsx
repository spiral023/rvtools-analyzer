import { useMemo } from "react";
import { useActiveSnapshotIds, useVms, useDatastores, useRawSheet } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { GlobalFilterScopeHint } from "@/components/global-filter/GlobalFilterScopeHint";
import { useGlobalVmFilterEngine } from "@/hooks/useGlobalVmFilter";
import { HardDrive, Server, Layers } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "@/components/charts/recharts";
import { formatBytes, formatPct, formatNum } from "@/lib/xlsx/parseHelpers";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_AXIS_STYLE, CHART_COLORS } from "@/lib/chartStyles";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  CAPACITY_KPI,
  CAPACITY_DS_COLUMNS,
  CAPACITY_RP_COLUMNS,
  CAPACITY_THIN_COLUMNS,
  CAPACITY_SECTIONS,
} from "@/lib/glossaries/capacity";
import type { ColumnDef } from "@tanstack/react-table";
import type { NormalizedDatastore } from "@/domain/models/types";

const dsColumns: ColumnDef<NormalizedDatastore, unknown>[] = [
  { accessorKey: "name", header: "Datastore", meta: { info: CAPACITY_DS_COLUMNS.name } },
  { accessorKey: "type", header: "Typ", meta: { info: CAPACITY_DS_COLUMNS.type } },
  { accessorKey: "capacityMiB", header: "Kapazität", meta: { info: CAPACITY_DS_COLUMNS.capacityMiB }, cell: ({ getValue }) => formatBytes(getValue() as number | null) },
  { accessorKey: "inUseMiB", header: "Belegt", meta: { info: CAPACITY_DS_COLUMNS.inUseMiB }, cell: ({ getValue }) => formatBytes(getValue() as number | null) },
  { accessorKey: "freeMiB", header: "Frei", meta: { info: CAPACITY_DS_COLUMNS.freeMiB }, cell: ({ getValue }) => formatBytes(getValue() as number | null) },
  { accessorKey: "freePct", header: "Frei %", meta: { info: CAPACITY_DS_COLUMNS.freePct }, cell: ({ getValue }) => {
    const v = getValue() as number | null;
    return <span className={v !== null && v < 10 ? "text-destructive font-semibold" : v !== null && v < 20 ? "text-warning" : "text-success"}>{formatPct(v)}</span>;
  }},
  { accessorKey: "clusterName", header: "Cluster", meta: { info: CAPACITY_DS_COLUMNS.clusterName } },
];

interface RpRow { name: string; path: string; status: string; vms: number; cpuLimit: string; cpuReservation: number; cpuExpandable: boolean; memLimit: string; memReservation: number; memExpandable: boolean; risk: string }
interface ThinRiskRow { datastore: string; freePct: number | null; thinDisks: number; totalThinMiB: number; risk: string }

function CapacityOverviewCards({
  datastoresCount,
  avgFreePct,
  critDs,
  warnDs,
  rpRisks,
  storageEfficiency,
}: {
  datastoresCount: number;
  avgFreePct: number | null;
  critDs: number;
  warnDs: number;
  rpRisks: number;
  storageEfficiency: { provGiB: number; inUseGiB: number; ratio: number };
}) {
  return (
    <KpiGrid>
      <KpiCard title="Datastores" value={formatNum(datastoresCount)} icon={<HardDrive className="h-4 w-4" />} info={CAPACITY_KPI.datastores} />
      <KpiCard title="Ø Frei %" value={avgFreePct !== null ? formatPct(avgFreePct) : "—"} severity={avgFreePct !== null && avgFreePct < 15 ? "crit" : avgFreePct !== null && avgFreePct < 25 ? "warn" : "ok"} info={CAPACITY_KPI.avgFreePct} />
      <KpiCard title="Kritisch (<10%)" value={formatNum(critDs)} severity={critDs > 0 ? "crit" : "ok"} info={CAPACITY_KPI.critDs} />
      <KpiCard title="Warnung (<20%)" value={formatNum(warnDs)} severity={warnDs > 0 ? "warn" : "ok"} info={CAPACITY_KPI.warnDs} />
      <KpiCard title="RP Risiken" value={formatNum(rpRisks)} severity={rpRisks > 0 ? "warn" : "ok"} icon={<Layers className="h-4 w-4" />} info={CAPACITY_KPI.rpRisks} />
      <KpiCard title="Speicherwirkgrad" value={`${storageEfficiency.ratio}%`} subtitle={`${storageEfficiency.inUseGiB.toFixed(0)} / ${storageEfficiency.provGiB.toFixed(0)} GiB`} icon={<Server className="h-4 w-4" />} info={CAPACITY_KPI.storageEfficiency} />
    </KpiGrid>
  );
}

function CapacityChartSection({
  dsChart,
}: {
  dsChart: Array<{ name: string; freePct: number }>;
}) {
  return (
    <>
      <div>
        <div className="rounded-lg border border-border/50 bg-card/30 p-4">
          <InfoTooltip entry={CAPACITY_SECTIONS.dsHeadroom} side="bottom">
            <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Datastore Headroom (Frei %)</h3>
          </InfoTooltip>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dsChart} layout="vertical">
              <XAxis type="number" domain={[0, 100]} tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={150} tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
              <Bar dataKey="freePct" radius={[0, 4, 4, 0]}>
                {dsChart.map((entry) => <Cell key={entry.name} fill={entry.freePct < 10 ? CHART_COLORS.danger : entry.freePct < 20 ? CHART_COLORS.warning : CHART_COLORS.success} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

function CapacityTablesSection({
  datastores,
  globalFilter,
  rpData,
  thinRiskData,
}: {
  datastores: NormalizedDatastore[];
  globalFilter: string;
  rpData: RpRow[];
  thinRiskData: ThinRiskRow[];
}) {
  return (
    <>
      <div><InfoTooltip entry={CAPACITY_SECTIONS.datastoreDetails} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Datastore Details</h3></InfoTooltip><VirtualTable data={datastores} columns={dsColumns} globalFilter={globalFilter} initialSorting={[{ id: "freePct", desc: false }]} /></div>

      {rpData.length > 0 && (
        <div><InfoTooltip entry={CAPACITY_SECTIONS.resourcePool} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Resource Pool Pressure ({rpData.length})</h3></InfoTooltip><VirtualTable data={rpData} columns={rpColumns} globalFilter={globalFilter} height={300} /></div>
      )}

      {thinRiskData.length > 0 && (
        <div><InfoTooltip entry={CAPACITY_SECTIONS.thinRisk} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Thin-Provisioning Risiko</h3></InfoTooltip><VirtualTable data={thinRiskData} columns={thinRiskColumns} globalFilter={globalFilter} height={250} /></div>
      )}
    </>
  );
}

const rpColumns: ColumnDef<RpRow, unknown>[] = [
  { accessorKey: "name", header: "Resource Pool", meta: { info: CAPACITY_RP_COLUMNS.name } },
  { accessorKey: "path", header: "Pfad", meta: { info: CAPACITY_RP_COLUMNS.path } },
  { accessorKey: "status", header: "Status", meta: { info: CAPACITY_RP_COLUMNS.status }, cell: ({ getValue }) => { const v = getValue() as string; return <span className={v === "green" ? "text-success" : v === "yellow" ? "text-warning" : "text-destructive"}>{v}</span>; }},
  { accessorKey: "vms", header: "VMs", meta: { info: CAPACITY_RP_COLUMNS.vms } },
  { accessorKey: "cpuLimit", header: "CPU Limit", meta: { info: CAPACITY_RP_COLUMNS.cpuLimit } },
  { accessorKey: "cpuReservation", header: "CPU Res. MHz", meta: { info: CAPACITY_RP_COLUMNS.cpuReservation } },
  { accessorKey: "cpuExpandable", header: "CPU Expand.", meta: { info: CAPACITY_RP_COLUMNS.cpuExpandable }, cell: ({ getValue }) => getValue() ? "Ja" : <span className="text-warning">Nein</span> },
  { accessorKey: "memLimit", header: "Mem Limit", meta: { info: CAPACITY_RP_COLUMNS.memLimit } },
  { accessorKey: "memReservation", header: "Mem Res. MiB", meta: { info: CAPACITY_RP_COLUMNS.memReservation } },
  { accessorKey: "memExpandable", header: "Mem Expand.", meta: { info: CAPACITY_RP_COLUMNS.memExpandable }, cell: ({ getValue }) => getValue() ? "Ja" : <span className="text-warning">Nein</span> },
  { accessorKey: "risk", header: "Risiko", meta: { info: CAPACITY_RP_COLUMNS.risk }, cell: ({ getValue }) => { const v = getValue() as string; return <span className={v === "hoch" ? "text-destructive font-semibold" : v === "mittel" ? "text-warning" : "text-success"}>{v}</span>; }},
];

const thinRiskColumns: ColumnDef<ThinRiskRow, unknown>[] = [
  { accessorKey: "datastore", header: "Datastore", meta: { info: CAPACITY_THIN_COLUMNS.datastore } },
  { accessorKey: "freePct", header: "Frei % (knappster DS)", meta: { info: CAPACITY_THIN_COLUMNS.freePct }, cell: ({ getValue }) => { const v = getValue() as number | null; if (v === null) return "—"; return <span className={v < 10 ? "text-destructive font-semibold" : v < 20 ? "text-warning" : ""}>{formatPct(v)}</span>; }},
  { accessorKey: "thinDisks", header: "Thin Disks", meta: { info: CAPACITY_THIN_COLUMNS.thinDisks } },
  { accessorKey: "totalThinMiB", header: "Thin Kapaz.", meta: { info: CAPACITY_THIN_COLUMNS.totalThinMiB }, cell: ({ getValue }) => formatBytes(getValue() as number) },
  { accessorKey: "risk", header: "Risiko", meta: { info: CAPACITY_THIN_COLUMNS.risk }, cell: ({ getValue }) => { const v = getValue() as string; return <span className={v === "hoch" ? "text-destructive font-semibold" : v === "mittel" ? "text-warning" : "text-success"}>{v}</span>; }},
];

function useCapacityPageData() {
  const { snapshots, filters, snapshotsLoading } = useActiveSnapshotIds();
  const { vms, isLoading: vmsLoading } = useVms();
  const { filterVmRows } = useGlobalVmFilterEngine();
  const { data: datastores = [], isLoading: datastoresLoading } = useDatastores();
  const { data: rawRP = [], isLoading: rawRPLoading } = useRawSheet("vRP");
  const { data: rawDisks = [], isLoading: rawDisksLoading } = useRawSheet("vDisk");
  const dataLoading = snapshotsLoading || vmsLoading || datastoresLoading || rawRPLoading || rawDisksLoading;
  const filteredRawDisks = useMemo(() => filterVmRows(rawDisks), [filterVmRows, rawDisks]);

  const { avgFreePct, critDs, warnDs } = useMemo(() => {
    let sum = 0, withPctCount = 0, crit = 0, warn = 0;
    for (const d of datastores) {
      if (d.freePct === null) continue;
      withPctCount += 1;
      sum += d.freePct;
      if (d.freePct < 10) crit += 1;
      else if (d.freePct < 20) warn += 1;
    }
    return {
      avgFreePct: withPctCount ? sum / withPctCount : null,
      critDs: crit,
      warnDs: warn,
    };
  }, [datastores]);

  const dsChart = useMemo(() => {
    return datastores.filter((d) => d.freePct !== null).map((d) => ({ name: d.name.length > 20 ? d.name.slice(0, 18) + "…" : d.name, freePct: Math.round(d.freePct! * 10) / 10 })).sort((a, b) => a.freePct - b.freePct).slice(0, 15);
  }, [datastores]);

  // Resource Pool Pressure
  const rpData = useMemo<RpRow[]>(() => {
    return rawRP.map((r) => {
      const d = r.data;
      const cpuLimit = Number(d["CPU limit"] ?? -1);
      const memLimit = Number(d["Mem limit"] ?? -1);
      const cpuExp = String(d["CPU expandableReservation"] || "").toLowerCase() === "true";
      const memExp = String(d["Mem expandableReservation"] || "").toLowerCase() === "true";
      const cpuRes = Number(d["CPU reservation"] || 0);
      const memRes = Number(d["Mem reservation"] || 0);
      let risk = "niedrig";
      if ((cpuLimit > 0 && cpuLimit !== -1) || (memLimit > 0 && memLimit !== -1)) risk = "mittel";
      if (!cpuExp || !memExp) risk = "mittel";
      if ((cpuLimit > 0 && cpuLimit !== -1 && !cpuExp) || (memLimit > 0 && memLimit !== -1 && !memExp)) risk = "hoch";
      return {
        name: String(d["Resource Pool name"] || ""),
        path: String(d["Resource Pool path"] || ""),
        status: String(d["Status"] || ""),
        vms: Number(d["# VMs"] || 0),
        cpuLimit: cpuLimit === -1 ? "Unlimited" : String(cpuLimit),
        cpuReservation: cpuRes,
        cpuExpandable: cpuExp,
        memLimit: memLimit === -1 ? "Unlimited" : String(memLimit),
        memReservation: memRes,
        memExpandable: memExp,
        risk,
      };
    }).sort((a, b) => (a.risk === "hoch" ? 0 : a.risk === "mittel" ? 1 : 2) - (b.risk === "hoch" ? 0 : b.risk === "mittel" ? 1 : 2));
  }, [rawRP]);

  const rpRisks = rpData.filter((r) => r.risk !== "niedrig").length;

  // Thin-Provisioning Risk: vDisk trägt keinen Datastore-Namen, daher wird
  // global gezählt und gegen den knappsten Datastore bewertet.
  const thinRiskData = useMemo<ThinRiskRow[]>(() => {
    let thinDisks = 0;
    let totalThinMiB = 0;
    for (const r of filteredRawDisks) {
      if (String(r.data["Thin"] || "").toLowerCase() === "true") {
        thinDisks++;
        totalThinMiB += Number(r.data["Capacity MiB"] || 0);
      }
    }
    if (thinDisks === 0) return [];
    const freePcts = datastores.map((d) => d.freePct).filter((v): v is number => v !== null);
    const minFreePct = freePcts.length ? Math.min(...freePcts) : null;
    let risk = "niedrig";
    if (minFreePct !== null && minFreePct < 20) risk = "mittel";
    if (minFreePct !== null && minFreePct < 10 && thinDisks > 5) risk = "hoch";
    return [{ datastore: "Alle Datastores (gesamt)", freePct: minFreePct, thinDisks, totalThinMiB, risk }];
  }, [datastores, filteredRawDisks]);

  // Unshared vs Provisioned
  const storageEfficiency = useMemo(() => {
    const totalProv = vms.reduce((s, v) => s + (v.provisionedMiB || 0), 0);
    const totalInUse = vms.reduce((s, v) => s + (v.inUseMiB || 0), 0);
    const ratio = totalProv > 0 ? (totalInUse / totalProv) * 100 : 0;
    return { provGiB: totalProv / 1024, inUseGiB: totalInUse / 1024, ratio: Math.round(ratio * 10) / 10 };
  }, [vms]);

  return {
    snapshots,
    dataLoading,
    filters,
    datastores,
    avgFreePct,
    critDs,
    warnDs,
    dsChart,
    rpData,
    rpRisks,
    thinRiskData,
    storageEfficiency,
  };
}

export default function Capacity() {
  const {
    snapshots,
    dataLoading,
    filters,
    datastores,
    avgFreePct,
    critDs,
    warnDs,
    dsChart,
    rpData,
    rpRisks,
    thinRiskData,
    storageEfficiency,
  } = useCapacityPageData();

  if (dataLoading) return <PageLoadingState title="Capacity" />;

  if (snapshots.length === 0) {
    return (<div className="space-y-6 animate-fade-in"><h1 className="text-2xl font-bold">Capacity</h1><EmptyState icon={<HardDrive className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" /></div>);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Capacity">
      </PageHeader>
      <GlobalFilterScopeHint text="Thin-Provisioning und VM-basierte Capacity-Kennzahlen folgen dem globalen Filter; Host-, Cluster- und Datastore-Inventar bleibt unverändert." />
      <CapacityOverviewCards
        datastoresCount={datastores.length}
        avgFreePct={avgFreePct}
        critDs={critDs}
        warnDs={warnDs}
        rpRisks={rpRisks}
        storageEfficiency={storageEfficiency}
      />

      <CapacityChartSection
        dsChart={dsChart}
      />

      <CapacityTablesSection
        datastores={datastores}
        globalFilter={filters.search}
        rpData={rpData}
        thinRiskData={thinRiskData}
      />
    </div>
  );
}
