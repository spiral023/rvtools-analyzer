import { useMemo, useState } from "react";
import { Copy, ExternalLink, History, Server } from "lucide-react";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { COMPLIANCE_SECTIONS, VERSIONS_COLUMNS } from "@/lib/glossaries/compliance";
import { buildReleaseUsageMarkdown } from "@/lib/detailMarkdown";
import { buildReleaseUsageRows, type ReleaseUsageRow } from "@/lib/vmwareReleaseCatalog";
import { formatNum, formatPct } from "@/lib/xlsx/parseHelpers";
import { useActiveSnapshotIds, useHosts, useRawSheet } from "@/hooks/useActiveSnapshots";
import type { NormalizedHost, SnapshotMeta } from "@/domain/models/types";

function extractBuild(value: unknown): string | null {
  const matches = String(value ?? "").match(/\d{7,}/g);
  return matches?.at(-1) ?? null;
}

function buildReleaseColumns(onOpenDetail: (release: ReleaseUsageRow) => void): ColumnDef<ReleaseUsageRow, unknown>[] {
  return [
    { accessorKey: "title", header: "Release", meta: { info: VERSIONS_COLUMNS.title }, cell: ({ row }) => <button type="button" onClick={() => onOpenDetail(row.original)} className="text-left font-medium text-primary underline-offset-4 hover:underline">{row.original.title}</button> },
    { accessorKey: "releaseNotesUrl", header: "Release Notes", meta: { info: VERSIONS_COLUMNS.releaseNotesUrl }, cell: ({ row }) => <a href={row.original.releaseNotesUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary" aria-label={`Release Notes für ${row.original.title} öffnen`}><ExternalLink className="h-3.5 w-3.5" /></a> },
    { accessorKey: "version", header: "Version", meta: { info: VERSIONS_COLUMNS.version }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
    { accessorKey: "releaseTimestamp", header: "Release Date", meta: { info: VERSIONS_COLUMNS.releaseTimestamp }, cell: ({ row }) => <span className="font-mono-data">{row.original.releaseDateLabel}</span> },
    { accessorKey: "build", header: "ISO Build", meta: { info: VERSIONS_COLUMNS.build }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
    { accessorKey: "usageCount", header: "In Nutzung", meta: { info: VERSIONS_COLUMNS.usageCount }, cell: ({ row }) => `${formatNum(row.original.usageCount)} / ${formatNum(row.original.totalAssets)}` },
    { accessorKey: "adoptionPct", header: "Adoption", meta: { info: VERSIONS_COLUMNS.adoptionPct }, cell: ({ getValue }) => { const value = getValue() as number; return <span className={value >= 75 ? "text-success" : value >= 30 ? "text-warning" : "text-muted-foreground"}>{formatPct(value)}</span>; } },
  ];
}

interface ReleaseUsageEntry { key: string; primary: string; secondary?: string; tertiary?: string; meta?: string }

function ReleaseUsageDialog({ release, entityLabel, entries, open, onClose }: { release: ReleaseUsageRow | null; entityLabel: string; entries: ReleaseUsageEntry[]; open: boolean; onClose: () => void }) {
  if (!release) return null;
  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(buildReleaseUsageMarkdown({ release: { title: release.title, version: release.version, releaseDateLabel: release.releaseDateLabel, build: release.build }, entityLabel, usageCount: release.usageCount, totalAssets: release.totalAssets, adoptionPct: release.adoptionPct, entries }));
      toast.success("Release-Nutzung als Markdown kopiert.");
    } catch { toast.error("Release-Nutzung konnte nicht kopiert werden."); }
  };
  return <Dialog open={open} onOpenChange={(next) => !next && onClose()}><DialogContent className="flex max-h-[85vh] w-[95vw] max-w-3xl flex-col overflow-hidden p-0"><Button type="button" variant="ghost" size="icon" onClick={() => void copyMarkdown()} className="absolute right-10 top-2 h-8 w-8" aria-label="Release-Nutzung als Markdown kopieren"><Copy className="h-4 w-4" /></Button><DialogHeader className="shrink-0 border-b border-border px-6 pb-4 pt-6"><div className="flex items-start gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><History className="h-6 w-6" /></div><div className="min-w-0"><DialogTitle className="text-lg font-semibold">{release.title}</DialogTitle><p className="mt-1 text-xs text-muted-foreground">{release.version} · Build {release.build} · Release: {release.releaseDateLabel}</p></div></div><DialogDescription className="sr-only">Übersicht, welche {entityLabel} dieses Release nutzen</DialogDescription></DialogHeader><ScrollArea className="max-h-[calc(85vh-100px)]"><div className="space-y-5 p-6"><div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><div className="rounded-lg bg-muted/40 px-3 py-2 text-center"><p className="font-mono-data text-lg font-bold">{formatNum(release.usageCount)} / {formatNum(release.totalAssets)}</p><p className="text-[10px] uppercase text-muted-foreground">In Nutzung</p></div><div className="rounded-lg bg-muted/40 px-3 py-2 text-center"><p className="font-mono-data text-lg font-bold">{formatPct(release.adoptionPct)}</p><p className="text-[10px] uppercase text-muted-foreground">Adoption</p></div><div className="rounded-lg bg-muted/40 px-3 py-2 text-center"><p className="font-mono-data text-lg font-bold">{release.releaseDateLabel}</p><p className="text-[10px] uppercase text-muted-foreground">Release Date</p></div></div><Separator /><section><h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Server className="h-3.5 w-3.5" /> {entityLabel} ({entries.length})</h4>{entries.length === 0 ? <p className="text-sm italic text-muted-foreground">Kein {entityLabel} auf diesem Release gefunden.</p> : <div className="space-y-1">{entries.map((entry) => <div key={entry.key} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent/60"><span className="truncate font-mono-data text-xs">{entry.primary}</span><span className="flex shrink-0 items-center gap-3 text-[10px] text-muted-foreground">{entry.secondary && <span>{entry.secondary}</span>}{entry.tertiary && <span>{entry.tertiary}</span>}{entry.meta && <span className="font-mono-data">{entry.meta}</span>}</span></div>)}</div>}</section></div></ScrollArea></DialogContent></Dialog>;
}

export function VCenterVersionsTable() {
  const { snapshots, activeSnapshotIds } = useActiveSnapshotIds();
  const { data: rawVSource = [] } = useRawSheet("vSource");
  const [selectedRelease, setSelectedRelease] = useState<ReleaseUsageRow | null>(null);
  const activeSnapshots = useMemo(() => { const ids = new Set(activeSnapshotIds); return snapshots.filter((snapshot) => ids.has(snapshot.snapshotId)); }, [activeSnapshotIds, snapshots]);
  const vcentersByBuild = useMemo(() => {
    const sourceBySnapshot = new Map<string, string>();
    for (const row of rawVSource) { if (sourceBySnapshot.has(row.snapshotId)) continue; const build = extractBuild(row.data["Build"]) || extractBuild(row.data["Fullname"]) || extractBuild(row.data["Version"]); if (build) sourceBySnapshot.set(row.snapshotId, build); }
    const snapshotByVcenter = new Map<string, SnapshotMeta>();
    for (const snapshot of activeSnapshots) if (sourceBySnapshot.has(snapshot.snapshotId)) snapshotByVcenter.set(snapshot.vcenterId, snapshot);
    const map = new Map<string, SnapshotMeta[]>();
    for (const snapshot of snapshotByVcenter.values()) { const build = sourceBySnapshot.get(snapshot.snapshotId); if (!build) continue; map.set(build, [...(map.get(build) ?? []), snapshot]); }
    return map;
  }, [activeSnapshots, rawVSource]);
  const rows = useMemo(() => buildReleaseUsageRows("vcenter", new Map([...vcentersByBuild].map(([build, entries]) => [build, entries.length])), new Set(activeSnapshots.map((snapshot) => snapshot.vcenterId)).size), [activeSnapshots, vcentersByBuild]);
  const columns = useMemo(() => buildReleaseColumns(setSelectedRelease), []);
  const entries = useMemo<ReleaseUsageEntry[]>(() => selectedRelease ? (vcentersByBuild.get(selectedRelease.build) ?? []).map((snapshot) => ({ key: snapshot.vcenterId, primary: snapshot.vcenterDisplayName || snapshot.vcenterId, secondary: snapshot.vcenterId, tertiary: `Export: ${new Date(snapshot.exportTs).toLocaleDateString("de-DE")}` })).sort((left, right) => left.primary.localeCompare(right.primary, "de-DE")) : [], [selectedRelease, vcentersByBuild]);
  return <div><InfoTooltip entry={COMPLIANCE_SECTIONS.vcenterVersionsTable} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Neueste vCenter Versionen</h3></InfoTooltip><VirtualTable data={rows} columns={columns} height={260} /><ReleaseUsageDialog release={selectedRelease} entityLabel="vCenter" entries={entries} open={selectedRelease !== null} onClose={() => setSelectedRelease(null)} /></div>;
}

export function EsxiVersionsTable() {
  const { data: hosts = [] } = useHosts();
  const [selectedRelease, setSelectedRelease] = useState<ReleaseUsageRow | null>(null);
  const hostsByBuild = useMemo(() => { const map = new Map<string, NormalizedHost[]>(); for (const host of hosts) { const build = extractBuild(host.build) || extractBuild(host.version); if (!build) continue; map.set(build, [...(map.get(build) ?? []), host]); } return map; }, [hosts]);
  const rows = useMemo(() => buildReleaseUsageRows("esxi", new Map([...hostsByBuild].map(([build, entries]) => [build, entries.length])), hosts.length), [hosts.length, hostsByBuild]);
  const columns = useMemo(() => buildReleaseColumns(setSelectedRelease), []);
  const entries = useMemo<ReleaseUsageEntry[]>(() => selectedRelease ? (hostsByBuild.get(selectedRelease.build) ?? []).map((host) => ({ key: host.hostKey, primary: host.host, secondary: host.cluster || "Kein Cluster", tertiary: host.datacenter || undefined, meta: host.vmCount != null ? `${formatNum(host.vmCount)} VMs` : undefined })).sort((left, right) => left.primary.localeCompare(right.primary, "de-DE", { numeric: true })) : [], [hostsByBuild, selectedRelease]);
  return <div><InfoTooltip entry={COMPLIANCE_SECTIONS.esxiVersionsTable} side="bottom"><h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Neueste ESXi Versionen</h3></InfoTooltip><VirtualTable data={rows} columns={columns} height={260} /><ReleaseUsageDialog release={selectedRelease} entityLabel="ESXi Host" entries={entries} open={selectedRelease !== null} onClose={() => setSelectedRelease(null)} /></div>;
}
