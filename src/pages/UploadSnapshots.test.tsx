import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UploadSnapshots from "@/pages/UploadSnapshots";

const { importFiles } = vi.hoisted(() => ({
  importFiles: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/hooks/useImportController", () => ({
  useImportController: () => ({
    importing: false,
    items: [] as import("@/hooks/useImportController").ImportQueueItem[],
    rejectedFileNames: [] as string[],
    importFiles,
    clearImportState: vi.fn(),
  }),
  fileKindLabel: () => "RVTools",
}));

vi.mock("@/domain/services/importService", () => ({
  importRvtoolsXlsx: vi.fn().mockResolvedValue({
    success: true,
    fileKind: "rvtools",
    warnings: [],
    errors: [],
  }),
}));

describe("UploadSnapshots", () => {
  beforeEach(() => importFiles.mockClear());

  it("übergibt mehrere ausgewählte Dateien an den gemeinsamen Controller", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <UploadSnapshots />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const input = screen.getByLabelText(
      /RVTools, Tech-Info oder CDP-Datei/i,
    );
    const files = [new File(["a"], "a.xlsx"), new File(["b"], "b.xlsx")];

    fireEvent.change(input, { target: { files } });

    expect(importFiles).toHaveBeenCalledWith(files);
  });
});
