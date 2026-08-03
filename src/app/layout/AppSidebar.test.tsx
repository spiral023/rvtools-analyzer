import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppSidebar } from "@/app/layout/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

const { importFiles, useOptionalImportControllerMock, useOptionalAppModeMock, useRestrictedDatasetMock } = vi.hoisted(() => ({
  importFiles: vi.fn(),
  useOptionalImportControllerMock: vi.fn(),
  useOptionalAppModeMock: vi.fn(),
  useRestrictedDatasetMock: vi.fn(),
}));

vi.mock("@/hooks/useImportController", () => ({
  useOptionalImportController: useOptionalImportControllerMock,
}));

vi.mock("@/hooks/useAppMode", () => ({
  useOptionalAppMode: useOptionalAppModeMock,
}));

vi.mock("@/hooks/useRestrictedDataset", () => ({
  useRestrictedDataset: useRestrictedDatasetMock,
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
    useOptionalAppModeMock.mockReset();
    useOptionalAppModeMock.mockReturnValue(null);
    useRestrictedDatasetMock.mockReset();
    useRestrictedDatasetMock.mockReturnValue({ isRestricted: false, sources: [], isPending: false });
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

  it("gliedert die Navigation in Hierarchie, Analyse und Tools", () => {
    useOptionalImportControllerMock.mockReturnValue(null);
    renderSidebar();

    expect(screen.getByText("Infrastruktur")).toBeInTheDocument();
    expect(screen.getByText("Analyse")).toBeInTheDocument();
    expect(screen.getByText("Tools")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Übersicht" })).toHaveAttribute("href", "/overview");
    expect(screen.queryByRole("link", { name: "Kapazität" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Netzwerk-Kontrolle" })).toHaveAttribute("href", "/network-audit");
    expect(screen.getByRole("link", { name: "Wartung" })).toHaveAttribute("href", "/wartungsankuendigung");
    expect(screen.getByRole("link", { name: "Planung" })).toHaveAttribute("href", "/planning");
  });

  it("blendet im SysV-Modus die umgebungsweiten Bereiche aus", () => {
    useOptionalImportControllerMock.mockReturnValue(null);
    useOptionalAppModeMock.mockReturnValue({ mode: "sysv", isHydrated: true });
    renderSidebar();

    for (const name of ["vCenter", "Cluster", "Netzwerk-Kontrolle", "Wartung", "Hardware", "Planung", "Wartungsfenster"]) {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    }
  });

  it("behält im SysV-Modus die auf eigene Systeme bezogenen Bereiche", () => {
    useOptionalImportControllerMock.mockReturnValue(null);
    useOptionalAppModeMock.mockReturnValue({ mode: "sysv", isHydrated: true });
    renderSidebar();

    for (const name of ["Übersicht", "Uploads", "Hosts", "VMs", "Storage / Backup", "Netzwerk", "Tech-Info", "Export & Berichte"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("blendet Hosts im eingeschränkten SysV-Datensatz aus", () => {
    useOptionalImportControllerMock.mockReturnValue(null);
    useRestrictedDatasetMock.mockReturnValue({ isRestricted: true, sources: [], isPending: false });
    renderSidebar();

    expect(screen.queryByRole("link", { name: "Hosts" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "VMs" })).toBeInTheDocument();
  });

  it("behält Hosts im SysV-Modus auf einem vollständigen Datenbestand", () => {
    useOptionalImportControllerMock.mockReturnValue(null);
    useOptionalAppModeMock.mockReturnValue({ mode: "sysv", isHydrated: true });
    useRestrictedDatasetMock.mockReturnValue({ isRestricted: false, sources: [], isPending: false });
    renderSidebar();

    expect(screen.getByRole("link", { name: "Hosts" })).toHaveAttribute("href", "/hosts");
  });

  it("hält Hosts bis zum Abschluss der Snapshot-Abfrage sichtbar", () => {
    useOptionalImportControllerMock.mockReturnValue(null);
    useRestrictedDatasetMock.mockReturnValue({ isRestricted: false, sources: [], isPending: true });
    renderSidebar();

    expect(screen.getByRole("link", { name: "Hosts" })).toBeInTheDocument();
  });

  it("hält modusabhängige Einträge bis zum Abschluss der Hydrierung zurück", () => {
    useOptionalImportControllerMock.mockReturnValue(null);
    useOptionalAppModeMock.mockReturnValue({ mode: "vm-admin", isHydrated: false });
    renderSidebar();

    expect(screen.queryByRole("link", { name: "Netzwerk-Kontrolle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Wartung" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Hardware" })).not.toBeInTheDocument();
  });

  it("zeigt Details verwandter Tools in einer festen Fläche statt als überlagernden Tooltip", () => {
    useOptionalImportControllerMock.mockReturnValue(null);
    renderSidebar();

    expect(screen.queryByText("Tool auswählen")).not.toBeInTheDocument();

    const markdownEditorLink = screen.getByRole("link", { name: "Markdown Editor" });
    fireEvent.mouseEnter(markdownEditorLink);

    expect(screen.getByText("Einfacher Markdown-Editor mit verschiedenen Exportformaten")).toBeInTheDocument();

    fireEvent.mouseLeave(markdownEditorLink);

    expect(screen.queryByText("Einfacher Markdown-Editor mit verschiedenen Exportformaten")).not.toBeInTheDocument();
  });

  it("zeigt die verwandten Tools ohne Überschrift und Trennlinie", () => {
    useOptionalImportControllerMock.mockReturnValue(null);
    renderSidebar();

    expect(screen.queryByText("Weitere Tools")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Markdown Editor" }).closest('[data-sidebar="footer"]')).not.toHaveClass("border-t");
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

    const overviewLink = screen.getByRole("link", { name: "Übersicht" });
    const file = new File(["a"], "a.xlsx");

    fireEvent.drop(overviewLink, { dataTransfer: { files: [file] } });

    expect(importFiles).not.toHaveBeenCalled();
  });
});
