import { useMemo } from "react";
import { Cpu, Server } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/components/charts/recharts";
import type { ColumnDef } from "@tanstack/react-table";
import { useActiveSnapshotIds, useHosts, useRawSheet } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { VERSIONS_KPI, VERSIONS_COLUMNS, COMPLIANCE_SECTIONS } from "@/lib/glossaries/compliance";
import { CHART_AXIS_STYLE, CHART_COLORS, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/chartStyles";
import { buildReleaseUsageRows, getLatestRelease, type ReleaseUsageRow } from "@/lib/vmwareReleaseCatalog";
import { formatNum, formatPct } from "@/lib/xlsx/parseHelpers";

function extractBuild(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  const matches = text.match(/\d{7,}/g);
  if (!matches || matches.length === 0) return null;
  return matches[matches.length - 1];
}

const releaseColumns: ColumnDef<ReleaseUsageRow, unknown>[] = [
  {
    accessorKey: "title",
    header: "Release",
    meta: { info: VERSIONS_COLUMNS.title },
    cell: ({ row }) => (
      <a
        href={row.original.releaseNotesUrl}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        {row.original.title}
      </a>
    ),
  },
  { accessorKey: "version", header: "Version", meta: { info: VERSIONS_COLUMNS.version }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  {
    accessorKey: "releaseTimestamp",
    header: "Release Date",
    meta: { info: VERSIONS_COLUMNS.releaseTimestamp },
    cell: ({ row }) => <span className="font-mono-data">{row.original.releaseDateLabel}</span>,
  },
  { accessorKey: "build", header: "ISO Build", meta: { info: VERSIONS_COLUMNS.build }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "usageCount", header: "In Nutzung", meta: { info: VERSIONS_COLUMNS.usageCount }, cell: ({ row }) => `${formatNum(row.original.usageCount)} / ${formatNum(row.original.totalAssets)}` },
  {
    accessorKey: "adoptionPct",
    header: "Adoption",
    meta: { info: VERSIONS_COLUMNS.adoptionPct },
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

export function VmwareVersionsPanel() {
  const { snapshots, activeSnapshotIds } = useActiveSnapshotIds();
  const { data: hosts = [] } = useHosts();
  const { data: rawVSource = [] } = useRawSheet("vSource");

  const activeSnapshots = useMemo(
    () => {
      const activeSnapshotIdSet = new Set(activeSnapshotIds);
      return snapshots.filter((snapshot) => activeSnapshotIdSet.has(snapshot.snapshotId));
    },
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

  const totalActiveVcenters = new Set(activeSnapshots.map((snapshot) => snapshot.vcenterId)).size;
  const totalActiveHosts = hosts.length;

  const vcenterRows = useMemo<ReleaseUsageRow[]>(
    () => buildReleaseUsageRows("vcenter", vcenterBuildCounts, totalActiveVcenters),
    [vcenterBuildCounts, totalActiveVcenters],
  );

  const esxiRows = useMemo<ReleaseUsageRow[]>(
    () => buildReleaseUsageRows("esxi", esxiBuildCounts, totalActiveHosts),
    [esxiBuildCounts, totalActiveHosts],
  );

  const latestVcenterLabel = getLatestRelease("vcenter")?.title.replace("VMware vCenter Server 8.0 Update ", "Update ") ?? "Latest";
  const latestEsxiLabel = getLatestRelease("esxi")?.title.replace("VMware ESXi 8.0 Update ", "Update ") ?? "Latest";
  const vcenterLatestUsage = vcenterRows[0]?.usageCount || 0;
  const esxiLatestUsage = esxiRows[0]?.usageCount || 0;
  const trackedVcenterUsage = vcenterRows.reduce((sum, row) => sum + row.usageCount, 0);
  const trackedEsxiUsage = esxiRows.reduce((sum, row) => sum + row.usageCount, 0);

  const vcenterChartData = vcenterRows.map((row) => ({
    name: row.title.replace("VMware vCenter Server ", ""),
    usage: row.usageCount,
  }));

  const esxiChartData = esxiRows.map((row) => ({
    name: row.title.replace("VMware ESXi ", ""),
    usage: row.usageCount,
  }));

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Neueste vCenter- und ESXi-Releases mit Nutzung in der aktiven Umgebung.
      </p>

      <KpiGrid>
        <KpiCard title="Aktive vCenter" value={formatNum(totalActiveVcenters)} icon={<Server className="h-4 w-4" />} info={VERSIONS_KPI.activeVcenters} />
        <KpiCard title="Aktive ESXi Hosts" value={formatNum(totalActiveHosts)} icon={<Cpu className="h-4 w-4" />} info={VERSIONS_KPI.activeHosts} />
        <KpiCard
          title={`vCenter auf ${latestVcenterLabel}`}
          value={formatNum(vcenterLatestUsage)}
          subtitle={`${totalActiveVcenters > 0 ? Math.round((vcenterLatestUsage / totalActiveVcenters) * 100) : 0}%`}
          severity={totalActiveVcenters > 0 && vcenterLatestUsage < totalActiveVcenters ? "warn" : "ok"}
          info={VERSIONS_KPI.vcenterOnLatest}
        />
        <KpiCard
          title={`ESXi auf ${latestEsxiLabel}`}
          value={formatNum(esxiLatestUsage)}
          subtitle={`${totalActiveHosts > 0 ? Math.round((esxiLatestUsage / totalActiveHosts) * 100) : 0}%`}
          severity={totalActiveHosts > 0 && esxiLatestUsage < totalActiveHosts ? "warn" : "ok"}
          info={VERSIONS_KPI.esxiOnLatest}
        />
        <KpiCard
          title="vCenter Releases erkannt"
          value={formatNum(trackedVcenterUsage)}
          subtitle={`${totalActiveVcenters > 0 ? Math.round((trackedVcenterUsage / totalActiveVcenters) * 100) : 0}% abgedeckt`}
          severity={trackedVcenterUsage < totalActiveVcenters ? "warn" : "ok"}
          info={VERSIONS_KPI.vcenterTracked}
        />
        <KpiCard
          title="ESXi Releases erkannt"
          value={formatNum(trackedEsxiUsage)}
          subtitle={`${totalActiveHosts > 0 ? Math.round((trackedEsxiUsage / totalActiveHosts) * 100) : 0}% abgedeckt`}
          severity={trackedEsxiUsage < totalActiveHosts ? "warn" : "ok"}
          info={VERSIONS_KPI.esxiTracked}
        />
      </KpiGrid>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/50 bg-card/30">
          <CardHeader className="pb-2">
            <InfoTooltip entry={COMPLIANCE_SECTIONS.vcenterReleaseUsage} side="bottom">
              <CardTitle className="w-fit cursor-help text-sm font-semibold">vCenter Release Nutzung</CardTitle>
            </InfoTooltip>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={vcenterChartData}>
                <XAxis dataKey="name" tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
                <Bar dataKey="usage" radius={[4, 4, 0, 0]}>
                  {vcenterChartData.map((entry, index) => (
                    <Cell key={entry.name} fill={index === 0 ? CHART_COLORS.success : CHART_COLORS.primary} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/30">
          <CardHeader className="pb-2">
            <InfoTooltip entry={COMPLIANCE_SECTIONS.esxiReleaseUsage} side="bottom">
              <CardTitle className="w-fit cursor-help text-sm font-semibold">ESXi Release Nutzung</CardTitle>
            </InfoTooltip>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={esxiChartData}>
                <XAxis dataKey="name" tick={{ ...CHART_AXIS_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
                <Bar dataKey="usage" radius={[4, 4, 0, 0]}>
                  {esxiChartData.map((entry, index) => (
                    <Cell key={entry.name} fill={index === 0 ? CHART_COLORS.success : CHART_COLORS.info} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div>
        <InfoTooltip entry={COMPLIANCE_SECTIONS.vcenterVersionsTable} side="bottom">
          <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">
            Neueste vCenter Versionen
          </h3>
        </InfoTooltip>
        <VirtualTable data={vcenterRows} columns={releaseColumns} height={260} />
      </div>

      <div>
        <InfoTooltip entry={COMPLIANCE_SECTIONS.esxiVersionsTable} side="bottom">
          <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">
            Neueste ESXi Versionen
          </h3>
        </InfoTooltip>
        <VirtualTable data={esxiRows} columns={releaseColumns} height={260} />
      </div>
    </div>
  );
}
