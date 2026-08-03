import { useCallback, useMemo, useState } from "react";
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
import { sysvDataPackageScopeKey } from "@/lib/sysvDataPackageScope";

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
      const blob = new Blob([zipBytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = buildSysvDataPackageFileName(scope);
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
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

