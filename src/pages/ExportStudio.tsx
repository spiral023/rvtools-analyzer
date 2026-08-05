import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { BookmarkCheck, CheckCheck, Clock, Columns3, Download, Eye, EyeOff, FileSpreadsheet, FileText, GripVertical, Plus, Save, Server, Settings2, Table2, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SysvDataPackageTab } from "@/components/exports/SysvDataPackageTab";
import { getUiState, putUiState } from "@/data/db";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useActiveSnapshotIds, useAllTechInfoLatest, useAllVropsLatest, useClusters, useDatastores, useHosts, useRawSheet, useVms } from "@/hooks/useActiveSnapshots";
import { useFillUpAnalysisRuns } from "@/hooks/useFillUpAnalysisRuns";
import { useRestrictedDataset } from "@/hooks/useRestrictedDataset";
import { useVmWorkloadProfiles } from "@/hooks/useVmWorkloadProfiles";
import { buildClusterCapacityWorkspace } from "@/lib/clusterCapacityWorkspace";
import type { ExportStudioSource, ExportStudioTemplate, NormalizedDatastore } from "@/domain/models/types";
import type { ExportStudioColumn } from "@/lib/export/exportStudio";
import {
  buildClusterExportDataset,
  buildDatastoreExportDataset,
  buildExportDataFromDataset,
  buildFillUpExportDataset,
  buildHostExportDataset,
  buildManagementMarkdown,
  buildVmExportDataset,
  pseudonymizeExportDataset,
} from "@/lib/export/exportStudio";
import { getExportColumnInfo } from "@/lib/glossaries/exportStudio";
import { downloadTextFile, exportCsvTable, exportExcelTable, normalizeExportFilename } from "@/lib/export/tableExport";

const UI_STATE_ID = "export-studio";

const sourceLabels: Record<ExportStudioSource, string> = {
  vms: "VM",
  hosts: "Host",
  clusters: "Cluster",
  datastores: "Datastores",
  "fill-up": "Fill-Up-Ergebnisse",
};

function pseudonymizationFieldKey(source: ExportStudioSource, columnId: string) {
  return `${source}:${columnId}`;
}

function groupPseudonymizableColumns(columns: readonly ExportStudioColumn[]) {
  const groups = new Map<string, ExportStudioColumn[]>();
  for (const column of columns) {
    const category = column.category ?? "Allgemeine Bezeichner";
    const group = groups.get(category);
    if (group) group.push(column);
    else groups.set(category, [column]);
  }
  return [...groups.entries()];
}

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

function filterDatastoreRows(rows: NormalizedDatastore[], filters: { clusters: string[]; hosts: string[]; search: string }) {
  const clusterSet = new Set(filters.clusters);
  const hostSet = new Set(filters.hosts);
  const search = filters.search.trim().toLocaleLowerCase("de-DE");
  return rows.filter((datastore) => {
    if (clusterSet.size && (!datastore.clusterName || !clusterSet.has(datastore.clusterName))) return false;
    if (hostSet.size && !datastore.hostNames.some((host) => hostSet.has(host))) return false;
    return !search || Object.values(datastore).some((value) => String(value ?? "").toLocaleLowerCase("de-DE").includes(search));
  });
}

function scopeLabel(vcenterCount: number, hasVmGlobalFilter: boolean) {
  const vcenter = `${vcenterCount} vCenter-Scope${vcenterCount === 1 ? "" : "s"}`;
  return hasVmGlobalFilter ? `${vcenter}; globaler VM-Filter aktiv` : vcenter;
}

export default function ExportStudio() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { snapshots, activeSnapshotIds, filters, snapshotsLoading } = useActiveSnapshotIds();
  const { vms, allVms, isLoading: vmsLoading } = useVms();
  const hostsQuery = useHosts();
  const clustersQuery = useClusters();
  const datastoresQuery = useDatastores();
  const { data: rawVHostRows = [], isLoading: rawVHostLoading } = useRawSheet("vHost");
  const { data: vropsLatest = [] } = useAllVropsLatest();
  const { runs, isLoading: runsLoading } = useFillUpAnalysisRuns();
  const { profiles: workloadProfiles, hosts: workloadHosts, isLoading: workloadProfilesLoading } = useVmWorkloadProfiles(null);
  const { data: techInfoLatest = [], isLoading: techInfoLoading } = useAllTechInfoLatest();
  const [source, setSource] = useState<ExportStudioSource>("vms");
  const [columnIds, setColumnIds] = useState<string[]>([]);
  const [pseudonymize, setPseudonymize] = useState(false);
  const [pseudonymizationDisabledFields, setPseudonymizationDisabledFields] = useState<string[]>([]);
  const [pseudonymizationSettingsOpen, setPseudonymizationSettingsOpen] = useState(false);
  const [fileName, setFileName] = useState("rvtools-export");
  const [templateName, setTemplateName] = useState("");
  const [templates, setTemplates] = useState<ExportStudioTemplate[]>([]);
  const draggedColumnId = useRef<string | null>(null);
  const { isRestricted: isRestrictedDataset } = useRestrictedDataset();
  // Aus einem bereits eingeschränkten Paket lässt sich kein sinnvolles Weiterverteilungs-
  // paket schneiden. Der Tab entfällt deshalb samt Deep-Link auf `?tab=sysv-package`.
  const exportTab = searchParams.get("tab") === "sysv-package" && !isRestrictedDataset ? "sysv-package" : "reports";

  const setExportTab = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", value === "sysv-package" ? "sysv-package" : "reports");
    setSearchParams(next, { replace: true });
  };

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
    const hosts = new Set<string>();
    const clusters = new Set<string>();
    for (const vm of vms) {
      if (vm.host) hosts.add(`${vm.vcenterId}::${vm.host}`);
      if (vm.cluster) clusters.add(`${vm.vcenterId}::${vm.cluster}`);
    }
    return { hosts, clusters };
  }, [filters.globalFilter, vms]);
  const filteredHosts = useMemo(() => filterInventoryRows(hostsQuery.data ?? [], filters).filter((host) => !globalVmPlacements || globalVmPlacements.hosts.has(`${host.vcenterId}::${host.host}`)), [filters, globalVmPlacements, hostsQuery.data]);
  const filteredClusters = useMemo(() => {
    const clusterSet = new Set(filters.clusters);
    const search = filters.search.trim().toLocaleLowerCase("de-DE");
    return (clustersQuery.data ?? []).filter((cluster) => (!clusterSet.size || clusterSet.has(cluster.name)) && (!search || Object.values(cluster).some((value) => String(value ?? "").toLocaleLowerCase("de-DE").includes(search))) && (!globalVmPlacements || globalVmPlacements.clusters.has(`${cluster.vcenterId}::${cluster.name}`)));
  }, [clustersQuery.data, filters, globalVmPlacements]);
  const filteredDatastores = useMemo(
    () => filterDatastoreRows(datastoresQuery.data ?? [], filters).filter((datastore) => {
      if (!globalVmPlacements) return true;
      if (datastore.clusterName && globalVmPlacements.clusters.has(`${datastore.vcenterId}::${datastore.clusterName}`)) return true;
      return datastore.hostNames.some((host) => globalVmPlacements.hosts.has(`${datastore.vcenterId}::${host}`));
    }),
    [datastoresQuery.data, filters, globalVmPlacements],
  );

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
    if (source === "datastores") return buildDatastoreExportDataset(filteredDatastores, activeSnapshots, scope);
    if (source === "fill-up") return buildFillUpExportDataset(runs, scope);
    return buildVmExportDataset(vms, activeSnapshots, scope, workloadProfiles, workloadHosts, techInfoLatest);
  }, [activeSnapshots, allVms, capacityRows, filteredClusters, filteredDatastores, filteredHosts, runs, scope, source, techInfoLatest, vms, workloadHosts, workloadProfiles]);
  const pseudonymizableColumns = useMemo(() => baseDataset.columns.filter((column) => Boolean(column.pseudonymKind)), [baseDataset.columns]);
  const pseudonymizationGroups = useMemo(() => groupPseudonymizableColumns(pseudonymizableColumns), [pseudonymizableColumns]);
  const enabledPseudonymColumnIds = useMemo(
    () => pseudonymizableColumns.filter((column) => !pseudonymizationDisabledFields.includes(pseudonymizationFieldKey(source, column.id))).map((column) => column.id),
    [pseudonymizableColumns, pseudonymizationDisabledFields, source],
  );
  const dataset = useMemo(
    () => pseudonymize ? pseudonymizeExportDataset(baseDataset, enabledPseudonymColumnIds) : baseDataset,
    [baseDataset, enabledPseudonymColumnIds, pseudonymize],
  );
  const selectedColumnIdSet = useMemo(() => new Set(columnIds), [columnIds]);
  const selectedColumns = useMemo(() => {
    const columnsById = new Map(dataset.columns.map((column) => [column.id, column]));
    return columnIds.flatMap((id) => {
      const column = columnsById.get(id);
      return column ? [column] : [];
    });
  }, [columnIds, dataset.columns]);
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
  const previewRows = useMemo(() => {
    const occurrences = new Map<string, number>();
    return exportData.rows.slice(0, 5).map((row) => {
      const signature = exportData.headers.map((header) => `${header}:${row[header] ?? ""}`).join("\u0000");
      const occurrence = (occurrences.get(signature) ?? 0) + 1;
      occurrences.set(signature, occurrence);
      return { key: `${signature}\u0000${occurrence}`, row };
    });
  }, [exportData]);

  useEffect(() => {
    let cancelled = false;
    void getUiState(UI_STATE_ID).then((state) => {
      if (!cancelled) {
        setTemplates(state?.exportStudioTemplates ?? []);
        setPseudonymizationDisabledFields(state?.exportStudioPseudonymizationDisabledFields ?? []);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const saveTemplates = async (next: ExportStudioTemplate[]) => {
    setTemplates(next);
    const existing = await getUiState(UI_STATE_ID);
    await putUiState({
      ...existing,
      id: UI_STATE_ID,
      theme: existing?.theme ?? "dark",
      exportStudioTemplates: next,
      exportStudioPseudonymizationDisabledFields: pseudonymizationDisabledFields,
    });
  };

  const togglePseudonymizationField = async (columnId: string, enabled: boolean) => {
    const key = pseudonymizationFieldKey(source, columnId);
    const next = enabled
      ? pseudonymizationDisabledFields.filter((field) => field !== key)
      : [...new Set([...pseudonymizationDisabledFields, key])];
    setPseudonymizationDisabledFields(next);
    const existing = await getUiState(UI_STATE_ID);
    await putUiState({
      ...existing,
      id: UI_STATE_ID,
      theme: existing?.theme ?? "dark",
      exportStudioTemplates: existing?.exportStudioTemplates ?? templates,
      exportStudioPseudonymizationDisabledFields: next,
    });
  };

  const addColumn = (id: string) => setColumnIds((current) => current.includes(id) ? current : [...current, id]);
  const addAllColumns = () => setColumnIds((current) => [...current, ...dataset.columns.map((column) => column.id).filter((id) => !current.includes(id))]);
  const removeColumn = (id: string) => setColumnIds((current) => current.filter((columnId) => columnId !== id));

  const reorderColumn = (targetId: string) => {
    const draggedId = draggedColumnId.current;
    if (!draggedId || draggedId === targetId) return;
    setColumnIds((current) => {
      const from = current.indexOf(draggedId);
      const to = current.indexOf(targetId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, draggedId);
      return next;
    });
  };

  const saveTemplate = async () => {
    const name = templateName.trim();
    if (!name) { toast.error("Bitte vergib einen Namen für die Vorlage."); return; }
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
    if (!columnIds.length) { toast.error("Füge mindestens eine Spalte hinzu."); return; }
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

  const loading = snapshotsLoading || vmsLoading || hostsQuery.isLoading || clustersQuery.isLoading || datastoresQuery.isLoading || rawVHostLoading || runsLoading || workloadProfilesLoading || techInfoLoading;
  if (loading) return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Exportdaten werden vorbereitet…</div>;
  if (!snapshots.length) return <EmptyState icon={<Table2 className="h-6 w-6" />} title="Keine Daten für den Export" description="Lade zuerst mindestens einen RVTools-Snapshot hoch." actionLabel="Zum Upload" actionTo="/upload" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Export & Berichte" meta={`${dataset.rows.length.toLocaleString("de-DE")} Datensätze`} />

      <Tabs value={exportTab} onValueChange={setExportTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="reports">Berichte</TabsTrigger>
          {!isRestrictedDataset && <TabsTrigger value="sysv-package">SysV-Datensatz</TabsTrigger>}
        </TabsList>

        <TabsContent value="reports" className="space-y-6">
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
            <p className="text-xs text-muted-foreground">{scope}. vCenter-, Such-, Cluster- und Hostfilter werden übernommen; der globale Filter wirkt auf VM-Exporte gemäß seiner Definition.</p>
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
              <div className="mb-3 flex items-center justify-between gap-2"><p className="text-sm font-semibold">Verfügbare Spalten</p><Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={addAllColumns} disabled={dataset.columns.every((column) => selectedColumnIdSet.has(column.id))}><CheckCheck className="mr-1 h-3.5 w-3.5" />Alle auswählen</Button></div>
              <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
                {columnGroups.map(([category, columns]) => (
                  <div key={category || "__ungrouped"} className="mt-2 first:mt-0">
                    {category && <p className="px-2.5 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{category}</p>}
                    {columns.map((column) => {
                      const selected = selectedColumnIdSet.has(column.id);
                      return <button key={column.id} type="button" disabled={selected} onClick={() => addColumn(column.id)} className="flex w-full items-center justify-between rounded px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-40"><span>{column.label}</span>{selected ? <span className="text-xs">hinzugefügt</span> : <Plus className="h-4 w-4 text-primary" />}</button>;
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/15 p-3">
              <div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold">Exportspalten</p><span className="text-xs text-muted-foreground">per Drag & Drop sortieren</span></div>
              {!selectedColumns.length ? <p className="rounded border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">Füge links die gewünschten Spalten hinzu.</p> : <div className="max-h-80 space-y-1 overflow-y-auto pr-1">{selectedColumns.map((column) => <div key={column.id} draggable onDragStart={() => { draggedColumnId.current = column.id; }} onDragOver={(event: DragEvent) => event.preventDefault()} onDrop={() => reorderColumn(column.id)} onDragEnd={() => { draggedColumnId.current = null; }} className="flex items-center gap-2 rounded border border-border/70 bg-background px-2 py-1.5 text-sm"><GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" /><span className="flex-1">{column.label}</span><Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeColumn(column.id)} aria-label={`${column.label} entfernen`}><Trash2 className="h-3.5 w-3.5" /></Button></div>)}</div>}
            </div>
          </div>
        </section>

        <aside className="space-y-4 rounded-lg border bg-card p-5 shadow-sm">
          <div><p className="text-sm font-semibold">Export konfigurieren</p><p className="mt-1 text-xs text-muted-foreground">Bezeichner werden ausschließlich in der erzeugten Datei ersetzt.</p></div>
          <div className="space-y-2"><Label htmlFor="export-file-name">Dateiname</Label><Input id="export-file-name" value={fileName} onChange={(event) => setFileName(event.target.value)} /></div>
          <div className="rounded-md border border-border/70 p-3">
            <div className="flex items-start gap-3">
              <Checkbox id="export-pseudonymize" checked={pseudonymize} onCheckedChange={(checked) => setPseudonymize(checked === true)} />
              <label htmlFor="export-pseudonymize" className="min-w-0 flex-1 cursor-pointer"><span className="block text-sm font-medium">Pseudonymisieren</span><span className="mt-0.5 block text-xs text-muted-foreground">Bezeichner, Personen, Abteilungen und Freitexte werden ausschließlich in der erzeugten Datei ersetzt.</span></label>
              <Button type="button" variant="ghost" size="icon" className="-mt-1 -mr-1 shrink-0" onClick={() => setPseudonymizationSettingsOpen(true)} aria-label="Pseudonymisierung konfigurieren"><Settings2 className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="space-y-2 border-t border-border/60 pt-4"><Label htmlFor="export-template">Gespeicherte Vorlage</Label><Select onValueChange={loadTemplate}><SelectTrigger id="export-template"><SelectValue placeholder="Vorlage auswählen" /></SelectTrigger><SelectContent>{templates.length ? templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>) : <SelectItem value="none" disabled>Noch keine Vorlagen</SelectItem>}</SelectContent></Select></div>
          <div className="flex gap-2"><Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Name der Vorlage" /><Button type="button" variant="outline" size="icon" onClick={() => void saveTemplate()} aria-label="Vorlage speichern"><Save className="h-4 w-4" /></Button></div>
          <div className="grid grid-cols-3 gap-2 border-t border-border/60 pt-4"><Button type="button" variant="outline" size="sm" onClick={() => void executeExport("xlsx")} disabled={!columnIds.length}><FileSpreadsheet className="mr-1.5 h-4 w-4" />XLSX</Button><Button type="button" variant="outline" size="sm" onClick={() => void executeExport("csv")} disabled={!columnIds.length}><Download className="mr-1.5 h-4 w-4" />CSV</Button><Button type="button" size="sm" onClick={() => void executeExport("markdown")} disabled={!columnIds.length}><FileText className="mr-1.5 h-4 w-4" />Markdown</Button></div>
        </aside>
      </div>

      <Dialog open={pseudonymizationSettingsOpen} onOpenChange={setPseudonymizationSettingsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pseudonymisierung konfigurieren</DialogTitle>
            <DialogDescription>Die Einstellungen gelten lokal für Exporte aus der Datenquelle „{sourceLabels[source]}“. Aktivierte Felder werden mit konsistenten Platzhaltern ersetzt.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
            <section className="overflow-hidden rounded-md border border-border/70">
              <div className="flex items-center justify-between bg-muted/40 px-4 py-3">
                <div><p className="text-sm font-semibold">{sourceLabels[source]}</p><p className="text-xs text-muted-foreground">Datenquelle</p></div>
                <Badge variant="secondary">{enabledPseudonymColumnIds.length} von {pseudonymizableColumns.length} aktiv</Badge>
              </div>
              {pseudonymizableColumns.length ? (
                <div className="divide-y divide-border/60">
                  {pseudonymizationGroups.map(([category, columns]) => (
                    <div key={category} className="p-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{category}</p>
                      <div className="space-y-1">
                        {columns.map((column) => {
                          const enabled = !pseudonymizationDisabledFields.includes(pseudonymizationFieldKey(source, column.id));
                          return <div key={column.id} className="flex items-center justify-between gap-4 rounded px-2 py-2 hover:bg-muted/40"><div><p className="text-sm font-medium">{column.label}</p><p className="text-xs text-muted-foreground">{column.pseudonymKind === "person" ? "Personenname" : column.pseudonymKind === "department" ? "Organisationsbezeichnung" : column.pseudonymKind === "text" ? "Freitext" : "Technischer Bezeichner"}</p></div><Switch checked={enabled} onCheckedChange={(checked) => void togglePseudonymizationField(column.id, checked)} aria-label={`${column.label} ${enabled ? "nicht mehr" : ""} pseudonymisieren`} /></div>;
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="p-5 text-sm text-muted-foreground">Für diese Datenquelle sind keine pseudonymisierbaren Felder vorhanden.</p>}
            </section>
          </div>
          <DialogFooter><Button type="button" onClick={() => setPseudonymizationSettingsOpen(false)}>Fertig</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <section className="rounded-lg border bg-card p-5"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">Exportvorschau</h2><p className="mt-1 text-xs text-muted-foreground">Die Vorschau zeigt die ersten fünf Zeilen der ausgewählten Spalten. Spaltennamen erklären Metrik und Datenquelle per Tooltip.</p></div><div className="flex flex-wrap gap-2">{dataset.kpis.map((kpi) => <Badge key={kpi.label} variant="secondary">{kpi.label}: {kpi.value}</Badge>)}</div></div>{!exportData.headers.length ? <p className="py-10 text-center text-sm text-muted-foreground">Wähle Spalten, um eine Vorschau zu sehen.</p> : <div className="overflow-x-auto rounded-md border"><table className="w-full text-sm"><thead className="bg-muted/40"><tr>{exportData.headers.map((header, index) => <th key={header} className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"><InfoTooltip entry={getExportColumnInfo(dataset.source, selectedColumns[index])} side="bottom"><span className="cursor-help underline decoration-dotted underline-offset-4">{header}</span></InfoTooltip></th>)}</tr></thead><tbody>{previewRows.map(({ key, row }) => <tr key={key} className="border-t border-border/50">{exportData.headers.map((header) => <td key={header} className="whitespace-nowrap px-3 py-2">{row[header] || "—"}</td>)}</tr>)}</tbody></table></div>}</section>
        </TabsContent>

        {!isRestrictedDataset && (
          <TabsContent value="sysv-package" className="space-y-6">
            <SysvDataPackageTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
