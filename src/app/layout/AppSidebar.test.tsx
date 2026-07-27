import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppSidebar } from "@/app/layout/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

const { importFiles, useOptionalImportControllerMock } = vi.hoisted(() => ({
  importFiles: vi.fn(),
  useOptionalImportControllerMock: vi.fn(),
}));

vi.mock("@/hooks/useImportController", () => ({
  useOptionalImportController: useOptionalImportControllerMock,
}));

function renderSidebar() {
  render(
    <MemoryRouter>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("AppSidebar", () => {
  beforeEach(() => {
    importFiles.mockClear();
    useOptionalImportControllerMock.mockReset();
  });

  it("benennt den Upload-Menüpunkt in Uploads um", () => {
    useOptionalImportControllerMock.mockReturnValue(null);
    renderSidebar();

    expect(screen.getByRole("link", { name: "Uploads" })).toBeInTheDocument();
    expect(screen.queryByText("Uploads & Snapshots")).not.toBeInTheDocument();
  });

  it("verlinkt den neuen Hosts-Bereich", () => {
    useOptionalImportControllerMock.mockReturnValue(null);
    renderSidebar();

    expect(screen.getByRole("link", { name: "Hosts" })).toHaveAttribute("href", "/hosts");
  });

  it("verlinkt den neuen VMs-Bereich", () => {
    useOptionalImportControllerMock.mockReturnValue(null);
    renderSidebar();

    expect(screen.getByRole("link", { name: "VMs" })).toHaveAttribute("href", "/vms");
  });

  it("führt die konsolidierten Bereiche statt der entfernten Seiten", () => {
    useOptionalImportControllerMock.mockReturnValue(null);
    renderSidebar();

    expect(screen.queryByRole("link", { name: "VMware Versions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Daily Ops" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Performance" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Compliance / Lifecycle" })).not.toBeInTheDocument();
  });

  it("ordnet Cluster direkt unter vCenter ein", () => {
    useOptionalImportControllerMock.mockReturnValue(null);
    renderSidebar();

    const vcenterLink = screen.getByRole("link", { name: "vCenter" });
    const clusterLink = screen.getByRole("link", { name: "Cluster" });

    expect(vcenterLink.compareDocumentPosition(clusterLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("übergibt per Drag & Drop auf den Uploads-Menüpunkt gedroppte Dateien an den Import-Controller", () => {
    useOptionalImportControllerMock.mockReturnValue({ importing: false, importFiles });
    renderSidebar();

    const uploadsLink = screen.getByRole("link", { name: "Uploads" });
    const file = new File(["a"], "a.xlsx");

    fireEvent.drop(uploadsLink, { dataTransfer: { files: [file] } });

    expect(importFiles).toHaveBeenCalledTimes(1);
    const passedFiles = importFiles.mock.calls[0][0];
    expect(Array.from(passedFiles as FileList)).toEqual([file]);
  });

  it("ignoriert Drops auf anderen Menüpunkten", () => {
    useOptionalImportControllerMock.mockReturnValue({ importing: false, importFiles });
    renderSidebar();

    const overviewLink = screen.getByRole("link", { name: "Overview" });
    const file = new File(["a"], "a.xlsx");

    fireEvent.drop(overviewLink, { dataTransfer: { files: [file] } });

    expect(importFiles).not.toHaveBeenCalled();
  });
});
