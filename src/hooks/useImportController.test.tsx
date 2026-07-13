import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { importRvtoolsXlsx } from "@/domain/services/importService";
import { ImportProvider, useImportController } from "@/hooks/useImportController";

vi.mock("@/domain/services/importService", () => ({ importRvtoolsXlsx: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const mockedImport = vi.mocked(importRvtoolsXlsx);

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

  it("ignoriert Nicht-Excel-Dateien und meldet sie als abgelehnt", async () => {
    const { result } = renderHook(() => useImportController(), { wrapper: createWrapper() });

    await act(() => result.current.importFiles([
      new File(["x"], "notes.txt", { type: "text/plain" }),
    ]));

    expect(mockedImport).not.toHaveBeenCalled();
    expect(result.current.rejectedFileNames).toEqual(["notes.txt"]);
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
});
