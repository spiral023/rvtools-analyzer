import { useMemo } from "react";
import { BarChart3, Cpu, Server } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ColumnDef } from "@tanstack/react-table";
import { useActiveSnapshotIds, useHosts, useRawSheet } from "@/hooks/useActiveSnapshots";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_AXIS_STYLE, CHART_COLORS, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/chartStyles";
import { formatNum, formatPct } from "@/lib/xlsx/parseHelpers";

type ReleaseType = "vcenter" | "esxi";

interface KnownRelease {
  type: ReleaseType;
  title: string;
  releaseDateIso: string;
  build: string;
}

interface ReleaseUsageRow extends KnownRelease {
  releaseDateLabel: string;
  releaseTimestamp: number;
  usageCount: number;
  totalAssets: number;
  adoptionPct: number;
}

const KNOWN_RELEASES: KnownRelease[] = [
  { type: "vcenter", title: "VMware vCenter 8.0 Update 3i", releaseDateIso: "2026-02-24", build: "25197330" },
  { type: "vcenter", title: "VMware vCenter 8.0 Update 3h", releaseDateIso: "2025-12-15", build: "25092719" },
  { type: "vcenter", title: "VMware vCenter 8.0 Update 3g", releaseDateIso: "2025-07-29", build: "24853646" },
  { type: "esxi", title: "VMware ESXi 8.0 Update 3h", releaseDateIso: "2025-12-15", build: "25067014" },
  { type: "esxi", title: "VMware ESXi 8.0 Update 3i", releaseDateIso: "2026-02-24", build: "25205845" },
  { type: "esxi", title: "VMware ESXi 8.0 Update 3g", releaseDateIso: "2025-07-29", build: "24859861" },
];

function extractBuild(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  const matches = text.match(/\d{7,}/g);
  if (!matches || matches.length === 0) return null;
  return matches[matches.length - 1];
}

function toReleaseTimestamp(releaseDateIso: string): number {
  return new Date(`${releaseDateIso}T00:00:00Z`).getTime();
}

function formatReleaseDate(releaseDateIso: string): string {
  return new Date(`${releaseDateIso}T00:00:00Z`).toLocaleDateString("de-DE");
}

const releaseColumns: ColumnDef<ReleaseUsageRow, unknown>[] = [
  { accessorKey: "title", header: "Release" },
  {
    accessorKey: "releaseTimestamp",
    header: "Release Date",
    cell: ({ row }) => <span className="font-mono-data">{row.original.releaseDateLabel}</span>,
  },
  { accessorKey: "build", header: "ISO Build", cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "usageCount", header: "In Nutzung", cell: ({ row }) => `${formatNum(row.original.usageCount)} / ${formatNum(row.original.totalAssets)}` },
  {
    accessorKey: "adoptionPct",
    header: "Adoption",
    cell: ({ getValue }) => {
      const value = getValue() as number;
      return (
        <span className={value >= 75 ? "text-success" : value >= 30 ? "text-warning" : "text-muted-foreground"}>
          {formatPct(value)}
        </span>
      );
    },
  },
];

export default function VmwareVersions() {
  const { snapshots, activeSnapshotIds } = useActiveSnapshotIds();
  const { data: hosts = [] } = useHosts();
  const { data: rawVSource = [] } = useRawSheet("vSource");

  const activeSnapshots = useMemo(
    () => snapshots.filter((snapshot) => activeSnapshotIds.includes(snapshot.snapshotId)),
    [snapshots, activeSnapshotIds],
  );

  const vcenterBuildCounts = useMemo(() => {
    const buildByVcenter = new Map<string, string>();
    const sourceBySnapshot = new Map<string, string>();

    for (const row of rawVSource) {
      if (sourceBySnapshot.has(row.snapshotId)) continue;
      const build = extractBuild(row.data["Build"]) || extractBuild(row.data["Fullname"]) || extractBuild(row.data["Version"]);
      if (build) sourceBySnapshot.set(row.snapshotId, build);
    }

    for (const snapshot of activeSnapshots) {
      const build = sourceBySnapshot.get(snapshot.snapshotId);
      if (build) buildByVcenter.set(snapshot.vcenterId, build);
    }

    const counts = new Map<string, number>();
    for (const build of buildByVcenter.values()) {
      counts.set(build, (counts.get(build) || 0) + 1);
    }
    return counts;
  }, [rawVSource, activeSnapshots]);

  const esxiBuildCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const host of hosts) {
      const build = extractBuild(host.build) || extractBuild(host.version);
      if (!build) continue;
      counts.set(build, (counts.get(build) || 0) + 1);
    }
    return counts;
  }, [hosts]);

  const totalActiveVcenters = useMemo(
    () => new Set(activeSnapshots.map((snapshot) => snapshot.vcenterId)).size,
    [activeSnapshots],
  );
  const totalActiveHosts = hosts.length;

  const vcenterRows = useMemo<ReleaseUsageRow[]>(
    () =>
      KNOWN_RELEASES
        .filter((release) => release.type === "vcenter")
        .map((release) => {
          const usageCount = vcenterBuildCounts.get(release.build) || 0;
          return {
            ...release,
            releaseDateLabel: formatReleaseDate(release.releaseDateIso),
            releaseTimestamp: toReleaseTimestamp(release.releaseDateIso),
            usageCount,
            totalAssets: totalActiveVcenters,
            adoptionPct: totalActiveVcenters > 0 ? Math.round((usageCount / totalActiveVcenters) * 1000) / 10 : 0,
          };
        })
        .sort((a, b) => b.releaseTimestamp - a.releaseTimestamp),
    [vcenterBuildCounts, totalActiveVcenters],
  );

  const esxiRows = useMemo<ReleaseUsageRow[]>(
    () =>
      KNOWN_RELEASES
        .filter((release) => release.type === "esxi")
        .map((release) => {
          const usageCount = esxiBuildCounts.get(release.build) || 0;
          return {
            ...release,
            releaseDateLabel: formatReleaseDate(release.releaseDateIso),
            releaseTimestamp: toReleaseTimestamp(release.releaseDateIso),
            usageCount,
            totalAssets: totalActiveHosts,
            adoptionPct: totalActiveHosts > 0 ? Math.round((usageCount / totalActiveHosts) * 1000) / 10 : 0,
          };
        })
        .sort((a, b) => b.releaseTimestamp - a.releaseTimestamp),
    [esxiBuildCounts, totalActiveHosts],
  );

  const vcenterLatestUsage = vcenterRows[0]?.usageCount || 0;
  const esxiLatestUsage = esxiRows[0]?.usageCount || 0;
  const trackedVcenterUsage = vcenterRows.reduce((sum, row) => sum + row.usageCount, 0);
  const trackedEsxiUsage = esxiRows.reduce((sum, row) => sum + row.usageCount, 0);

  const vcenterChartData = vcenterRows.map((row) => ({
    name: row.title.replace("VMware vCenter ", ""),
    usage: row.usageCount,
  }));

  const esxiChartData = esxiRows.map((row) => ({
    name: row.title.replace("VMware ESXi ", ""),
    usage: row.usageCount,
  }));

  if (snapshots.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold">VMware Versions</h1>
        <EmptyState
          icon={<BarChart3 className="h-6 w-6" />}
          title="Keine Daten"
          description="Laden Sie RVTools-Daten hoch."
          actionLabel="Zum Upload"
          actionTo="/upload"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">VMware Versions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Neueste vCenter- und ESXi-Releases mit Nutzung in der aktiven Umgebung.
        </p>
      </div>

      <FilterBar />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard title="Aktive vCenter" value={formatNum(totalActiveVcenters)} icon={<Server className="h-4 w-4" />} />
        <KpiCard title="Aktive ESXi Hosts" value={formatNum(totalActiveHosts)} icon={<Cpu className="h-4 w-4" />} />
        <KpiCard
          title="vCenter auf 3i"
          value={formatNum(vcenterLatestUsage)}
          subtitle={`${totalActiveVcenters > 0 ? Math.round((vcenterLatestUsage / totalActiveVcenters) * 100) : 0}%`}
          severity={totalActiveVcenters > 0 && vcenterLatestUsage < totalActiveVcenters ? "warn" : "ok"}
        />
        <KpiCard
          title="ESXi auf 3i"
          value={formatNum(esxiLatestUsage)}
          subtitle={`${totalActiveHosts > 0 ? Math.round((esxiLatestUsage / totalActiveHosts) * 100) : 0}%`}
          severity={totalActiveHosts > 0 && esxiLatestUsage < totalActiveHosts ? "warn" : "ok"}
        />
        <KpiCard
          title="vCenter Releases erkannt"
          value={formatNum(trackedVcenterUsage)}
          subtitle={`${totalActiveVcenters > 0 ? Math.round((trackedVcenterUsage / totalActiveVcenters) * 100) : 0}% abgedeckt`}
          severity={trackedVcenterUsage < totalActiveVcenters ? "warn" : "ok"}
        />
        <KpiCard
          title="ESXi Releases erkannt"
          value={formatNum(trackedEsxiUsage)}
          subtitle={`${totalActiveHosts > 0 ? Math.round((trackedEsxiUsage / totalActiveHosts) * 100) : 0}% abgedeckt`}
          severity={trackedEsxiUsage < totalActiveHosts ? "warn" : "ok"}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/50 bg-card/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">vCenter Release Nutzung</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={vcenterChartData}>
                <XAxis dataKey="name" tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
                <Bar dataKey="usage" radius={[4, 4, 0, 0]}>
                  {vcenterChartData.map((_, index) => (
                    <Cell key={index} fill={index === 0 ? CHART_COLORS.success : CHART_COLORS.primary} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">ESXi Release Nutzung</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={esxiChartData}>
                <XAxis dataKey="name" tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
                <Bar dataKey="usage" radius={[4, 4, 0, 0]}>
                  {esxiChartData.map((_, index) => (
                    <Cell key={index} fill={index === 0 ? CHART_COLORS.success : CHART_COLORS.info} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
          Neueste vCenter Versionen
        </h3>
        <VirtualTable data={vcenterRows} columns={releaseColumns} height={260} />
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
          Neueste ESXi Versionen
        </h3>
        <VirtualTable data={esxiRows} columns={releaseColumns} height={260} />
      </div>
    </div>
  );
}
