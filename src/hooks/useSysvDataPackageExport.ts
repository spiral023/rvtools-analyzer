import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SysvDataPackageScope } from "@/domain/models/types";
import {
  buildSysvDataPackage,
  buildSysvDataPackageFileName,
  buildSysvDataPackagePreview,
  type BuiltSysvDataPackage,
  type SysvDataPackagePreview,
  type SysvDataPackageProgress,
} from "@/domain/services/sysvDataPackageService";
import { zipSysvDataPackage } from "@/lib/export/sysvDataPackageFormat";
import { downloadBlobFile } from "@/lib/export/tableExport";
import { sysvDataPackageScopeKey } from "@/lib/sysvDataPackageScope";
import {
  buildSysvDataPackageBatch,
  buildSysvDataPackageBatchFileName,
  buildSysvDataPackageBatchPreview,
  type SysvBatchExportRequest,
  type SysvBatchPreviewResult,
  type SysvBatchProgress,
} from "@/domain/services/sysvBatchExportService";
import type { SysvBatchReport } from "@/domain/models/types";

export interface UseSysvDataPackageExportOptions {
  includeVropsTimeSeries?: boolean;
}

export interface UseSysvDataPackageExportResult {
  preview: SysvDataPackagePreview | undefined;
  previewLoading: boolean;
  previewError: Error | null;
  exporting: boolean;
  progress: SysvDataPackageProgress | null;
  exportPackage: () => Promise<BuiltSysvDataPackage | null>;
}

export interface UseSysvDataPackageBatchExportResult {
  preview: SysvBatchPreviewResult | undefined;
  previewLoading: boolean;
  previewError: Error | null;
  exporting: boolean;
  progress: SysvBatchProgress | null;
  exportBatch: () => Promise<{ zipBytes: Uint8Array<ArrayBuffer>; report: SysvBatchReport } | null>;
  cancelExport: () => void;
}

const EMPTY_PROGRESS: SysvDataPackageProgress = { step: "Scope auflösen", percent: 0 };

export function useSysvDataPackageExport(
  scope: SysvDataPackageScope | null,
  options: UseSysvDataPackageExportOptions = {},
): UseSysvDataPackageExportResult {
  const includeVropsTimeSeries = options.includeVropsTimeSeries !== false;
  const scopeKey = scope ? sysvDataPackageScopeKey(scope) : "none";
  const previewQuery = useQuery({
    queryKey: ["sysvDataPackagePreview", scopeKey, includeVropsTimeSeries],
    queryFn: () => buildSysvDataPackagePreview(scope!, { includeVropsTimeSeries }),
    enabled: scope !== null,
    staleTime: 0,
    retry: false,
  });
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<SysvDataPackageProgress | null>(null);

  const exportPackage = useCallback(async (): Promise<BuiltSysvDataPackage | null> => {
    if (!scope) return null;
    if (exporting) return null;
    setExporting(true);
    setProgress(EMPTY_PROGRESS);
    try {
      const built = await buildSysvDataPackage(scope, {
        includeVropsTimeSeries,
        onProgress: setProgress,
      });
      setProgress({ step: "ZIP komprimieren", percent: 94 });
      const zipBytes = await zipSysvDataPackage(built.files, (percent) => {
        setProgress({ step: "ZIP komprimieren", percent: 94 + Math.round(percent * 0.05) });
      });
      setProgress({ step: "Download vorbereiten", percent: 100 });
      downloadBlobFile(zipBytes, buildSysvDataPackageFileName(scope), "application/zip");
      toast.success(`SysV-Datenpaket „${scope.displayName}“ wurde erzeugt (${built.manifest.counts.vms.toLocaleString("de-DE")} VMs).`);
      return built;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "SysV-Datenpaket konnte nicht erzeugt werden.");
      return null;
    } finally {
      setExporting(false);
    }
  }, [exporting, includeVropsTimeSeries, scope]);

  return useMemo(() => ({
    preview: previewQuery.data,
    previewLoading: previewQuery.isLoading,
    previewError: previewQuery.error instanceof Error ? previewQuery.error : null,
    exporting,
    progress,
    exportPackage,
  }), [exportPackage, exporting, previewQuery.data, previewQuery.error, previewQuery.isLoading, progress]);
}

export function useSysvDataPackageBatchExport(
  request: SysvBatchExportRequest | null,
): UseSysvDataPackageBatchExportResult {
  const requestKey = request
    ? `${request.level}:${request.root ? sysvDataPackageScopeKey(request.root) : "all"}:${request.includeVropsTimeSeries}`
    : "none";
  const previewQuery = useQuery({
    queryKey: ["sysvDataPackageBatchPreview", requestKey],
    queryFn: () => buildSysvDataPackageBatchPreview(request!),
    enabled: request !== null,
    staleTime: 0,
    retry: false,
  });
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<SysvBatchProgress | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const exportBatch = useCallback(async () => {
    if (!request || exporting) return null;
    const controller = new AbortController();
    controllerRef.current = controller;
    setExporting(true);
    setProgress({ step: "Datenbasis laden", percent: 0 });
    try {
      const result = await buildSysvDataPackageBatch(request, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      setProgress({ step: "Download vorbereiten", percent: 100 });
      downloadBlobFile(result.zipBytes, buildSysvDataPackageBatchFileName(request), "application/zip");
      toast.success(`SysV-Batch-Container wurde erzeugt (${result.report.entries.length.toLocaleString("de-DE")} Blattpakete).`);
      return result;
    } catch (error) {
      if (controller.signal.aborted) {
        toast.info("SysV-Batch-Export wurde abgebrochen.");
      } else {
        toast.error(error instanceof Error ? error.message : "SysV-Batch-Container konnte nicht erzeugt werden.");
      }
      return null;
    } finally {
      controllerRef.current = null;
      setExporting(false);
    }
  }, [exporting, request]);

  const cancelExport = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  return useMemo(() => ({
    preview: previewQuery.data,
    previewLoading: previewQuery.isLoading,
    previewError: previewQuery.error instanceof Error ? previewQuery.error : null,
    exporting,
    progress,
    exportBatch,
    cancelExport,
  }), [cancelExport, exportBatch, exporting, previewQuery.data, previewQuery.error, previewQuery.isLoading, progress]);
}
