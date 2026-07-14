import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CdpScriptDialog from "@/components/network/CdpScriptDialog";
import { ThemeProvider } from "@/app/layout/ThemeProvider";
import cdpScriptSource from "@/../scripts/Get-CdpNetworkInfo.ps1?raw";

const { downloadTextFile } = vi.hoisted(() => ({ downloadTextFile: vi.fn() }));

vi.mock("@/lib/export/tableExport", () => ({ downloadTextFile }));

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  downloadTextFile.mockClear();
  writeText.mockClear();
  Object.assign(navigator, { clipboard: { writeText } });
});

function renderDialog() {
  return render(
    <ThemeProvider>
      <CdpScriptDialog open onClose={() => {}} />
    </ThemeProvider>,
  );
}

describe("CdpScriptDialog", () => {
  it("zeigt Titel und Toolbar-Aktionen", () => {
    renderDialog();
    expect(screen.getByRole("heading", { name: /CDP-Abruf-Skript/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kopieren" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Als \.ps1 herunterladen/i })).toBeInTheDocument();
  });

  it("kopiert den vollständigen Skript-Quelltext in die Zwischenablage", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Kopieren" }));
    expect(writeText).toHaveBeenCalledWith(cdpScriptSource);
  });

  it("lädt das Skript als Get-CdpNetworkInfo.ps1 herunter", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /Als \.ps1 herunterladen/i }));
    expect(downloadTextFile).toHaveBeenCalledWith(
      cdpScriptSource,
      "Get-CdpNetworkInfo.ps1",
      "text/plain;charset=utf-8",
    );
  });
});
