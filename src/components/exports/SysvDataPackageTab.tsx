import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Boxes, Building2, Check, ChevronDown, ChevronRight, CircleAlert, Database, Download, FolderTree, HardDrive, Loader2, Search, Server, ShieldCheck, UserRound, Users, XCircle } from "lucide-react";
import type { SysvDataPackageScope } from "@/domain/models/types";
import type { SysvDataPackageScopeNode } from "@/lib/sysvDataPackageScope";
import { buildSysvDataPackageScopeDirectory, sysvDataPackageScopeKey } from "@/lib/sysvDataPackageScope";
import { useAllTechInfoLatest } from "@/hooks/useActiveSnapshots";
import { useSysvDataPackageBatchExport, useSysvDataPackageExport } from "@/hooks/useSysvDataPackageExport";
import { type SysvBatchExportRequest } from "@/domain/services/sysvBatchExportService";
import { formatBytes, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const KIND_LABEL: Record<SysvDataPackageScope["kind"], string> = {
  area: "Bereich",
  department: "Abteilung",
  person: "Person",
};

const BATCH_LEVEL_LABEL: Record<SysvBatchExportRequest["level"], string> = {
  person: "Systemverantwortliche",
  department: "Abteilungen",
  area: "Bereiche",
};

function isValidBatchRoot(root: SysvDataPackageScope | null, level: SysvBatchExportRequest["level"]): boolean {
  if (!root) return true;
  if (level === "area") return root.kind === "area";
  if (level === "department") return root.kind === "area" || root.kind === "department";
  return true;
}

function nodeIcon(kind: SysvDataPackageScopeNode["kind"]) {
  if (kind === "organisation") return Building2;
  if (kind === "area") return FolderTree;
  if (kind === "department") return Users;
  return UserRound;
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase("de-DE");
}

function filterTree(nodes: readonly SysvDataPackageScopeNode[], query: string): SysvDataPackageScopeNode[] {
  if (!query) return [...nodes];
  return nodes.flatMap((node) => {
    const children = filterTree(node.children, query);
    const ownMatch = node.kind !== "organisation" && node.label.toLocaleLowerCase("de-DE").includes(query);
    return ownMatch || children.length > 0 ? [{ ...node, children }] : [];
  });
}

function collectParentIds(nodes: readonly SysvDataPackageScopeNode[]): Set<string> {
  const expanded = new Set<string>();
  const visit = (node: SysvDataPackageScopeNode) => {
    if (node.children.length > 0) expanded.add(node.id);
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return expanded;
}

function ScopeTreeRow({
  node,
  depth,
  expandedIds,
  selectedScope,
  onToggle,
  onSelect,
}: {
  node: SysvDataPackageScopeNode;
  depth: number;
  expandedIds: ReadonlySet<string>;
  selectedScope: SysvDataPackageScope | null;
  onToggle: (id: string) => void;
  onSelect: (scope: SysvDataPackageScope) => void;
}) {
  const Icon = nodeIcon(node.kind);
  const hasChildren = node.children.length > 0;
  const expanded = expandedIds.has(node.id);
  const selected = node.scope && selectedScope ? sysvDataPackageScopeKey(node.scope) === sysvDataPackageScopeKey(selectedScope) : false;
  return (
    <div>
      <div
        className={cn(
          "group flex min-h-11 items-center gap-2 border-b border-border/40 px-3 py-1.5 transition-colors",
          node.scope && "hover:bg-primary/[0.06]",
          selected && "bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]",
        )}
        style={{ paddingLeft: `${0.75 + depth * 1.1}rem` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={expanded ? `${node.label} zuklappen` : `${node.label} aufklappen`}
            onClick={() => onToggle(node.id)}
          >
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        ) : <span className="size-6 shrink-0" aria-hidden="true" />}
        <Icon className={cn("size-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
        {node.scope ? (
          <button
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(node.scope!)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className={cn("min-w-0 flex-1 truncate text-sm", node.kind !== "person" && "font-medium")}>{node.label}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{node.vmCount.toLocaleString("de-DE")}</span>
            {selected && <Check className="size-4 shrink-0 text-primary" aria-label="Ausgewählt" />}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className={cn("min-w-0 flex-1 truncate text-sm", node.kind === "organisation" && "font-semibold")}>{node.label}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{node.vmCount.toLocaleString("de-DE")}</span>
          </div>
        )}
      </div>
      {expanded && node.children.map((child) => (
        <ScopeTreeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          expandedIds={expandedIds}
          selectedScope={selectedScope}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function CountTile({ label, value, icon }: { label: string; value: string | number; icon: ReactNode }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/70 p-3">
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<span className="text-[11px] font-semibold uppercase tracking-[0.12em]">{label}</span></div>
      <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function DateRange({ start, end }: { start: number; end: number }) {
  if (!start || !end) return <span>nicht verfügbar</span>;
  return <span>{new Date(start).toLocaleDateString("de-DE")} – {new Date(end).toLocaleDateString("de-DE")}</span>;
}

export function SysvDataPackageTab() {
  const { data: techInfoRows = [], isLoading: techInfoLoading } = useAllTechInfoLatest();
  const directory = useMemo(() => buildSysvDataPackageScopeDirectory(techInfoRows), [techInfoRows]);
  const [scope, setScope] = useState<SysvDataPackageScope | null>(null);
  const [exportMode, setExportMode] = useState<"single" | "batch">("single");
  const [batchLevel, setBatchLevel] = useState<SysvBatchExportRequest["level"]>("department");
  const [batchRoot, setBatchRoot] = useState<SysvDataPackageScope | null>(null);
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [includeVropsTimeSeries, setIncludeVropsTimeSeries] = useState(true);
  const [includeBatchVropsTimeSeries, setIncludeBatchVropsTimeSeries] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
  const filteredTree = useMemo(() => filterTree(directory.tree, normalizeSearch(search)), [directory.tree, search]);
  const visibleExpandedIds = useMemo(
    () => normalizeSearch(search) ? collectParentIds(filteredTree) : expandedIds,
    [expandedIds, filteredTree, search],
  );
  const { preview, previewLoading, previewError, exporting, progress, exportPackage } = useSysvDataPackageExport(exportMode === "single" ? scope : null, { includeVropsTimeSeries });
  // Eine Wurzel unterhalb der Exportebene ist keine gültige Batch-Quelle; der Batch
  // fällt dann auf den Gesamtbestand zurück.
  const effectiveBatchRoot = useMemo(
    () => batchRoot && isValidBatchRoot(batchRoot, batchLevel) ? batchRoot : null,
    [batchLevel, batchRoot],
  );
  const batchRequest = useMemo<SysvBatchExportRequest | null>(() => exportMode === "batch"
    ? {
        level: batchLevel,
        root: effectiveBatchRoot ?? undefined,
        includeVropsTimeSeries: includeBatchVropsTimeSeries,
      }
    : null, [batchLevel, effectiveBatchRoot, exportMode, includeBatchVropsTimeSeries]);
  const {
    preview: batchPreview,
    previewLoading: batchPreviewLoading,
    previewError: batchPreviewError,
    exporting: batchExporting,
    progress: batchProgress,
    exportBatch,
    cancelExport: cancelBatchExport,
  } = useSysvDataPackageBatchExport(batchRequest);

  useEffect(() => {
    setExpandedIds(collectParentIds(directory.tree));
  }, [directory.tree]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = async () => {
    setConfirmOpen(false);
    await exportPackage();
  };

  const handleBatchExport = async () => {
    setBatchConfirmOpen(false);
    await exportBatch();
  };

  const selectScope = (nextScope: SysvDataPackageScope) => {
    setScope(nextScope);
    setBatchRoot(nextScope);
  };

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-xl border border-primary/25 bg-[radial-gradient(circle_at_90%_0%,hsl(var(--primary)/0.16),transparent_42%),linear-gradient(135deg,hsl(var(--card)),hsl(var(--muted)/0.24))] p-5 shadow-sm">
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <div className="mb-3 flex items-center gap-2 text-primary"><ShieldCheck className="size-5" /><span className="text-[11px] font-bold uppercase tracking-[0.18em]">Scope-sicheres Datenpaket</span></div>
            <h2 className="text-xl font-semibold tracking-tight">SysV-Inventare sicher weitergeben</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Erzeuge ein einzelnes abgegrenztes Paket oder einen Batch-Container mit einer ganzen Hierarchieebene. Jedes Blattpaket enthält nur eindeutig zugeordnete VMs; Host- und Clusterwerte bleiben als gemeinsamer Kapazitätskontext sichtbar.</p>
          </div>
          <Badge variant="secondary" className="shrink-0 gap-1.5 px-3 py-1.5"><Database className="size-3.5" />Nur lokal im Browser</Badge>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-2 shadow-sm" role="tablist" aria-label="SysV-Exportart">
        <div className="flex flex-wrap gap-1">
          <Button type="button" size="sm" variant={exportMode === "single" ? "default" : "ghost"} onClick={() => setExportMode("single")} role="tab" aria-selected={exportMode === "single"}>
            Einzelnes Paket
          </Button>
          <Button type="button" size="sm" variant={exportMode === "batch" ? "default" : "ghost"} onClick={() => setExportMode("batch")} role="tab" aria-selected={exportMode === "batch"}>
            Batch-Container
          </Button>
        </div>
        {exportMode === "batch" && <p className="px-2 text-xs text-muted-foreground">Mehrere selbstständige Blattpakete in einer Organisationsstruktur</p>}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(19rem,0.8fr)_minmax(0,1.5fr)]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border/60 bg-muted/15 pb-4">
            <CardTitle className="text-base">{exportMode === "batch" ? "Batch-Wurzel auswählen" : "Scope auswählen"}</CardTitle>
            <CardDescription>{exportMode === "batch" ? "Optional: begrenze den Batch auf einen Teilbaum. Ohne Auswahl wird der gesamte Bestand exportiert." : "Organisationen dienen nur der Navigation. Klickbar sind Bereich, Abteilung und Person."}</CardDescription>
            <div className="relative pt-2">
              <Search className="pointer-events-none absolute left-3 top-[1.1rem] size-4 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Bereich, Abteilung oder Person suchen…" className="pl-9" aria-label="SysV-Scopes durchsuchen" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {techInfoLoading ? (
              <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Tech-Info-Verzeichnis wird geladen…</div>
            ) : filteredTree.length > 0 ? (
              <div className="max-h-[39rem] overflow-y-auto" role="radiogroup" aria-label="SysV-Datensatz-Scope">
                {filteredTree.map((node) => <ScopeTreeRow key={node.id} node={node} depth={0} expandedIds={visibleExpandedIds} selectedScope={exportMode === "batch" ? batchRoot : scope} onToggle={toggleExpanded} onSelect={selectScope} />)}
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">Keine passenden SysV- oder SysVStv-Zuordnungen gefunden.</div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          {exportMode === "single" && <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Paketvorschau</CardTitle>
                  <CardDescription>{scope ? <><span className="font-medium text-foreground">{KIND_LABEL[scope.kind]}:</span> {scope.displayName}</> : "Wähle links einen Scope, um die enthaltenen Daten zu prüfen."}</CardDescription>
                </div>
                {scope && <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wide">{KIND_LABEL[scope.kind]}</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {previewLoading && <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Scope wird aufgelöst und gegen alle RVTools-Snapshots geprüft…</div>}
              {previewError && <Alert variant="destructive"><CircleAlert className="size-4" /><AlertTitle>Vorschau konnte nicht erstellt werden</AlertTitle><AlertDescription>{previewError.message}</AlertDescription></Alert>}
              {!previewLoading && !previewError && preview && (
                <>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <CountTile label="Eindeutige VMs" value={preview.vms.length.toLocaleString("de-DE")} icon={<Server className="size-3.5" />} />
                    <CountTile label="vCenter" value={preview.vcenters.length} icon={<Building2 className="size-3.5" />} />
                    <CountTile label="Hosts" value={preview.hosts.length} icon={<HardDrive className="size-3.5" />} />
                    <CountTile label="Cluster" value={preview.clusters.length} icon={<Boxes className="size-3.5" />} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-border/70 bg-muted/15 p-3 text-sm"><span className="text-muted-foreground">Referenzierte Datastores</span><span className="mt-1 block font-mono text-lg tabular-nums">{preview.datastores.length}</span></div>
                    <div className="rounded-lg border border-border/70 bg-muted/15 p-3 text-sm"><span className="text-muted-foreground">Tech-Info-Zuordnungen</span><span className="mt-1 block font-mono text-lg tabular-nums">{preview.selectedTechInfoVmNames.length}</span></div>
                  </div>

                  <div className="rounded-lg border border-primary/25 bg-primary/[0.06] p-4 text-sm leading-relaxed"><p className="flex items-start gap-2 font-medium"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />Harte Datengrenze</p><p className="mt-1.5 text-muted-foreground">Das Paket enthält ausschließlich die aufgelisteten VMs. Host- und Clusterwerte dienen als gemeinsamer Kapazitätskontext und stellen keinen vollständigen Infrastrukturbericht dar.</p></div>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                    <div><Label htmlFor="sysv-include-vrops" className="text-sm font-medium">vROps-VM-Zeitreihen einschließen</Label><p className="mt-0.5 text-xs text-muted-foreground">Nur gematchte VM-Objekte und physisch beschnittene Float32-Chunks.</p></div>
                    <Switch id="sysv-include-vrops" checked={includeVropsTimeSeries} onCheckedChange={setIncludeVropsTimeSeries} disabled={!preview.vropsImport || exporting} aria-label="vROps-VM-Zeitreihen einschließen" />
                  </div>
                  {preview.vropsImport ? <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3"><span>vROps-Zeitraum: <strong className="font-medium text-foreground"><DateRange start={preview.vropsImport.rangeStartUtc} end={preview.vropsImport.rangeEndUtc} /></strong></span><span>Mit Zeitreihe: <strong className="font-mono text-foreground">{preview.vropsVmNamesWithSeries.length}</strong></span><span>Ohne Zeitreihe: <strong className="font-mono text-foreground">{preview.vropsVmNamesWithoutSeries.length}</strong></span></div> : <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Kein vollständig gespeicherter vROps-Zeitreihenimport vorhanden. Das Paket kann ohne Zeitreihen erzeugt werden.</p>}

                  {(preview.warnings.length > 0 || preview.errors.length > 0) && <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Prüfhinweise</p>{preview.errors.map((error) => <div key={`error-${error.code}-${error.vmName ?? ""}-${error.message}`} className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><div className="flex gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0" /><span>{error.message}{error.candidates?.length ? ` (${error.candidates.map((candidate) => candidate.vcenterId).join(", ")})` : ""}</span></div></div>)}{preview.warnings.map((warning) => <div key={`warning-${warning.code}-${warning.vmName ?? ""}-${warning.message}`} className="rounded-lg border border-amber-500/35 bg-amber-500/[0.08] p-3 text-sm text-amber-800 dark:text-amber-200"><div className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{warning.message}{warning.candidates?.length ? ` (${warning.candidates.map((candidate) => candidate.vcenterId).join(", ")})` : ""}</span></div></div>)}</div>}

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4"><div className="text-xs text-muted-foreground"><span className="font-mono tabular-nums">{formatBytes(preview.estimatedUncompressedBytes)}</span> unkomprimiert · ca. <span className="font-mono tabular-nums">{formatBytes(preview.estimatedCompressedBytes)}</span> ZIP</div><Button type="button" onClick={() => setConfirmOpen(true)} disabled={!preview.canExport || exporting} className="gap-2">{exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}SysV-Datensatz als ZIP erzeugen</Button></div>
                </>
              )}
              {!scope && !previewLoading && <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/10 px-6 text-center"><Users className="size-8 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">Noch kein Scope ausgewählt</p><p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">Die Vorschau wird erst nach einer eindeutigen Auswahl berechnet. „Alle Systeme“ ist bewusst kein Exportziel.</p></div>}
            </CardContent>
          </Card>}

          {exportMode === "batch" && <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Batch-Vorschau</CardTitle>
                  <CardDescription>{effectiveBatchRoot ? <>Teilbaum: <span className="font-medium text-foreground">{effectiveBatchRoot.displayName}</span></> : "Gesamter Bestand als Batch-Quelle"}</CardDescription>
                </div>
                <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wide">{BATCH_LEVEL_LABEL[batchLevel]}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="space-y-2">
                  <Label htmlFor="sysv-batch-level">Exportebene</Label>
                  <select id="sysv-batch-level" value={batchLevel} onChange={(event) => setBatchLevel(event.target.value as SysvBatchExportRequest["level"])} disabled={batchExporting} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="person">Systemverantwortliche</option>
                    <option value="department">Abteilungen</option>
                    <option value="area">Bereiche</option>
                  </select>
                </div>
                <div className="flex items-end justify-between gap-3 rounded-lg border border-border/70 bg-muted/15 px-3 py-2.5 text-sm">
                  <div className="min-w-0"><p className="font-medium">Batch-Wurzel</p><p className="truncate text-xs text-muted-foreground">{effectiveBatchRoot ? effectiveBatchRoot.displayName : "Gesamter Bestand"}</p></div>
                  {batchRoot && <Button type="button" variant="ghost" size="sm" onClick={() => setBatchRoot(null)} disabled={batchExporting} className="shrink-0">Gesamtbestand</Button>}
                </div>
              </div>

              {batchPreviewLoading && <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Gemeinsame Datenbasis und Zielscopes werden geladen…</div>}
              {batchPreviewError && <Alert variant="destructive"><CircleAlert className="size-4" /><AlertTitle>Batch-Vorschau konnte nicht erstellt werden</AlertTitle><AlertDescription>{batchPreviewError.message}</AlertDescription></Alert>}
              {!batchPreviewLoading && !batchPreviewError && batchPreview && <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <CountTile label="Blattpakete" value={batchPreview.targets.length.toLocaleString("de-DE")} icon={<FolderTree className="size-3.5" />} />
                  <CountTile label="Eindeutige VMs" value={batchPreview.uniqueVmCount.toLocaleString("de-DE")} icon={<Server className="size-3.5" />} />
                  <CountTile label="Übersprungen" value={batchPreview.skipped.length.toLocaleString("de-DE")} icon={<XCircle className="size-3.5" />} />
                  <CountTile label="Ebene" value={BATCH_LEVEL_LABEL[batchPreview.level]} icon={<Users className="size-3.5" />} />
                </div>
                <div className="rounded-lg border border-primary/25 bg-primary/[0.06] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 font-medium"><Database className="size-4 text-primary" /> Containergröße</p><span className="text-sm text-muted-foreground">wird beim Erzeugen bestimmt</span></div>
                  <p className="mt-1 text-xs text-muted-foreground">{batchPreview.rootLabel} · Rohdaten und ZIP-Erzeugung laufen anschließend im Hintergrund-Worker. Das 3-GB-Limit wird dabei weiterhin geprüft.</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <div><Label htmlFor="sysv-batch-include-vrops" className="text-sm font-medium">vROps-VM-Zeitreihen einschließen</Label><p className="mt-0.5 text-xs text-muted-foreground">Im Batch standardmäßig aus, weil Zeitreihen pro Blattpaket redundant wären.</p></div>
                  <Switch id="sysv-batch-include-vrops" checked={includeBatchVropsTimeSeries} onCheckedChange={setIncludeBatchVropsTimeSeries} disabled={batchExporting} aria-label="vROps-Zeitreihen im Batch einschließen" />
                </div>
                {batchPreview.targets.length > 0 && <div className="rounded-lg border border-border/70"><div className="border-b border-border/60 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Zielscopes</div><div className="max-h-64 overflow-y-auto">{batchPreview.targets.slice(0, 24).map(({ target, vmCount }) => <div key={target.path} className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2 text-sm last:border-0"><span className="min-w-0 truncate" title={target.path}>{target.path}</span><span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{vmCount.toLocaleString("de-DE")} VMs</span></div>)}{batchPreview.targets.length > 24 && <p className="px-3 py-2 text-xs text-muted-foreground">… und {batchPreview.targets.length - 24} weitere Blattpakete</p>}</div></div>}
                {batchPreview.skipped.length > 0 && <Alert><AlertTriangle className="size-4" /><AlertTitle>{batchPreview.skipped.length.toLocaleString("de-DE")} Scope(s) werden übersprungen</AlertTitle><AlertDescription>{batchPreview.skipped.slice(0, 3).map((skip) => `${skip.scopeLabel}: ${skip.reason}`).join(" · ")}{batchPreview.skipped.length > 3 ? " · weitere Hinweise im Exportbericht" : ""}</AlertDescription></Alert>}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4"><p className="text-xs text-muted-foreground">Der Container enthält <span className="font-medium text-foreground">uebersicht.json</span>, <span className="font-medium text-foreground">uebersicht.csv</span> und einzeln importierbare Blattpakete.</p><Button type="button" onClick={() => setBatchConfirmOpen(true)} disabled={batchPreview.targets.length === 0 || batchExporting} className="gap-2">{batchExporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}Batch-Container erzeugen</Button></div>
              </>}
            </CardContent>
          </Card>}

          {exporting && progress && <Card className="border-primary/30 bg-primary/[0.04]"><CardContent className="space-y-3 p-4"><div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium">{progress.step}</span><span className="font-mono tabular-nums text-primary">{progress.percent}%</span></div><Progress value={progress.percent} className="h-2" /><p className="truncate text-xs text-muted-foreground">{progress.detail ?? "Paket wird vorbereitet…"}</p></CardContent></Card>}
          {batchExporting && batchProgress && <Card className="border-primary/30 bg-primary/[0.04]"><CardContent className="space-y-3 p-4"><div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium">{batchProgress.step}</span><span className="font-mono tabular-nums text-primary">{batchProgress.percent}%</span></div><Progress value={batchProgress.percent} className="h-2" /><div className="flex items-center justify-between gap-3"><p className="truncate text-xs text-muted-foreground">{batchProgress.detail ?? "Batch wird vorbereitet…"}</p><Button type="button" variant="outline" size="sm" onClick={cancelBatchExport}>Abbrechen</Button></div></CardContent></Card>}
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>SysV-Datenpaket erzeugen?</DialogTitle><DialogDescription>Das Paket für „{scope?.displayName}“ enthält {preview?.vms.length.toLocaleString("de-DE")} echte Systemnamen und kann lokal weitergegeben werden. Eine Pseudonymisierung ist für dieses Format nicht vorgesehen.</DialogDescription></DialogHeader>
          <Alert><ShieldCheck className="size-4" /><AlertDescription>Nach dem Import ist der physische Paketinhalt die harte Datengrenze. Globale Filter können diese Grenze nicht erweitern.</AlertDescription></Alert>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>Abbrechen</Button><Button type="button" onClick={() => void handleExport()} disabled={exporting}>Paket erzeugen</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={batchConfirmOpen} onOpenChange={setBatchConfirmOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Batch-Container erzeugen?</DialogTitle><DialogDescription>Es werden {batchPreview?.targets.length.toLocaleString("de-DE")} Blattpakete auf Ebene „{batchPreview ? BATCH_LEVEL_LABEL[batchPreview.level] : BATCH_LEVEL_LABEL[batchLevel]}“ erzeugt. Die Größe wird beim Erzeugen im Hintergrund bestimmt.</DialogDescription></DialogHeader>
          <Alert><ShieldCheck className="size-4" /><AlertDescription>Jedes Blattpaket bleibt einzeln importierbar. Übersprungene Scopes werden im Übersichtsbericht dokumentiert; der Import der einzelnen Pakete ist später atomar.</AlertDescription></Alert>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setBatchConfirmOpen(false)}>Abbrechen</Button><Button type="button" onClick={() => void handleBatchExport()} disabled={batchExporting}>Batch erzeugen</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
