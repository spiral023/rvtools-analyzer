import { useMemo, useState } from "react";
import { Copy, Cpu, ExternalLink, History, Server } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/components/charts/recharts";
import type { ColumnDef } from "@tanstack/react-table";
import { useActiveSnapshotIds, useHosts, useRawSheet } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { VERSIONS_KPI, VERSIONS_COLUMNS, COMPLIANCE_SECTIONS } from "@/lib/glossaries/compliance";
import { CHART_AXIS_STYLE, CHART_COLORS, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/chartStyles";
import { buildReleaseUsageMarkdown } from "@/lib/detailMarkdown";
import { buildReleaseUsageRows, getLatestRelease, type ReleaseUsageRow } from "@/lib/vmwareReleaseCatalog";
import { formatNum, formatPct } from "@/lib/xlsx/parseHelpers";
import type { NormalizedHost, SnapshotMeta } from "@/domain/models/types";

function extractBuild(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  const matches = text.match(/\d{7,}/g);
  if (!matches || matches.length === 0) return null;
  return matches[matches.length - 1];
}

function buildReleaseColumns(onOpenDetail: (release: ReleaseUsageRow) => void): ColumnDef<ReleaseUsageRow, unknown>[] {
  return [
    {
      accessorKey: "title",
      header: "Release",
      meta: { info: VERSIONS_COLUMNS.title },
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onOpenDetail(row.original)}
          className="text-left font-medium text-primary underline-offset-4 hover:underline"
        >
          {row.original.title}
        </button>
      ),
    },
    {
      accessorKey: "releaseNotesUrl",
      header: "Release Notes",
      meta: { info: VERSIONS_COLUMNS.releaseNotesUrl },
      cell: ({ row }) => (
        <a
          href={row.original.releaseNotesUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
          aria-label={`Release Notes für ${row.original.title} öffnen`}
          title="Release Notes öffnen"
        >
          <ExternalLink className="h-3.5 w-3.5" />
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
}

interface ReleaseUsageEntry {
  key: string;
  primary: string;
  secondary?: string;
  tertiary?: string;
  meta?: string;
}

function ReleaseUsageDialog({
  release,
  entityLabel,
  entries,
  open,
  onClose,
}: {
  release: ReleaseUsageRow | null;
  entityLabel: string;
  entries: ReleaseUsageEntry[];
  open: boolean;
  onClose: () => void;
}) {
  if (!release) return null;

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(
        buildReleaseUsageMarkdown({
          release: {
            title: release.title,
            version: release.version,
            releaseDateLabel: release.releaseDateLabel,
            build: release.build,
          },
          entityLabel,
          usageCount: release.usageCount,
          totalAssets: release.totalAssets,
          adoptionPct: release.adoptionPct,
          entries,
        }),
      );
      toast.success("Release-Nutzung als Markdown kopiert.");
    } catch {
      toast.error("Release-Nutzung konnte nicht kopiert werden.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-[95vw] max-w-3xl flex-col overflow-hidden p-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void copyMarkdown()}
          className="absolute right-10 top-2 h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label="Release-Nutzung als Markdown kopieren"
          title="Als Markdown kopieren"
        >
          <Copy className="h-4 w-4" />
        </Button>
        <DialogHeader className="shrink-0 border-b border-border px-6 pb-4 pt-6">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <History className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold">{release.title}</DialogTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {release.version} · Build {release.build} · Release: {release.releaseDateLabel}
              </p>
            </div>
          </div>
          <DialogDescription className="sr-only">
            Übersicht, welche {entityLabel} dieses Release nutzen
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-100px)]">
          <div className="space-y-5 p-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
                <p className="font-mono-data text-lg font-bold">
                  {formatNum(release.usageCount)} / {formatNum(release.totalAssets)}
                </p>
                <p className="text-[10px] uppercase text-muted-foreground">In Nutzung</p>
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
                <p className="font-mono-data text-lg font-bold">{formatPct(release.adoptionPct)}</p>
                <p className="text-[10px] uppercase text-muted-foreground">Adoption</p>
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
                <p className="font-mono-data text-lg font-bold">{release.releaseDateLabel}</p>
                <p className="text-[10px] uppercase text-muted-foreground">Release Date</p>
              </div>
            </div>

            <Separator />

            <section>
              <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Server className="h-3.5 w-3.5" /> {entityLabel} ({entries.length})
              </h4>
              {entries.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">
                  Kein {entityLabel} auf diesem Release gefunden.
                </p>
              ) : (
                <div className="space-y-1">
                  {entries.map((entry) => (
                    <div
                      key={entry.key}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent/60"
                    >
                      <span className="truncate font-mono-data text-xs">{entry.primary}</span>
                      <span className="flex shrink-0 items-center gap-3 text-[10px] text-muted-foreground">
                        {entry.secondary && <span>{entry.secondary}</span>}
                        {entry.tertiary && <span>{entry.tertiary}</span>}
                        {entry.meta && <span className="font-mono-data">{entry.meta}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

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

  const vcentersByBuild = useMemo(() => {
    const sourceBySnapshot = new Map<string, string>();
    for (const row of rawVSource) {
      if (sourceBySnapshot.has(row.snapshotId)) continue;
      const build = extractBuild(row.data["Build"]) || extractBuild(row.data["Fullname"]) || extractBuild(row.data["Version"]);
      if (build) sourceBySnapshot.set(row.snapshotId, build);
    }

    // Ein vCenter kann mehrere aktive Snapshots haben – pro vCenter nur einen Build zählen.
    const snapshotByVcenter = new Map<string, SnapshotMeta>();
    for (const snapshot of activeSnapshots) {
      if (sourceBySnapshot.has(snapshot.snapshotId)) snapshotByVcenter.set(snapshot.vcenterId, snapshot);
    }

    const map = new Map<string, SnapshotMeta[]>();
    for (const snapshot of snapshotByVcenter.values()) {
      const build = sourceBySnapshot.get(snapshot.snapshotId);
      if (!build) continue;
      const list = map.get(build) ?? [];
      list.push(snapshot);
      map.set(build, list);
    }
    return map;
  }, [rawVSource, activeSnapshots]);

  const vcenterBuildCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [build, list] of vcentersByBuild) counts.set(build, list.length);
    return counts;
  }, [vcentersByBuild]);

  const hostsByBuild = useMemo(() => {
    const map = new Map<string, NormalizedHost[]>();
    for (const host of hosts) {
      const build = extractBuild(host.build) || extractBuild(host.version);
      if (!build) continue;
      const list = map.get(build) ?? [];
      list.push(host);
      map.set(build, list);
    }
    return map;
  }, [hosts]);

  const esxiBuildCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [build, list] of hostsByBuild) counts.set(build, list.length);
    return counts;
  }, [hostsByBuild]);

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

  const [selectedRelease, setSelectedRelease] = useState<ReleaseUsageRow | null>(null);
  const releaseColumns = useMemo(() => buildReleaseColumns(setSelectedRelease), []);
  const releaseEntityLabel = selectedRelease?.type === "vcenter" ? "vCenter" : "ESXi Host";
  const releaseUsageEntries = useMemo<ReleaseUsageEntry[]>(() => {
    if (!selectedRelease) return [];
    if (selectedRelease.type === "vcenter") {
      return (vcentersByBuild.get(selectedRelease.build) ?? [])
        .map((snapshot) => ({
          key: snapshot.vcenterId,
          primary: snapshot.vcenterDisplayName || snapshot.vcenterId,
          secondary: snapshot.vcenterId,
          tertiary: `Export: ${new Date(snapshot.exportTs).toLocaleDateString("de-DE")}`,
        }))
        .sort((a, b) => a.primary.localeCompare(b.primary, "de-DE"));
    }
    return (hostsByBuild.get(selectedRelease.build) ?? [])
      .map((host) => ({
        key: host.hostKey,
        primary: host.host,
        secondary: host.cluster || "Kein Cluster",
        tertiary: host.datacenter || undefined,
        meta: host.vmCount != null ? `${formatNum(host.vmCount)} VMs` : undefined,
      }))
      .sort((a, b) => a.primary.localeCompare(b.primary, "de-DE", { numeric: true }));
  }, [selectedRelease, vcentersByBuild, hostsByBuild]);

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

      <ReleaseUsageDialog
        release={selectedRelease}
        entityLabel={releaseEntityLabel}
        entries={releaseUsageEntries}
        open={selectedRelease !== null}
        onClose={() => setSelectedRelease(null)}
      />
    </div>
  );
}
