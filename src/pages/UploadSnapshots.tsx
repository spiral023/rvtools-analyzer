import { useCallback, useMemo, useReducer, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  getSnapshots, deleteSnapshot, deleteSystemData, getTechInfoImports, deleteTechInfoImport,
  getTechInfoClientImports, deleteTechInfoClientImport,
  getCdpImports, deleteCdpImport,
  getIpamImports, deleteIpamImport,
  getEramonIfaceImports, deleteEramonIfaceImport,
  getEramonL2Imports, deleteEramonL2Import,
  getVropsImports, deleteVropsImport,
  getVropsTimeSeriesImports, deleteVropsTimeSeriesImport,
  estimateSnapshotSizesBytes, estimateTechInfoImportSizesBytes, estimateTechInfoClientImportSizesBytes,
  estimateCdpImportSizesBytes, estimateIpamImportSizesBytes,
  estimateEramonIfaceImportSizesBytes, estimateEramonL2ImportSizesBytes, estimateVropsImportSizesBytes,
  estimateVropsTimeSeriesImportSizesBytes,
} from "@/data/db";
import type { DeleteProgress, DeleteProgressCallback } from "@/data/db";
import { deleteUserData } from "@/domain/services/backupService";
import { fileKindLabel, useImportController } from "@/hooks/useImportController";
import { formatBytes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Upload, FileSpreadsheet, Trash2, AlertCircle, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import type { SnapshotMeta, TechInfoImportMeta, TechInfoClientImportMeta, CdpImportMeta, IpamImportMeta, EramonIfaceImportMeta, EramonL2ImportMeta, VropsImportMeta, VropsTimeSeriesImport } from "@/domain/models/types";
import { DiagnosticsPanel } from "@/components/uploads/DiagnosticsPanel";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { PageHeader } from "@/components/layout/PageHeader";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Database, FileCheck2, HardDrive, Layers3, PackagePlus } from "lucide-react";
import { formatIsoDateTime } from "@/lib/clientDetail";

type StoredUpload =
  | { kind: "rvtools"; id: string; importedAt: string; snapshot: SnapshotMeta }
  | { kind: "tech-info"; id: string; importedAt: string; techInfo: TechInfoImportMeta }
  | { kind: "tech-info-client"; id: string; importedAt: string; techInfoClient: TechInfoClientImportMeta }
  | { kind: "cdp"; id: string; importedAt: string; cdp: CdpImportMeta }
  | { kind: "ipam"; id: string; importedAt: string; ipam: IpamImportMeta }
  | { kind: "eramon-iface"; id: string; importedAt: string; eramonIface: EramonIfaceImportMeta }
  | { kind: "eramon-l2"; id: string; importedAt: string; eramonL2: EramonL2ImportMeta }
  | { kind: "vrops"; id: string; importedAt: string; vrops: VropsImportMeta }
  | { kind: "vrops-timeseries"; id: string; importedAt: string; vropsTimeSeries: VropsTimeSeriesImport };

interface UploadTableRow {
  id: string;
  kind: StoredUpload["kind"];
  type: string;
  fileName: string;
  fileSizeBytes: number | null;
  fileSizeEstimated: boolean;
  importedAt: string;
  sheets: number;
  rows: number;
}

function uploadTableRow(upload: StoredUpload, estimatedSizeBytes?: number): UploadTableRow {
  switch (upload.kind) {
    case "rvtools":
      return {
        id: upload.id,
        kind: upload.kind,
        type: fileKindLabel(upload.kind),
        fileName: upload.snapshot.fileName,
        fileSizeBytes: upload.snapshot.fileSizeBytes ?? estimatedSizeBytes ?? null,
        fileSizeEstimated: upload.snapshot.fileSizeBytes === undefined,
        importedAt: upload.importedAt,
        sheets: Object.keys(upload.snapshot.sheetStats).length,
        rows: Object.values(upload.snapshot.sheetStats).reduce((sum, sheet) => sum + sheet.rowCount, 0),
      };
    case "tech-info":
      return { id: upload.id, kind: upload.kind, type: fileKindLabel(upload.kind), fileName: upload.techInfo.fileName, fileSizeBytes: upload.techInfo.fileSizeBytes ?? estimatedSizeBytes ?? null, fileSizeEstimated: upload.techInfo.fileSizeBytes === undefined, importedAt: upload.importedAt, sheets: 1, rows: upload.techInfo.rowCount };
    case "tech-info-client":
      return { id: upload.id, kind: upload.kind, type: fileKindLabel(upload.kind), fileName: upload.techInfoClient.fileName, fileSizeBytes: upload.techInfoClient.fileSizeBytes ?? estimatedSizeBytes ?? null, fileSizeEstimated: upload.techInfoClient.fileSizeBytes === undefined, importedAt: upload.importedAt, sheets: 1, rows: upload.techInfoClient.rowCount };
    case "cdp":
      return { id: upload.id, kind: upload.kind, type: fileKindLabel(upload.kind), fileName: upload.cdp.fileName, fileSizeBytes: upload.cdp.fileSizeBytes ?? estimatedSizeBytes ?? null, fileSizeEstimated: upload.cdp.fileSizeBytes === undefined, importedAt: upload.importedAt, sheets: 1, rows: upload.cdp.rowCount };
    case "ipam":
      return { id: upload.id, kind: upload.kind, type: fileKindLabel(upload.kind), fileName: upload.ipam.fileName, fileSizeBytes: upload.ipam.fileSizeBytes ?? estimatedSizeBytes ?? null, fileSizeEstimated: upload.ipam.fileSizeBytes === undefined, importedAt: upload.importedAt, sheets: 1, rows: upload.ipam.rowCount };
    case "eramon-iface":
      return { id: upload.id, kind: upload.kind, type: fileKindLabel(upload.kind), fileName: upload.eramonIface.fileName, fileSizeBytes: upload.eramonIface.fileSizeBytes ?? estimatedSizeBytes ?? null, fileSizeEstimated: upload.eramonIface.fileSizeBytes === undefined, importedAt: upload.importedAt, sheets: 1, rows: upload.eramonIface.rowCount };
    case "eramon-l2":
      return { id: upload.id, kind: upload.kind, type: fileKindLabel(upload.kind), fileName: upload.eramonL2.fileName, fileSizeBytes: upload.eramonL2.fileSizeBytes ?? estimatedSizeBytes ?? null, fileSizeEstimated: upload.eramonL2.fileSizeBytes === undefined, importedAt: upload.importedAt, sheets: 1, rows: upload.eramonL2.rowCount };
    case "vrops":
      return { id: upload.id, kind: upload.kind, type: fileKindLabel(upload.kind), fileName: upload.vrops.fileName, fileSizeBytes: upload.vrops.fileSizeBytes ?? estimatedSizeBytes ?? null, fileSizeEstimated: upload.vrops.fileSizeBytes === undefined, importedAt: upload.importedAt, sheets: 1, rows: upload.vrops.rowCount };
    case "vrops-timeseries":
      return { id: upload.id, kind: upload.kind, type: fileKindLabel(upload.kind), fileName: upload.vropsTimeSeries.files.map((file) => file.fileName).join(" · "), fileSizeBytes: upload.vropsTimeSeries.files.reduce((sum, file) => sum + file.fileSizeBytes, 0), fileSizeEstimated: false, importedAt: upload.importedAt, sheets: upload.vropsTimeSeries.files.length, rows: upload.vropsTimeSeries.files.reduce((sum, file) => sum + file.rowCount, 0) };
  }
}

function uploadDeleteLabel(kind: StoredUpload["kind"]): string {
  return kind === "rvtools" ? "Snapshot löschen" : `${fileKindLabel(kind)} löschen`;
}

type UploadState = {
  dragOver: boolean;
  deleteSystemOpen: boolean;
  deleteUserOpen: boolean;
  deleting: boolean;
  deleteProgress: DeleteProgress | null;
};

type UploadAction =
  | { type: "set-drag-over"; value: boolean }
  | { type: "set-delete-system-open"; value: boolean }
  | { type: "set-delete-user-open"; value: boolean }
  | { type: "set-deleting"; value: boolean }
  | { type: "set-delete-progress"; value: DeleteProgress | null };

function uploadReducer(state: UploadState, action: UploadAction): UploadState {
  switch (action.type) {
    case "set-drag-over":
      return { ...state, dragOver: action.value };
    case "set-delete-system-open":
      return { ...state, deleteSystemOpen: action.value };
    case "set-delete-user-open":
      return { ...state, deleteUserOpen: action.value };
    case "set-deleting":
      return { ...state, deleting: action.value };
    case "set-delete-progress":
      return { ...state, deleteProgress: action.value };
    default:
      return state;
  }
}

function buildStoredUploads(
  snapshots: SnapshotMeta[],
  techInfoImports: TechInfoImportMeta[],
  techInfoClientImports: TechInfoClientImportMeta[],
  cdpImports: CdpImportMeta[],
  ipamImports: IpamImportMeta[],
  eramonIfaceImports: EramonIfaceImportMeta[],
  eramonL2Imports: EramonL2ImportMeta[],
  vropsImports: VropsImportMeta[],
  vropsTimeSeriesImports: VropsTimeSeriesImport[],
): StoredUpload[] {
  const uploads: StoredUpload[] = [];
  for (const snapshot of snapshots) {
    uploads.push({ kind: "rvtools", id: snapshot.snapshotId, importedAt: snapshot.importedAt, snapshot });
  }
  for (const techInfo of techInfoImports) {
    uploads.push({ kind: "tech-info", id: techInfo.techInfoImportId, importedAt: techInfo.importedAt, techInfo });
  }
  for (const techInfoClient of techInfoClientImports) {
    uploads.push({ kind: "tech-info-client", id: techInfoClient.techInfoClientImportId, importedAt: techInfoClient.importedAt, techInfoClient });
  }
  for (const cdp of cdpImports) {
    uploads.push({ kind: "cdp", id: cdp.cdpImportId, importedAt: cdp.importedAt, cdp });
  }
  for (const ipam of ipamImports) {
    uploads.push({ kind: "ipam", id: ipam.ipamImportId, importedAt: ipam.importedAt, ipam });
  }
  for (const eramonIface of eramonIfaceImports) {
    uploads.push({ kind: "eramon-iface", id: eramonIface.ifaceImportId, importedAt: eramonIface.importedAt, eramonIface });
  }
  for (const eramonL2 of eramonL2Imports) {
    uploads.push({ kind: "eramon-l2", id: eramonL2.l2ImportId, importedAt: eramonL2.importedAt, eramonL2 });
  }
  for (const vrops of vropsImports) {
    uploads.push({ kind: "vrops", id: vrops.vropsImportId, importedAt: vrops.importedAt, vrops });
  }
  for (const vropsTimeSeries of vropsTimeSeriesImports) {
    uploads.push({ kind: "vrops-timeseries", id: vropsTimeSeries.id, importedAt: vropsTimeSeries.importedAt, vropsTimeSeries });
  }
  return uploads.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

function useUploadSnapshotsView() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = "snapshot-upload-input";
  const { importing, items, importFiles } = useImportController();
  const [uploadState, dispatch] = useReducer(uploadReducer, {
    dragOver: false,
    deleteSystemOpen: false,
    deleteUserOpen: false,
    deleting: false,
    deleteProgress: null,
  });
  const { dragOver, deleteSystemOpen, deleteUserOpen, deleting, deleteProgress } = uploadState;
  const activeItem = items.find((item) => item.status === "running") ?? items.at(-1) ?? null;
  const progress = activeItem?.progress ?? null;
  const lastResult = [...items].reverse().find((item) => item.result)?.result ?? null;

  const { data: uploads = [], refetch } = useQuery({
    queryKey: ["storedUploads"],
    queryFn: async () => {
      const [snapshots, techInfoImports, techInfoClientImports, cdpImports, ipamImports, eramonIfaceImports, eramonL2Imports, vropsImports, vropsTimeSeriesImports] = await Promise.all([
        getSnapshots(),
        getTechInfoImports(),
        getTechInfoClientImports(),
        getCdpImports(),
        getIpamImports(),
        getEramonIfaceImports(),
        getEramonL2Imports(),
        getVropsImports(),
        getVropsTimeSeriesImports(),
      ]);
      return buildStoredUploads(snapshots, techInfoImports, techInfoClientImports, cdpImports, ipamImports, eramonIfaceImports, eramonL2Imports, vropsImports, vropsTimeSeriesImports);
    },
  });

  const uploadIdsKey = uploads.map((u) => `${u.kind}:${u.id}`).join("|");
  const { data: uploadSizes } = useQuery({
    queryKey: ["uploadSizes", uploadIdsKey],
    enabled: uploads.length > 0,
    queryFn: async () => {
      const uploadIdsByKind = uploads.reduce<Record<StoredUpload["kind"], string[]>>(
        (acc, upload) => {
          acc[upload.kind].push(upload.id);
          return acc;
        },
        { rvtools: [], "tech-info": [], "tech-info-client": [], cdp: [], ipam: [], "eramon-iface": [], "eramon-l2": [], vrops: [], "vrops-timeseries": [] },
      );
      const [rvtools, techInfo, techInfoClient, cdp, ipam, eramonIfaceSizes, eramonL2Sizes, vropsSizes, vropsTimeSeriesSizes] = await Promise.all([
        estimateSnapshotSizesBytes(uploadIdsByKind.rvtools),
        estimateTechInfoImportSizesBytes(uploadIdsByKind["tech-info"]),
        estimateTechInfoClientImportSizesBytes(uploadIdsByKind["tech-info-client"]),
        estimateCdpImportSizesBytes(uploadIdsByKind.cdp),
        estimateIpamImportSizesBytes(uploadIdsByKind.ipam),
        estimateEramonIfaceImportSizesBytes(uploadIdsByKind["eramon-iface"]),
        estimateEramonL2ImportSizesBytes(uploadIdsByKind["eramon-l2"]),
        estimateVropsImportSizesBytes(uploadIdsByKind.vrops),
        estimateVropsTimeSeriesImportSizesBytes(uploadIdsByKind["vrops-timeseries"]),
      ]);
      return { rvtools, "tech-info": techInfo, "tech-info-client": techInfoClient, cdp, ipam, "eramon-iface": eramonIfaceSizes, "eramon-l2": eramonL2Sizes, vrops: vropsSizes, "vrops-timeseries": vropsTimeSeriesSizes } satisfies Record<StoredUpload["kind"], Record<string, number>>;
    },
  });
  const totalSizeBytes = uploadSizes
    ? Object.values(uploadSizes).reduce((sum, byId) => sum + Object.values(byId).reduce((s, b) => s + b, 0), 0)
    : null;

  const invalidateAll = useCallback(() => { queryClient.invalidateQueries(); refetch(); }, [queryClient, refetch]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); dispatch({ type: "set-drag-over", value: false });
    if (e.dataTransfer.files.length) void importFiles(e.dataTransfer.files);
  }, [importFiles]);

  const runDelete = useCallback(async (
    performDelete: (onProgress: DeleteProgressCallback) => Promise<void>,
    successMessage: string,
  ) => {
    dispatch({ type: "set-deleting", value: true });
    try {
      await performDelete((nextProgress) => dispatch({ type: "set-delete-progress", value: nextProgress }));
      toast.success(successMessage);
    } catch (err) {
      toast.error(`Löschen fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      dispatch({ type: "set-deleting", value: false });
      dispatch({ type: "set-delete-progress", value: null });
      invalidateAll();
    }
  }, [invalidateAll]);

  const handleDeleteSnapshot = useCallback(async (snapshotId: string) => {
    await runDelete((onProgress) => deleteSnapshot(snapshotId, onProgress), "Snapshot gelöscht.");
  }, [runDelete]);

  const handleDeleteTechInfoImport = useCallback(async (techInfoImportId: string) => {
    await runDelete(() => deleteTechInfoImport(techInfoImportId), "Tech-Info gelöscht.");
  }, [runDelete]);

  const handleDeleteTechInfoClientImport = useCallback(async (techInfoClientImportId: string) => {
    await runDelete(() => deleteTechInfoClientImport(techInfoClientImportId), "Tech-Info Client gelöscht.");
  }, [runDelete]);

  const handleDeleteCdpImport = useCallback(async (cdpImportId: string) => {
    await runDelete(() => deleteCdpImport(cdpImportId), "CDP-Daten gelöscht.");
  }, [runDelete]);

  const handleDeleteIpamImport = useCallback(async (ipamImportId: string) => {
    await runDelete(() => deleteIpamImport(ipamImportId), "IPAM-Daten gelöscht.");
  }, [runDelete]);

  const handleDeleteEramonIfaceImport = useCallback(async (ifaceImportId: string) => {
    await runDelete(() => deleteEramonIfaceImport(ifaceImportId), "Eramon Switch-Port-Daten gelöscht.");
  }, [runDelete]);

  const handleDeleteEramonL2Import = useCallback(async (l2ImportId: string) => {
    await runDelete(() => deleteEramonL2Import(l2ImportId), "Eramon MAC-Tabellen-Daten gelöscht.");
  }, [runDelete]);

  const handleDeleteVropsImport = useCallback(async (vropsImportId: string) => {
    await runDelete(() => deleteVropsImport(vropsImportId), "vROps-Daten gelöscht.");
  }, [runDelete]);

  const handleDeleteSystemData = useCallback(async () => {
    dispatch({ type: "set-delete-system-open", value: false });
    await runDelete((onProgress) => deleteSystemData(onProgress), "Alle Systemdaten wurden gelöscht.");
  }, [runDelete]);

  const handleDeleteUserData = useCallback(async () => {
    dispatch({ type: "set-delete-user-open", value: false });
    await runDelete((onProgress) => deleteUserData(onProgress), "Alle Userdaten wurden gelöscht.");
  }, [runDelete]);

  const handleDeleteVropsTimeSeriesImport = useCallback(async (importId: string) => {
    await runDelete(() => deleteVropsTimeSeriesImport(importId), "vROps-Zeitreihen gelöscht.");
  }, [runDelete]);

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "diagnostics" ? "diagnostics" : "uploads";
  const uploadRows = useMemo(
    () => uploads.map((upload) => uploadTableRow(upload, uploadSizes?.[upload.kind]?.[upload.id])),
    [uploadSizes, uploads],
  );
  const uploadColumns = useMemo<ColumnDef<UploadTableRow, unknown>[]>(() => [
    {
      accessorKey: "type",
      header: "Typ",
      cell: ({ getValue }) => <span className="whitespace-nowrap font-medium">{getValue() as string}</span>,
    },
    {
      accessorKey: "fileName",
      header: "Dateiname",
      cell: ({ getValue }) => <span className="block max-w-[300px] truncate font-medium" title={getValue() as string}>{getValue() as string}</span>,
    },
    {
      accessorKey: "fileSizeBytes",
      header: "Dateigröße",
      cell: ({ getValue, row }) => {
        const value = getValue() as number | null;
        if (value === null) return "k. A.";
        return <span className="whitespace-nowrap font-mono-data">{row.original.fileSizeEstimated ? "≈ " : ""}{formatBytes(value)}</span>;
      },
    },
    {
      accessorKey: "importedAt",
      header: "Import-Datum",
      cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{formatIsoDateTime(getValue() as string)}</span>,
    },
    {
      accessorKey: "sheets",
      header: "Sheets",
      cell: ({ getValue }) => <span className="font-mono-data">{(getValue() as number).toLocaleString("de-DE")}</span>,
    },
    {
      accessorKey: "rows",
      header: "Zeilen",
      cell: ({ getValue }) => <span className="font-mono-data">{(getValue() as number).toLocaleString("de-DE")}</span>,
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      meta: { configurable: false, exportable: false },
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground/60 transition-colors hover:text-destructive focus-visible:text-destructive active:scale-[0.96]"
          disabled={deleting || importing}
          onClick={() => {
            const { kind, id } = row.original;
            if (kind === "tech-info") void handleDeleteTechInfoImport(id);
            else if (kind === "tech-info-client") void handleDeleteTechInfoClientImport(id);
            else if (kind === "cdp") void handleDeleteCdpImport(id);
            else if (kind === "ipam") void handleDeleteIpamImport(id);
            else if (kind === "eramon-iface") void handleDeleteEramonIfaceImport(id);
            else if (kind === "eramon-l2") void handleDeleteEramonL2Import(id);
            else if (kind === "vrops") void handleDeleteVropsImport(id);
            else if (kind === "vrops-timeseries") void handleDeleteVropsTimeSeriesImport(id);
            else void handleDeleteSnapshot(id);
          }}
          aria-label={uploadDeleteLabel(row.original.kind)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ], [deleting, handleDeleteCdpImport, handleDeleteEramonIfaceImport, handleDeleteEramonL2Import, handleDeleteIpamImport, handleDeleteSnapshot, handleDeleteTechInfoClientImport, handleDeleteTechInfoImport, handleDeleteVropsImport, handleDeleteVropsTimeSeriesImport, importing]);

  const totalRows = uploadRows.reduce((sum, row) => sum + row.rows, 0);
  const totalSheets = uploadRows.reduce((sum, row) => sum + row.sheets, 0);
  const snapshotCount = uploadRows.filter((row) => row.kind === "rvtools").length;
  const additionalImportsCount = uploads.length - snapshotCount;
  // `uploads` ist bereits absteigend nach `importedAt` sortiert (siehe buildStoredUploads).
  const latestUpload = uploads[0] ?? null;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        setSearchParams(value === "diagnostics" ? { tab: "diagnostics" } : {});
      }}
      className="space-y-4 animate-fade-in"
    >
      <PageHeader
        title="Uploads"
        meta={(
          <div className="flex max-w-full flex-wrap items-center justify-end gap-1">
          <Dialog open={deleteSystemOpen} onOpenChange={(open) => dispatch({ type: "set-delete-system-open", value: open })}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={deleting || importing}>
                <Trash2 className="mr-1 h-4 w-4" />Systemdaten löschen
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Alle Systemdaten löschen?</DialogTitle>
                <DialogDescription>Dies löscht alle importierten Snapshots und Analysedaten (RVTools, Tech-Info, Netzwerk, vROps etc.) unwiderruflich aus deinem Browser. Daten, die im Backup-Export enthalten sind (Wartungseinstellungen, Szenarien, vCenter-Gruppen), bleiben erhalten.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => dispatch({ type: "set-delete-system-open", value: false })}>Abbrechen</Button>
                <Button variant="destructive" onClick={handleDeleteSystemData}>Endgültig löschen</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={deleteUserOpen} onOpenChange={(open) => dispatch({ type: "set-delete-user-open", value: open })}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={deleting || importing}>
                <Trash2 className="mr-1 h-4 w-4" />Userdaten löschen
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Alle Userdaten löschen?</DialogTitle>
                <DialogDescription>Dies löscht unwiderruflich genau die Daten, die auch der Backup-Export sichert: Wartungseinstellungen, Cluster-Zuordnungen, Wartungsfenster, Szenarien, vCenter-Gruppen und VM-Scope-Einstellungen. Importierte Snapshots und Analysedaten bleiben erhalten.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => dispatch({ type: "set-delete-user-open", value: false })}>Abbrechen</Button>
                <Button variant="destructive" onClick={handleDeleteUserData}>Endgültig löschen</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        )}
      >
        <div className="w-full overflow-x-auto pb-1">
          <TabsList aria-label="Bereich der Uploads" className="min-w-max">
            <TabsTrigger value="uploads">Uploads</TabsTrigger>
            <TabsTrigger value="diagnostics">Diagnose</TabsTrigger>
          </TabsList>
        </div>
      </PageHeader>

      {activeTab === "uploads" && (
        <section aria-label="Upload-Kennzahlen">
          <KpiGrid>
            <KpiCard title="Gespeichert" value={uploads.length.toLocaleString("de-DE")} subtitle="Importe in IndexedDB" icon={<Database aria-hidden="true" className="h-4 w-4" />} severity={uploads.length > 0 ? "ok" : undefined} />
            <KpiCard title="RVTools-Snapshots" value={snapshotCount.toLocaleString("de-DE")} subtitle="vCenter-Exporte" icon={<FileCheck2 aria-hidden="true" className="h-4 w-4" />} severity={snapshotCount > 0 ? "ok" : undefined} />
            <KpiCard title="Zusatzimporte" value={additionalImportsCount.toLocaleString("de-DE")} subtitle="Tech-Info, Netzwerk, vROps" icon={<PackagePlus aria-hidden="true" className="h-4 w-4" />} />
            <KpiCard title="Datenzeilen" value={totalRows.toLocaleString("de-DE")} subtitle={`${totalSheets.toLocaleString("de-DE")} Sheets erfasst`} icon={<Layers3 aria-hidden="true" className="h-4 w-4" />} />
            <KpiCard title="Speicherbedarf" value={totalSizeBytes === null ? "—" : formatBytes(totalSizeBytes)} subtitle="geschätzt in IndexedDB" icon={<HardDrive aria-hidden="true" className="h-4 w-4" />} />
            <KpiCard title="Letzter Import" value={latestUpload ? formatIsoDateTime(latestUpload.importedAt) : "—"} subtitle={latestUpload ? fileKindLabel(latestUpload.kind) : undefined} icon={<Clock aria-hidden="true" className="h-4 w-4" />} />
          </KpiGrid>
        </section>
      )}

      <TabsContent value="uploads" className="space-y-6">
        <label
        htmlFor={fileInputId}
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 shadow-sm transition-[border-color,background-color,box-shadow] ${dragOver ? "border-primary bg-primary/5 shadow-md" : "border-border/60 bg-card/30 hover:border-primary/40 hover:shadow-md"}`}
        onDragOver={(e) => { e.preventDefault(); dispatch({ type: "set-drag-over", value: true }); }}
        onDragLeave={() => dispatch({ type: "set-drag-over", value: false })}
        onDrop={handleDrop}
      >
        <input id={fileInputId} ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.txt,.json,.zip,text/plain,application/json,application/zip,application/x-zip-compressed" multiple disabled={importing} className="hidden" aria-label="RVTools-, Tech-Info-, Netzwerk-, vROps-, Wartungsfenster-, Modus- oder Backup-Datei auswählen" onChange={(e) => e.target.files && void importFiles(e.target.files)} />
        {importing ? <Loader2 className="h-10 w-10 animate-spin text-primary" /> : <Upload className="h-10 w-10 text-muted-foreground" />}
        <p className="mt-3 text-sm font-medium">{importing ? "Import läuft..." : "RVTools / Tech-Info (XLSX), Netzwerk/vROps (CSV), Wartungsfenster (TXT), Modus- oder Backup-Datei (JSON) oder ZIP-Archiv hierher ziehen oder klicken"}</p>
        <p className="mt-1 text-xs text-muted-foreground">ZIP-Archive werden automatisch entpackt. Eine einzelne <code>modus.json</code> wechselt den App-Modus; beim SysV-Modus öffnet sich danach die Auswahl des Systemkontexts. Zeitreihen-CSVs öffnen automatisch den Dateisatz-Import und werden immer zuletzt importiert; ein neuer RVTools-Export ersetzt den bisherigen Export desselben vCenters. Backup-Dateien übernehmen lokale Einstellungen, Wartungsfenster, Szenarien und vCenter-Gruppen.</p>
        </label>

      {/* Progress bar during deletion */}
      {deleting && deleteProgress && (
        <Card className="animate-fade-in border-destructive/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-destructive">{deleteProgress.step}</span>
              <span className="text-muted-foreground tabular-nums">{deleteProgress.percent}%</span>
            </div>
            <Progress value={deleteProgress.percent} className="h-2" />
            {deleteProgress.detail && (
              <p className="text-xs text-muted-foreground">{deleteProgress.detail}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Progress bar during import */}
      {importing && progress && (
        <Card className="animate-fade-in border-primary/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-primary">{progress.step}</span>
              <span className="text-muted-foreground tabular-nums">{progress.percent}%</span>
            </div>
            <Progress value={progress.percent} className="h-2" />
            {progress.detail && (
              <p className="text-xs text-muted-foreground">{progress.detail}</p>
            )}
          </CardContent>
        </Card>
      )}

      {lastResult && !importing && (
        <Card className="animate-fade-in">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              {lastResult.success ? <CheckCircle2 className="h-5 w-5 text-success" /> : <AlertCircle className="h-5 w-5 text-destructive" />}
              <span className="font-semibold text-sm">{lastResult.success ? "Import erfolgreich" : "Import fehlgeschlagen"}</span>
              {lastResult.fileKind && <span className="text-xs text-muted-foreground">({fileKindLabel(lastResult.fileKind)})</span>}
            </div>
            {lastResult.sheetStats && Object.keys(lastResult.sheetStats).length > 0 && (
              <p className="text-xs text-muted-foreground mb-2">
                {Object.keys(lastResult.sheetStats).length} {Object.keys(lastResult.sheetStats).length === 1 ? "Sheet" : "Sheets"} erkannt, {Object.values(lastResult.sheetStats).reduce((s, v) => s + v.rowCount, 0).toLocaleString("de-DE")} {Object.values(lastResult.sheetStats).reduce((s, v) => s + v.rowCount, 0) === 1 ? "Zeile" : "Zeilen"}
              </p>
            )}
            {lastResult.warnings.length > 0 && (
              <div className="mt-2 space-y-1">
                {lastResult.warnings.slice(0, 10).map((warning) => (
                  <div key={warning} className="flex items-start gap-1.5 text-xs text-warning"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /><span>{warning}</span></div>
                ))}
                {lastResult.warnings.length > 10 && <p className="text-xs text-muted-foreground">...und {lastResult.warnings.length - 10} weitere Warnungen</p>}
              </div>
            )}
            {lastResult.errors.length > 0 && (
              <div className="mt-2 space-y-1">
                {lastResult.errors.map((error) => (
                  <div key={error} className="flex items-start gap-1.5 text-xs text-destructive"><AlertCircle className="h-3 w-3 mt-0.5 shrink-0" /><span>{error}</span></div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="stored-uploads-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="stored-uploads-heading" className="text-lg font-semibold tracking-tight">Gespeicherte Uploads</h2>
            <p className="text-sm text-muted-foreground">Alle lokal gespeicherten Importdateien mit ihren Importmetriken.</p>
          </div>
          {totalSizeBytes !== null && uploads.length > 0 && <span className="text-xs text-muted-foreground tabular-nums">≈ {formatBytes(totalSizeBytes)} IndexedDB</span>}
        </div>
        {uploads.length === 0 ? (
          <Card><CardContent className="py-10 text-center"><FileSpreadsheet className="mx-auto h-8 w-8 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">Noch keine Uploads gespeichert</p><p className="mt-1 text-sm text-muted-foreground">Ziehe oben eine Datei hierher, um den ersten Import zu starten.</p></CardContent></Card>
        ) : (
          <VirtualTable tableId="imports/upload-inventory" columnPicker data={uploadRows} columns={uploadColumns} height={560} getRowId={(row) => `${row.kind}:${row.id}`} exportFileName="rvtools-uploads" emptyTitle="Keine Uploads" />
        )}
      </section>
      </TabsContent>

      <TabsContent value="diagnostics">
        <DiagnosticsPanel />
      </TabsContent>
    </Tabs>
  );
}

export default function UploadSnapshots() {
  return useUploadSnapshotsView();
}
