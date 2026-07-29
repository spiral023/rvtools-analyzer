import { useEffect, useMemo, useState, type DragEvent } from "react";
import { BookmarkCheck, Clock, Columns3, Download, Eye, EyeOff, FileSpreadsheet, FileText, GripVertical, Plus, Save, Server, Table2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getUiState, putUiState } from "@/data/db";
import { useActiveSnapshotIds, useAllTechInfoLatest, useAllVropsLatest, useClusters, useHosts, useRawSheet, useVms } from "@/hooks/useActiveSnapshots";
import { useFillUpAnalysisRuns } from "@/hooks/useFillUpAnalysisRuns";
import { useVmWorkloadProfiles } from "@/hooks/useVmWorkloadProfiles";
import { buildClusterCapacityWorkspace } from "@/lib/clusterCapacityWorkspace";
import type { ExportStudioSource, ExportStudioTemplate } from "@/domain/models/types";
import type { ExportStudioColumn } from "@/lib/export/exportStudio";
import {
  buildClusterExportDataset,
  buildExportDataFromDataset,
  buildFillUpExportDataset,
  buildHostExportDataset,
  buildManagementMarkdown,
  buildVmExportDataset,
  pseudonymizeExportDataset,
} from "@/lib/export/exportStudio";
import { downloadTextFile, exportCsvTable, exportExcelTable, normalizeExportFilename } from "@/lib/export/tableExport";

const UI_STATE_ID = "export-studio";

const sourceLabels: Record<ExportStudioSource, string> = {
  vms: "VM",
  hosts: "Host",
  clusters: "Cluster",
  "fill-up": "Fill-Up-Ergebnisse",
};

function filterInventoryRows<T extends { cluster?: string | null; host?: string | null }>(rows: T[], filters: { clusters: string[]; hosts: string[]; search: string }) {
  const clusterSet = new Set(filters.clusters);
  const hostSet = new Set(filters.hosts);
  const search = filters.search.trim().toLocaleLowerCase("de-DE");
  return rows.filter((row) => {
    if (clusterSet.size && (!row.cluster || !clusterSet.has(row.cluster))) return false;
    if (hostSet.size && (!row.host || !hostSet.has(row.host))) return false;
    return !search || Object.values(row).some((value) => String(value ?? "").toLocaleLowerCase("de-DE").includes(search));
  });
}

function scopeLabel(vcenterCount: number, hasVmGlobalFilter: boolean) {
  const vcenter = `${vcenterCount} vCenter-Scope${vcenterCount === 1 ? "" : "s"}`;
  return hasVmGlobalFilter ? `${vcenter}; globaler VM-Filter aktiv` : vcenter;
}

export default function ExportStudio() {
  const { snapshots, activeSnapshotIds, filters, snapshotsLoading } = useActiveSnapshotIds();
  const { vms, allVms, isLoading: vmsLoading } = useVms();
  const hostsQuery = useHosts();
  const clustersQuery = useClusters();
  const { data: rawVHostRows = [], isLoading: rawVHostLoading } = useRawSheet("vHost");
  const { data: vropsLatest = [] } = useAllVropsLatest();
  const { runs, isLoading: runsLoading } = useFillUpAnalysisRuns();
  const { profiles: workloadProfiles, hosts: workloadHosts, isLoading: workloadProfilesLoading } = useVmWorkloadProfiles(null);
  const { data: techInfoLatest = [], isLoading: techInfoLoading } = useAllTechInfoLatest();
  const [source, setSource] = useState<ExportStudioSource>("vms");
  const [columnIds, setColumnIds] = useState<string[]>([]);
  const [pseudonymize, setPseudonymize] = useState(false);
  const [fileName, setFileName] = useState("rvtools-export");
  const [templateName, setTemplateName] = useState("");
  const [templates, setTemplates] = useState<ExportStudioTemplate[]>([]);
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);

  const activeSnapshotIdSet = useMemo(() => new Set(activeSnapshotIds), [activeSnapshotIds]);
  const activeSnapshots = useMemo(() => snapshots.filter((snapshot) => activeSnapshotIdSet.has(snapshot.snapshotId)), [activeSnapshotIdSet, snapshots]);
  const scope = useMemo(() => scopeLabel(activeSnapshots.length, filters.globalFilter !== null), [activeSnapshots.length, filters.globalFilter]);
  const latestExportTs = useMemo(
    () => activeSnapshots.reduce<string | null>((latest, snapshot) => (!latest || snapshot.exportTs > latest ? snapshot.exportTs : latest), null),
    [activeSnapshots],
  );
  // Der globale Filter wird fachlich auf VMs definiert. Für Host- und Cluster-Exporte
  // übernehmen wir ihn über die im Ergebnis verbliebenen VM-Zuordnungen.
  const globalVmPlacements = useMemo(() => {
    if (!filters.globalFilter) return null;
    return {
      hosts: new Set(vms.filter((vm) => vm.host).map((vm) => `${vm.vcenterId}::${vm.host}`)),
      clusters: new Set(vms.filter((vm) => vm.cluster).map((vm) => `${vm.vcenterId}::${vm.cluster}`)),
    };
  }, [filters.globalFilter, vms]);
  const filteredHosts = useMemo(() => filterInventoryRows(hostsQuery.data ?? [], filters).filter((host) => !globalVmPlacements || globalVmPlacements.hosts.has(`${host.vcenterId}::${host.host}`)), [filters, globalVmPlacements, hostsQuery.data]);
  const filteredClusters = useMemo(() => {
    const clusterSet = new Set(filters.clusters);
    const search = filters.search.trim().toLocaleLowerCase("de-DE");
    return (clustersQuery.data ?? []).filter((cluster) => (!clusterSet.size || clusterSet.has(cluster.name)) && (!search || Object.values(cluster).some((value) => String(value ?? "").toLocaleLowerCase("de-DE").includes(search))) && (!globalVmPlacements || globalVmPlacements.clusters.has(`${cluster.vcenterId}::${cluster.name}`)));
  }, [clustersQuery.data, filters, globalVmPlacements]);

  const capacityRows = useMemo(
    () => buildClusterCapacityWorkspace({
      clusters: clustersQuery.data ?? [],
      hosts: hostsQuery.data ?? [],
      vms,
      rawVHostRows,
      snapshots: activeSnapshots,
      vropsLatest,
    }).capacityRows,
    [activeSnapshots, clustersQuery.data, hostsQuery.data, rawVHostRows, vms, vropsLatest],
  );

  const baseDataset = useMemo(() => {
    if (source === "hosts") return buildHostExportDataset(filteredHosts, activeSnapshots, scope, allVms);
    if (source === "clusters") return buildClusterExportDataset(filteredClusters, activeSnapshots, scope, capacityRows);
    if (source === "fill-up") return buildFillUpExportDataset(runs, scope);
    return buildVmExportDataset(vms, activeSnapshots, scope, workloadProfiles, workloadHosts, techInfoLatest);
  }, [activeSnapshots, allVms, capacityRows, filteredClusters, filteredHosts, runs, scope, source, techInfoLatest, vms, workloadHosts, workloadProfiles]);
  const dataset = useMemo(() => pseudonymize ? pseudonymizeExportDataset(baseDataset) : baseDataset, [baseDataset, pseudonymize]);
  const selectedColumns = useMemo(() => columnIds.map((id) => dataset.columns.find((column) => column.id === id)).filter(Boolean), [columnIds, dataset.columns]);
  // Gruppiert nach `category` in erster Auftrittsreihenfolge; Quellen ohne Kategorien (Hosts/Clusters/Fill-Up) liefern eine einzige Gruppe ohne Titel.
  const columnGroups = useMemo(() => {
    const groups = new Map<string, ExportStudioColumn[]>();
    for (const column of dataset.columns) {
      const key = column.category ?? "";
      const group = groups.get(key);
      if (group) group.push(column);
      else groups.set(key, [column]);
    }
    return [...groups.entries()];
  }, [dataset.columns]);
  const exportData = useMemo(() => buildExportDataFromDataset(dataset, columnIds), [columnIds, dataset]);

  useEffect(() => {
    let cancelled = false;
    void getUiState(UI_STATE_ID).then((state) => {
      if (!cancelled) setTemplates(state?.exportStudioTemplates ?? []);
    });
    return () => { cancelled = true; };
  }, []);

  const saveTemplates = async (next: ExportStudioTemplate[]) => {
    setTemplates(next);
    const existing = await getUiState(UI_STATE_ID);
    await putUiState({ id: UI_STATE_ID, theme: existing?.theme ?? "dark", exportStudioTemplates: next });
  };

  const addColumn = (id: string) => setColumnIds((current) => current.includes(id) ? current : [...current, id]);
  const removeColumn = (id: string) => setColumnIds((current) => current.filter((columnId) => columnId !== id));

  const reorderColumn = (targetId: string) => {
    if (!draggedColumnId || draggedColumnId === targetId) return;
    setColumnIds((current) => {
      const from = current.indexOf(draggedColumnId);
      const to = current.indexOf(targetId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, draggedColumnId);
      return next;
    });
  };

  const saveTemplate = async () => {
    const name = templateName.trim();
    if (!name) { toast.error("Bitte vergeben Sie einen Namen für die Vorlage."); return; }
    if (!columnIds.length) { toast.error("Eine Vorlage benötigt mindestens eine Spalte."); return; }
    const now = new Date().toISOString();
    const existing = templates.find((template) => template.name.localeCompare(name, "de-DE", { sensitivity: "base" }) === 0);
    const template: ExportStudioTemplate = { id: existing?.id ?? crypto.randomUUID(), name, source, columnIds, pseudonymize, createdAt: existing?.createdAt ?? now, updatedAt: now };
    await saveTemplates([...templates.filter((item) => item.id !== template.id), template].sort((left, right) => left.name.localeCompare(right.name, "de-DE")));
    setTemplateName("");
    toast.success("Exportvorlage lokal gespeichert.");
  };

  const loadTemplate = (id: string) => {
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    setSource(template.source);
    setColumnIds(template.columnIds);
    setPseudonymize(template.pseudonymize);
    toast.success(`Vorlage „${template.name}“ geladen.`);
  };

  const executeExport = async (format: "xlsx" | "csv" | "markdown") => {
    if (!columnIds.length) { toast.error("Fügen Sie mindestens eine Spalte hinzu."); return; }
    const name = normalizeExportFilename(fileName || `rvtools-${source}`);
    try {
      if (format === "xlsx") await exportExcelTable(exportData, name);
      else if (format === "csv") exportCsvTable(exportData, name);
      else downloadTextFile(buildManagementMarkdown(dataset.title, dataset, exportData, pseudonymize), `${name}.md`, "text/markdown;charset=utf-8");
      toast.success(`${format === "xlsx" ? "Excel" : format === "csv" ? "CSV" : "Markdown-Report"} wurde erzeugt.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export fehlgeschlagen.");
    }
  };

  const loading = snapshotsLoading || vmsLoading || hostsQuery.isLoading || clustersQuery.isLoading || rawVHostLoading || runsLoading || workloadProfilesLoading || techInfoLoading;
  if (loading) return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Exportdaten werden vorbereitet…</div>;
  if (!snapshots.length) return <EmptyState icon={<Table2 className="h-6 w-6" />} title="Keine Daten für den Export" description="Laden Sie zuerst mindestens einen RVTools-Snapshot hoch." actionLabel="Zum Upload" actionTo="/upload" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Export & Berichte" subtitle="Stellen Sie einen lokalen Export aus dem aktuell gefilterten Datenbestand zusammen." meta={`${dataset.rows.length.toLocaleString("de-DE")} Datensätze`} />

      <KpiGrid>
        <KpiCard title="Datensätze im Scope" value={dataset.rows.length.toLocaleString("de-DE")} subtitle={sourceLabels[source]} icon={<Table2 className="h-4 w-4" />} />
        <KpiCard title="Ausgewählte Spalten" value={columnIds.length} subtitle={`von ${dataset.columns.length} verfügbar`} severity={columnIds.length === 0 ? "warn" : undefined} icon={<Columns3 className="h-4 w-4" />} />
        <KpiCard title="vCenter-Scope" value={activeSnapshots.length} subtitle={filters.globalFilter !== null ? "Globaler Filter aktiv" : undefined} icon={<Server className="h-4 w-4" />} />
        <KpiCard title="Gespeicherte Vorlagen" value={templates.length} icon={<BookmarkCheck className="h-4 w-4" />} />
        <KpiCard title="Pseudonymisierung" value={pseudonymize ? "Aktiv" : "Inaktiv"} icon={pseudonymize ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />} />
        <KpiCard title="Jüngster Snapshot" value={latestExportTs ? new Date(latestExportTs).toLocaleDateString("de-DE") : "—"} subtitle={latestExportTs ? new Date(latestExportTs).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr" : undefined} icon={<Clock className="h-4 w-4" />} />
      </KpiGrid>

      <section className="rounded-lg border border-primary/25 bg-primary/[0.045] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Aktiver Datenkontext</p>
            <p className="mt-1 text-xs text-muted-foreground">{scope}. vCenter-, Such-, Cluster- und Hostfilter werden übernommen; der globale Filter wirkt auf VM-Exporte gemäß seiner Definition.</p>
          </div>
          <Badge variant="secondary">Nur lokal im Browser</Badge>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_28.6rem]">
        <section className="space-y-4 rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/60 pb-4">
            <div className="space-y-1">
              <Label htmlFor="export-source">Datenquelle</Label>
              <Select value={source} onValueChange={(value) => { const next = value as ExportStudioSource; setSource(next); setColumnIds([]); setFileName(`rvtools-${next}`); }}>
                <SelectTrigger id="export-source" className="w-64"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(sourceLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="text-right text-xs text-muted-foreground"><span className="block font-medium text-foreground">{dataset.rows.length.toLocaleString("de-DE")}</span>Datensätze im Export-Scope</div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-md border border-border/70 bg-muted/15 p-3">
              <div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold">Verfügbare Spalten</p><span className="text-xs text-muted-foreground">{dataset.columns.length}</span></div>
              <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
                {columnGroups.map(([category, columns]) => (
                  <div key={category || "__ungrouped"} className="mt-2 first:mt-0">
                    {category && <p className="px-2.5 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{category}</p>}
                    {columns.map((column) => {
                      const selected = columnIds.includes(column.id);
                      return <button key={column.id} type="button" disabled={selected} onClick={() => addColumn(column.id)} className="flex w-full items-center justify-between rounded px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-40"><span>{column.label}</span>{selected ? <span className="text-xs">hinzugefügt</span> : <Plus className="h-4 w-4 text-primary" />}</button>;
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/15 p-3">
              <div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold">Exportspalten</p><span className="text-xs text-muted-foreground">per Drag & Drop sortieren</span></div>
              {!selectedColumns.length ? <p className="rounded border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">Fügen Sie links die gewünschten Spalten hinzu.</p> : <div className="max-h-80 space-y-1 overflow-y-auto pr-1">{selectedColumns.map((column) => column && <div key={column.id} draggable onDragStart={() => setDraggedColumnId(column.id)} onDragOver={(event: DragEvent) => event.preventDefault()} onDrop={() => reorderColumn(column.id)} onDragEnd={() => setDraggedColumnId(null)} className="flex items-center gap-2 rounded border border-border/70 bg-background px-2 py-1.5 text-sm"><GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" /><span className="flex-1">{column.label}</span><Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeColumn(column.id)} aria-label={`${column.label} entfernen`}><Trash2 className="h-3.5 w-3.5" /></Button></div>)}</div>}
            </div>
          </div>
        </section>

        <aside className="space-y-4 rounded-lg border bg-card p-5 shadow-sm">
          <div><p className="text-sm font-semibold">Export konfigurieren</p><p className="mt-1 text-xs text-muted-foreground">Bezeichner werden ausschließlich in der erzeugten Datei ersetzt.</p></div>
          <div className="space-y-2"><Label htmlFor="export-file-name">Dateiname</Label><Input id="export-file-name" value={fileName} onChange={(event) => setFileName(event.target.value)} /></div>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border/70 p-3"><Checkbox checked={pseudonymize} onCheckedChange={(checked) => setPseudonymize(checked === true)} /><span><span className="block text-sm font-medium">Pseudonymisieren</span><span className="mt-0.5 block text-xs text-muted-foreground">vCenter, Cluster, Server, Hosts und organisatorische Namen bleiben konsistent nachvollziehbar.</span></span></label>
          <div className="space-y-2 border-t border-border/60 pt-4"><Label htmlFor="export-template">Gespeicherte Vorlage</Label><Select onValueChange={loadTemplate}><SelectTrigger id="export-template"><SelectValue placeholder="Vorlage auswählen" /></SelectTrigger><SelectContent>{templates.length ? templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>) : <SelectItem value="none" disabled>Noch keine Vorlagen</SelectItem>}</SelectContent></Select></div>
          <div className="flex gap-2"><Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Name der Vorlage" /><Button type="button" variant="outline" size="icon" onClick={() => void saveTemplate()} aria-label="Vorlage speichern"><Save className="h-4 w-4" /></Button></div>
          <div className="grid grid-cols-3 gap-2 border-t border-border/60 pt-4"><Button type="button" variant="outline" size="sm" onClick={() => void executeExport("xlsx")} disabled={!columnIds.length}><FileSpreadsheet className="mr-1.5 h-4 w-4" />XLSX</Button><Button type="button" variant="outline" size="sm" onClick={() => void executeExport("csv")} disabled={!columnIds.length}><Download className="mr-1.5 h-4 w-4" />CSV</Button><Button type="button" size="sm" onClick={() => void executeExport("markdown")} disabled={!columnIds.length}><FileText className="mr-1.5 h-4 w-4" />Markdown</Button></div>
        </aside>
      </div>

      <section className="rounded-lg border bg-card p-5"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">Exportvorschau</h2><p className="mt-1 text-xs text-muted-foreground">Die Vorschau zeigt die ersten fünf Zeilen der ausgewählten Spalten.</p></div><div className="flex flex-wrap gap-2">{dataset.kpis.map((kpi) => <Badge key={kpi.label} variant="secondary">{kpi.label}: {kpi.value}</Badge>)}</div></div>{!exportData.headers.length ? <p className="py-10 text-center text-sm text-muted-foreground">Wählen Sie Spalten, um eine Vorschau zu sehen.</p> : <div className="overflow-x-auto rounded-md border"><table className="w-full text-sm"><thead className="bg-muted/40"><tr>{exportData.headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{header}</th>)}</tr></thead><tbody>{exportData.rows.slice(0, 5).map((row, index) => <tr key={index} className="border-t border-border/50">{exportData.headers.map((header) => <td key={header} className="whitespace-nowrap px-3 py-2">{row[header] || "—"}</td>)}</tr>)}</tbody></table></div>}</section>
    </div>
  );
}
