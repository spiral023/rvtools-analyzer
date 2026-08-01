import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { strToU8, zipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { importMaintenanceWindowsTxt, importRvtoolsXlsx } from "@/domain/services/importService";
import { importVropsTimeSeriesFileSet } from "@/domain/services/vropsTimeSeriesImportService";
import { importUserDataBackupFile } from "@/domain/services/backupService";
import { ImportProvider, useImportController } from "@/hooks/useImportController";

vi.mock("@/domain/services/importService", () => ({ importRvtoolsXlsx: vi.fn(), importMaintenanceWindowsTxt: vi.fn() }));
vi.mock("@/domain/services/vropsTimeSeriesImportService", () => ({ importVropsTimeSeriesFileSet: vi.fn() }));
vi.mock("@/domain/services/backupService", () => ({ importUserDataBackupFile: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const mockedImport = vi.mocked(importRvtoolsXlsx);
const mockedMaintenanceImport = vi.mocked(importMaintenanceWindowsTxt);
const mockedVropsTimeSeriesImport = vi.mocked(importVropsTimeSeriesFileSet);
const mockedUserDataBackupImport = vi.mocked(importUserDataBackupFile);

/** jsdom's File-Polyfill kennt kein `arrayBuffer()` (anders als jeder echte Browser) – hier nachgerüstet, analog zu src/test/importService.test.ts. */
function zipFileFrom(entries: Parameters<typeof zipSync>[0]): File {
  const buffer = zipSync(entries);
  const file = new File([buffer], "bundle.zip") as File & { arrayBuffer: () => Promise<ArrayBuffer> };
  file.arrayBuffer = async () => buffer.slice().buffer as ArrayBuffer;
  return file;
}

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ImportProvider>{children}</ImportProvider>
      </QueryClientProvider>
    );
  };
}

describe("ImportProvider", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ignoriert nicht unterstützte Dateien und meldet sie als abgelehnt", async () => {
    const { result } = renderHook(() => useImportController(), { wrapper: createWrapper() });

    await act(() => result.current.importFiles([
      new File(["x"], "notes.pdf", { type: "application/pdf" }),
    ]));

    expect(mockedImport).not.toHaveBeenCalled();
    expect(result.current.rejectedFileNames).toEqual(["notes.pdf"]);
  });

  it("importiert Excel-Dateien sequenziell und behält alle Resultate", async () => {
    const callOrder: string[] = [];
    mockedImport
      .mockImplementationOnce(async (file, onProgress) => {
        callOrder.push(`start:${file.name}`);
        onProgress?.({ step: "Parsing", percent: 50, detail: file.name });
        callOrder.push(`end:${file.name}`);
        return { success: true, fileKind: "rvtools", warnings: [], errors: [] };
      })
      .mockImplementationOnce(async (file) => {
        callOrder.push(`start:${file.name}`);
        callOrder.push(`end:${file.name}`);
        return {
          success: true,
          fileKind: "tech-info",
          warnings: ["Spalte fehlt"],
          errors: [],
        };
      });
    const files = [new File(["1"], "one.xlsx"), new File(["2"], "two.xls")];
    const { result } = renderHook(() => useImportController(), { wrapper: createWrapper() });

    await act(() => result.current.importFiles(files));

    expect(callOrder).toEqual([
      "start:one.xlsx",
      "end:one.xlsx",
      "start:two.xls",
      "end:two.xls",
    ]);
    expect(result.current.items.map((item) => item.status)).toEqual(["success", "warning"]);
    expect(result.current.importing).toBe(false);
  });

  it("leitet Textdateien an den Wartungsfenster-Import weiter", async () => {
    mockedMaintenanceImport.mockResolvedValue({ success: true, fileKind: "maintenance-windows", warnings: [], errors: [] });
    const { result } = renderHook(() => useImportController(), { wrapper: createWrapper() });

    await act(() => result.current.importFiles([
      new File(["Wartungsfenster"], "SRV Wartungsfenster Tech-Info Server.txt", { type: "text/plain" }),
    ]));

    expect(mockedMaintenanceImport).toHaveBeenCalledTimes(1);
    expect(mockedImport).not.toHaveBeenCalled();
    expect(result.current.items[0]).toMatchObject({ status: "success", fileKind: "maintenance-windows" });
  });

  it("importiert einen Backup-Export über den normalen Upload", async () => {
    mockedUserDataBackupImport.mockResolvedValue({
      settingsImported: true,
      assignmentsImported: 1,
      maintenanceWindowsImported: 2,
      scenariosImported: 3,
      vcenterGroupsImported: 4,
      vmScopeSettingsImported: true,
    });
    const backup = new File(["{}"], "rvtools-analyzer-backup-2026-08-01.json", { type: "application/json" });
    const { result } = renderHook(() => useImportController(), { wrapper: createWrapper() });

    await act(() => result.current.importFiles([backup]));

    expect(mockedUserDataBackupImport).toHaveBeenCalledWith(backup);
    expect(mockedImport).not.toHaveBeenCalled();
    expect(result.current.items[0]).toMatchObject({ status: "success", fileKind: "user-data-backup" });
  });

  it("entpackt hochgeladene ZIP-Archive und importiert die enthaltenen Dateien", async () => {
    mockedImport.mockResolvedValue({ success: true, fileKind: "rvtools", warnings: [], errors: [] });
    const zipFile = zipFileFrom({
      "export/one.xlsx": strToU8("data"),
      "export/__MACOSX/._one.xlsx": strToU8("junk"),
      "export/.DS_Store": strToU8("junk"),
    });
    const { result } = renderHook(() => useImportController(), { wrapper: createWrapper() });

    await act(() => result.current.importFiles([zipFile]));

    expect(mockedImport).toHaveBeenCalledTimes(1);
    expect(mockedImport.mock.calls[0][0].name).toBe("one.xlsx");
    expect(result.current.items[0]).toMatchObject({ fileName: "one.xlsx", status: "success" });
  });

  it("importiert erkannte RVTools-Exporte vor anderen Dateien, unabhängig von der Upload-Reihenfolge", async () => {
    const callOrder: string[] = [];
    mockedImport.mockImplementation(async (file) => {
      callOrder.push(file.name);
      return { success: true, fileKind: "rvtools", warnings: [], errors: [] };
    });
    const files = [
      new File(["a"], "tech-info.xlsx"),
      new File(["b"], "RVTools_export_all_2026_01_01_00_00_test-vcenter.xlsx"),
    ];
    const { result } = renderHook(() => useImportController(), { wrapper: createWrapper() });

    await act(() => result.current.importFiles(files));

    expect(callOrder).toEqual([
      "RVTools_export_all_2026_01_01_00_00_test-vcenter.xlsx",
      "tech-info.xlsx",
    ]);
  });

  it("importiert vROps-Zeitreihen-Dateisätze immer nach den übrigen Dateien", async () => {
    const callOrder: string[] = [];
    mockedImport.mockImplementation(async (file) => {
      callOrder.push(file.name);
      return { success: true, fileKind: "rvtools", warnings: [], errors: [] };
    });
    mockedVropsTimeSeriesImport.mockImplementation(async () => {
      callOrder.push("vrops-timeseries");
      return { success: true, warnings: [], errors: [] };
    });
    const files = [
      new File(["1"], "vm-metrics.csv", { type: "text/csv" }),
      new File(["2"], "cluster-metrics.csv", { type: "text/csv" }),
      new File(["3"], "host-metrics.csv", { type: "text/csv" }),
      new File(["4"], "RVTools_export_all_2026_01_01_00_00_test-vcenter.xlsx"),
    ];
    const { result } = renderHook(() => useImportController(), { wrapper: createWrapper() });

    await act(() => result.current.importFiles(files));

    expect(callOrder).toEqual(["RVTools_export_all_2026_01_01_00_00_test-vcenter.xlsx", "vrops-timeseries"]);
  });
});
