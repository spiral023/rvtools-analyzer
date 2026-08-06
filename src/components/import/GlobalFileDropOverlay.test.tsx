import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalFileDropOverlay } from "@/components/import/GlobalFileDropOverlay";
import { DRAG_IDLE_TIMEOUT_MS } from "@/lib/fileDrag";

const {
  importFiles,
  navigateMock,
  useOptionalImportControllerMock,
} = vi.hoisted(() => ({
  importFiles: vi.fn(),
  navigateMock: vi.fn(),
  useOptionalImportControllerMock: vi.fn(),
}));

vi.mock("@/hooks/useImportController", () => ({
  useOptionalImportController: useOptionalImportControllerMock,
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => navigateMock,
}));

const FILE_DRAG = { types: ["Files"] };
const INTERNAL_DRAG = { types: ["text/plain"] };

function renderOverlay(pathname = "/hardware") {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <GlobalFileDropOverlay />
    </MemoryRouter>,
  );
}

/** Simuliert eine lokale Dropzone, die das Ereignis vor dem window-Listener behandelt. */
function appendLocalDropzone(): HTMLElement {
  const zone = document.createElement("div");
  zone.addEventListener("dragover", (event) => event.preventDefault());
  zone.addEventListener("drop", (event) => event.preventDefault());
  document.body.appendChild(zone);
  return zone;
}

function queryOverlay(): HTMLElement | null {
  return screen.queryByText("Dateien hier ablegen zum Importieren");
}

describe("GlobalFileDropOverlay", () => {
  beforeEach(() => {
    importFiles.mockClear();
    navigateMock.mockClear();
    useOptionalImportControllerMock.mockReset();
    useOptionalImportControllerMock.mockReturnValue({ importing: false, importFiles });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("zeigt das Overlay, sobald Dateien über dem Fenster liegen", () => {
    renderOverlay();

    fireEvent.dragOver(window, { dataTransfer: FILE_DRAG });

    expect(queryOverlay()).toBeInTheDocument();
  });

  it("ignoriert anwendungsinterne Drags ohne Dateien", () => {
    renderOverlay();

    fireEvent.dragOver(window, { dataTransfer: INTERNAL_DRAG });

    expect(queryOverlay()).not.toBeInTheDocument();
  });

  it("verhindert den Browser-Standard, damit ein Fehl-Drop die Session nicht verlässt", () => {
    renderOverlay();

    const dragOver = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(dragOver, "dataTransfer", { value: FILE_DRAG });
    act(() => {
      window.dispatchEvent(dragOver);
    });

    expect(dragOver.defaultPrevented).toBe(true);
  });

  it("verhindert den Browser-Standard auch ohne verfügbaren Import-Controller", () => {
    useOptionalImportControllerMock.mockReturnValue(null);
    renderOverlay();

    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: { ...FILE_DRAG, files: [] } });
    act(() => {
      window.dispatchEvent(drop);
    });

    expect(drop.defaultPrevented).toBe(true);
    expect(queryOverlay()).not.toBeInTheDocument();
  });

  it("übergibt gedroppte Dateien an den Import-Controller und wechselt auf die Upload-Seite", () => {
    renderOverlay();
    const file = new File(["a"], "paket.zip");

    fireEvent.drop(window, { dataTransfer: { ...FILE_DRAG, files: [file] } });

    expect(importFiles).toHaveBeenCalledTimes(1);
    expect(Array.from(importFiles.mock.calls[0][0] as FileList)).toEqual([file]);
    expect(navigateMock).toHaveBeenCalledWith("/upload");
  });

  it("navigiert nicht, wenn die Upload-Seite bereits offen ist", () => {
    renderOverlay("/upload");
    const file = new File(["a"], "a.xlsx");

    fireEvent.drop(window, { dataTransfer: { ...FILE_DRAG, files: [file] } });

    expect(importFiles).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("startet keinen zweiten Import, wenn eine lokale Dropzone den Drop behandelt hat", () => {
    renderOverlay();
    const zone = appendLocalDropzone();
    const file = new File(["a"], "a.xlsx");

    fireEvent.drop(zone, { dataTransfer: { ...FILE_DRAG, files: [file] } });

    expect(importFiles).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("bleibt verborgen, solange der Drag über einer lokalen Dropzone liegt", () => {
    renderOverlay();
    const zone = appendLocalDropzone();

    fireEvent.dragOver(zone, { dataTransfer: FILE_DRAG });

    expect(queryOverlay()).not.toBeInTheDocument();
  });

  it("blendet das Overlay aus, wenn der Drag das Fenster verlässt", () => {
    renderOverlay();
    fireEvent.dragOver(window, { dataTransfer: FILE_DRAG });

    fireEvent.dragLeave(window, { dataTransfer: FILE_DRAG, relatedTarget: null });

    expect(queryOverlay()).not.toBeInTheDocument();
  });

  it("blendet das Overlay aus, wenn keine dragover-Ereignisse mehr eintreffen", () => {
    vi.useFakeTimers();
    renderOverlay();
    fireEvent.dragOver(window, { dataTransfer: FILE_DRAG });
    expect(queryOverlay()).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(DRAG_IDLE_TIMEOUT_MS);
    });

    expect(queryOverlay()).not.toBeInTheDocument();
  });

  it("weist während eines laufenden Imports auf den Import hin", () => {
    useOptionalImportControllerMock.mockReturnValue({ importing: true, importFiles });
    renderOverlay();

    fireEvent.dragOver(window, { dataTransfer: FILE_DRAG });

    expect(screen.getByText("Import läuft – bitte warten")).toBeInTheDocument();
    expect(queryOverlay()).not.toBeInTheDocument();
  });
});
