# First-Run-Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein vierseitiges, animiertes First-Run-Onboarding mit wiederverwendbarem Mehrfachimport, adaptivem Light-/Dark-Design und manuellem Wiederaufruf im Impressum umsetzen.

**Architecture:** Zwei appweite Context-Provider trennen langlebigen Importzustand und Onboarding-Navigation von der Darstellung. Die bestehende Upload-Seite und die Onboarding-Importseite verwenden denselben Import-Controller; ein großes Radix-Dialogfenster rendert vier fokussierte Seiten und persistiert nur den Erstaufrufstatus in `localStorage`.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, Radix/shadcn Dialog, TanStack Query, Vitest, Testing Library, IndexedDB über `idb`.

---

## Dateistruktur

### Neue Dateien

- `src/hooks/useImportController.tsx`: appweiter Importzustand, Validierung, sequenzielle Mehrfachimporte, Fortschritt, Resultate und Query-Invalidierung.
- `src/hooks/useImportController.test.tsx`: Tests für Dateivalidierung, Reihenfolge, fortbestehenden Zustand und Fehlerbehandlung.
- `src/hooks/useOnboarding.tsx`: Erstaufruf-Persistenz, Öffnen/Schließen, Seitennavigation und Navigationsrichtung.
- `src/hooks/useOnboarding.test.tsx`: Tests für `localStorage`, Überspringen, Abschluss und manuellen Wiederaufruf.
- `src/components/onboarding/OnboardingDialog.tsx`: responsiver Dialograhmen, Navigation, Fokusführung und Seitenwechsel.
- `src/components/onboarding/OnboardingContent.tsx`: statische Seiten Willkommen, Systemfilter und Funktionsübersicht.
- `src/components/onboarding/OnboardingImportPage.tsx`: Dropzone und Dateiauswahl auf Seite 2.
- `src/components/onboarding/OnboardingImportStatus.tsx`: kompakter, barrierefreier Importstatus für Seiten 2 bis 4.
- `src/components/onboarding/OnboardingDialog.test.tsx`: Integrations- und Accessibility-Tests des gesamten Onboardings.

### Geänderte Dateien

- `src/pages/UploadSnapshots.tsx`: lokalen Import-Reducer entfernen und gemeinsamen Import-Controller verwenden; Löschzustand bleibt lokal.
- `src/pages/Impressum.tsx`: Aktion „Onboarding erneut starten“ ergänzen.
- `src/pages/Impressum.test.tsx`: Wiederaufruf-Aktion testen.
- `src/App.tsx`: `ImportProvider`, `OnboardingProvider` und `OnboardingDialog` in die globale Provider-Struktur einhängen.
- `src/index.css`: Onboarding-Seitenwechsel, gestaffelte Einblendung, Hintergrunddetails und Reduced-Motion-Regeln ergänzen.

Das Domain-Modell und `src/data/db/index.ts` bleiben unverändert.

---

### Task 1: Gemeinsamen Import-Controller testgetrieben einführen

**Files:**
- Create: `src/hooks/useImportController.tsx`
- Create: `src/hooks/useImportController.test.tsx`

- [ ] **Step 1: Failing Tests für Validierung, sequenzielle Verarbeitung und langlebigen Fortschritt schreiben**

```tsx
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ImportProvider, useImportController } from "@/hooks/useImportController";
import { importRvtoolsXlsx } from "@/domain/services/importService";

vi.mock("@/domain/services/importService", () => ({ importRvtoolsXlsx: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const mockedImport = vi.mocked(importRvtoolsXlsx);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}><ImportProvider>{children}</ImportProvider></QueryClientProvider>;
}

describe("ImportProvider", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ignoriert Nicht-Excel-Dateien und meldet sie als abgelehnt", async () => {
    const { result } = renderHook(() => useImportController(), { wrapper });
    await act(() => result.current.importFiles([new File(["x"], "notes.txt", { type: "text/plain" })]));
    expect(mockedImport).not.toHaveBeenCalled();
    expect(result.current.rejectedFileNames).toEqual(["notes.txt"]);
  });

  it("importiert Excel-Dateien sequenziell und behält alle Resultate", async () => {
    mockedImport
      .mockImplementationOnce(async (_file, onProgress) => {
        onProgress?.({ step: "Parsing", percent: 50, detail: "one.xlsx" });
        return { success: true, fileKind: "rvtools", warnings: [], errors: [] };
      })
      .mockResolvedValueOnce({ success: true, fileKind: "tech-info", warnings: ["Spalte fehlt"], errors: [] });
    const files = [new File(["1"], "one.xlsx"), new File(["2"], "two.xls")];
    const { result } = renderHook(() => useImportController(), { wrapper });

    await act(() => result.current.importFiles(files));

    expect(mockedImport.mock.calls.map(([file]) => file.name)).toEqual(["one.xlsx", "two.xls"]);
    expect(result.current.items.map((item) => item.status)).toEqual(["success", "warning"]);
    expect(result.current.importing).toBe(false);
  });
});
```

- [ ] **Step 2: Tests ausführen und das erwartete Fehlschlagen bestätigen**

Run: `npm run test -- src/hooks/useImportController.test.tsx`

Expected: FAIL, weil `@/hooks/useImportController` noch nicht existiert.

- [ ] **Step 3: Typisierten Import-Provider implementieren**

```tsx
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { importRvtoolsXlsx, type ImportProgress } from "@/domain/services/importService";
import type { ImportFileKind, ImportResult } from "@/domain/models/types";

export type ImportItemStatus = "queued" | "running" | "success" | "warning" | "error";

export interface ImportQueueItem {
  id: string;
  fileName: string;
  fileKind?: ImportFileKind;
  progress: ImportProgress | null;
  result: ImportResult | null;
  status: ImportItemStatus;
}

interface ImportContextValue {
  importing: boolean;
  items: ImportQueueItem[];
  rejectedFileNames: string[];
  importFiles: (files: FileList | File[]) => Promise<void>;
  clearImportState: () => void;
}

const ImportContext = createContext<ImportContextValue | null>(null);

export function isSpreadsheetFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".xlsx") || name.endsWith(".xls") ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

export function fileKindLabel(kind?: ImportFileKind): string {
  if (kind === "tech-info") return "Tech-Info Server";
  if (kind === "tech-info-client") return "Tech-Info Client";
  return "RVTools";
}

export function ImportProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const runningRef = useRef(false);
  const [items, setItems] = useState<ImportQueueItem[]>([]);
  const [rejectedFileNames, setRejectedFileNames] = useState<string[]>([]);

  const patchItem = useCallback((id: string, patch: Partial<ImportQueueItem>) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }, []);

  const importFiles = useCallback(async (input: FileList | File[]) => {
    if (runningRef.current) {
      toast.warning("Ein Import läuft bereits.");
      return;
    }
    const allFiles = Array.from(input);
    const validFiles = allFiles.filter(isSpreadsheetFile);
    const rejected = allFiles.filter((file) => !isSpreadsheetFile(file)).map((file) => file.name);
    setRejectedFileNames(rejected);
    if (rejected.length > 0) toast.error(`Nicht unterstützte Dateien: ${rejected.join(", ")}`);
    if (validFiles.length === 0) return;

    const queued = validFiles.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      fileName: file.name,
      progress: null,
      result: null,
      status: "queued" as const,
    }));
    setItems(queued);
    runningRef.current = true;
    try {
      for (let index = 0; index < validFiles.length; index += 1) {
        const file = validFiles[index];
        const item = queued[index];
        patchItem(item.id, { status: "running", progress: { step: "Vorbereitung", percent: 0, detail: file.name } });
        try {
          const result = await importRvtoolsXlsx(file, (progress) => patchItem(item.id, { progress }));
          const status: ImportItemStatus = result.success
            ? (result.warnings.length > 0 ? "warning" : "success")
            : "error";
          patchItem(item.id, { result, fileKind: result.fileKind, status });
          if (result.success) toast.success(`„${file.name}“ (${fileKindLabel(result.fileKind)}) erfolgreich importiert.`);
          else toast.error(`Import von „${file.name}“ fehlgeschlagen: ${result.errors.join(", ")}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          patchItem(item.id, {
            status: "error",
            result: { success: false, warnings: [], errors: [message] },
          });
          toast.error(`Import von „${file.name}“ fehlgeschlagen: ${message}`);
        }
      }
      await queryClient.invalidateQueries();
    } finally {
      runningRef.current = false;
      setItems((current) => [...current]);
    }
  }, [patchItem, queryClient]);

  const clearImportState = useCallback(() => {
    if (!runningRef.current) {
      setItems([]);
      setRejectedFileNames([]);
    }
  }, []);

  const value = useMemo(() => ({
    importing: items.some((item) => item.status === "queued" || item.status === "running"),
    items,
    rejectedFileNames,
    importFiles,
    clearImportState,
  }), [clearImportState, importFiles, items, rejectedFileNames]);

  return <ImportContext.Provider value={value}>{children}</ImportContext.Provider>;
}

export function useImportController(): ImportContextValue {
  const context = useContext(ImportContext);
  if (!context) throw new Error("useImportController must be used within an ImportProvider");
  return context;
}
```

- [ ] **Step 4: Tests ausführen und Passing bestätigen**

Run: `npm run test -- src/hooks/useImportController.test.tsx`

Expected: PASS für beide Provider-Tests.

- [ ] **Step 5: Import-Controller committen**

```bash
git add src/hooks/useImportController.tsx src/hooks/useImportController.test.tsx
git commit -m "feat: add shared spreadsheet import controller"
```

---

### Task 2: Upload-Seite auf den gemeinsamen Importzustand umstellen

**Files:**
- Modify: `src/pages/UploadSnapshots.tsx`
- Create: `src/pages/UploadSnapshots.test.tsx`

- [ ] **Step 1: Failing Regressionstest für die bestehende Dropzone schreiben**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import UploadSnapshots from "@/pages/UploadSnapshots";

const importFiles = vi.fn().mockResolvedValue(undefined);
vi.mock("@/hooks/useImportController", () => ({
  useImportController: () => ({ importing: false, items: [], rejectedFileNames: [], importFiles }),
  fileKindLabel: () => "RVTools",
}));
vi.mock("@/data/db", async () => {
  const actual = await vi.importActual<typeof import("@/data/db")>("@/data/db");
  return {
    ...actual,
    getSnapshots: vi.fn().mockResolvedValue([]),
    getTechInfoImports: vi.fn().mockResolvedValue([]),
    getTechInfoClientImports: vi.fn().mockResolvedValue([]),
  };
});

describe("UploadSnapshots", () => {
  it("übergibt mehrere ausgewählte Dateien an den gemeinsamen Controller", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><UploadSnapshots /></MemoryRouter></QueryClientProvider>);
    const input = screen.getByLabelText(/RVTools, Tech-Info Server oder Tech-Info Client/i);
    const files = [new File(["a"], "a.xlsx"), new File(["b"], "b.xlsx")];
    fireEvent.change(input, { target: { files } });
    expect(importFiles).toHaveBeenCalledWith(files);
  });
});
```

- [ ] **Step 2: Test ausführen und den Fehler wegen fehlendem zugänglichem Label beziehungsweise alter Importsteuerung bestätigen**

Run: `npm run test -- src/pages/UploadSnapshots.test.tsx`

Expected: FAIL, bis die Dropzone den gemeinsamen Controller verwendet und eindeutig beschriftet ist.

- [ ] **Step 3: Nur den Importteil von `UploadSnapshots.tsx` refaktorieren**

Im lokalen Reducer bleiben `dragOver`, `deleteAllOpen`, `deleting` und `deleteProgress`. `importing`, `lastResult` und `progress` kommen aus `useImportController()`:

```tsx
const { importing, items, importFiles } = useImportController();
const activeItem = items.find((item) => item.status === "running") ?? items.at(-1) ?? null;
const progress = activeItem?.progress ?? null;
const lastResult = [...items].reverse().find((item) => item.result)?.result ?? null;

const handleFiles = useCallback((files: FileList | File[]) => {
  void importFiles(files);
}, [importFiles]);
```

Das Dateifeld erhält die bestehende sichtbare Dropzone als Label und eine explizite Accessibility-Beschriftung:

```tsx
<input
  id={fileInputId}
  ref={fileInputRef}
  type="file"
  accept=".xlsx,.xls"
  multiple
  disabled={importing}
  className="hidden"
  aria-label="RVTools, Tech-Info Server oder Tech-Info Client Excel-Dateien auswählen"
  onChange={(event) => event.target.files && handleFiles(event.target.files)}
/>
```

Nach Abschluss ist kein lokaler `invalidateAll()`-Aufruf mehr nötig; der Provider invalidiert Query-Daten. Delete-Operationen verwenden `invalidateAll()` weiterhin.

- [ ] **Step 4: Seitentest und vorhandene Importtests ausführen**

Run: `npm run test -- src/pages/UploadSnapshots.test.tsx src/test/importService.test.ts`

Expected: PASS; die bestehende Import-Pipeline bleibt unverändert.

- [ ] **Step 5: Upload-Refactor committen**

```bash
git add src/pages/UploadSnapshots.tsx src/pages/UploadSnapshots.test.tsx
git commit -m "refactor: share import state with upload page"
```

---

### Task 3: Onboarding-Zustand und Erstaufruf-Persistenz implementieren

**Files:**
- Create: `src/hooks/useOnboarding.tsx`
- Create: `src/hooks/useOnboarding.test.tsx`

- [ ] **Step 1: Failing Tests für Erstaufruf, gesehenen Status und Wiederaufruf schreiben**

```tsx
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ONBOARDING_STORAGE_KEY, OnboardingProvider, useOnboarding } from "@/hooks/useOnboarding";

describe("OnboardingProvider", () => {
  beforeEach(() => localStorage.clear());

  it("öffnet beim ersten Aufruf automatisch", () => {
    const { result } = renderHook(() => useOnboarding(), { wrapper: OnboardingProvider });
    expect(result.current.open).toBe(true);
    expect(result.current.page).toBe(0);
  });

  it("öffnet nach Überspringen beim nächsten Mount nicht automatisch", () => {
    const first = renderHook(() => useOnboarding(), { wrapper: OnboardingProvider });
    act(() => first.result.current.dismiss());
    first.unmount();
    const second = renderHook(() => useOnboarding(), { wrapper: OnboardingProvider });
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe("seen");
    expect(second.result.current.open).toBe(false);
  });

  it("startet manuell wieder auf Seite eins, ohne den Seen-Status zu löschen", () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "seen");
    const { result } = renderHook(() => useOnboarding(), { wrapper: OnboardingProvider });
    act(() => result.current.openOnboarding());
    expect(result.current.open).toBe(true);
    expect(result.current.page).toBe(0);
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe("seen");
  });
});
```

- [ ] **Step 2: Test ausführen und den fehlenden Hook bestätigen**

Run: `npm run test -- src/hooks/useOnboarding.test.tsx`

Expected: FAIL mit fehlendem Modul `@/hooks/useOnboarding`.

- [ ] **Step 3: Provider mit begrenztem Seitenindex implementieren**

```tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export const ONBOARDING_STORAGE_KEY = "rvtools-analyzer:onboarding:v1";
export const ONBOARDING_PAGE_COUNT = 4;
export type OnboardingDirection = "forward" | "backward";

interface OnboardingContextValue {
  open: boolean;
  page: number;
  direction: OnboardingDirection;
  openOnboarding: () => void;
  dismiss: () => void;
  next: () => void;
  previous: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

function isSeen(): boolean {
  try { return localStorage.getItem(ONBOARDING_STORAGE_KEY) === "seen"; }
  catch { return false; }
}

function storeSeen(): void {
  try { localStorage.setItem(ONBOARDING_STORAGE_KEY, "seen"); }
  catch { /* App bleibt bei blockiertem localStorage nutzbar. */ }
}

export function OnboardingProvider({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(() => !isSeen());
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState<OnboardingDirection>("forward");

  const openOnboarding = useCallback(() => {
    setDirection("forward");
    setPage(0);
    setOpen(true);
  }, []);
  const dismiss = useCallback(() => {
    storeSeen();
    setOpen(false);
  }, []);
  const next = useCallback(() => {
    setDirection("forward");
    setPage((current) => Math.min(current + 1, ONBOARDING_PAGE_COUNT - 1));
  }, []);
  const previous = useCallback(() => {
    setDirection("backward");
    setPage((current) => Math.max(current - 1, 0));
  }, []);

  const value = useMemo(() => ({ open, page, direction, openOnboarding, dismiss, next, previous }),
    [direction, dismiss, next, open, openOnboarding, page, previous]);
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error("useOnboarding must be used within an OnboardingProvider");
  return context;
}
```

- [ ] **Step 4: Tests ausführen**

Run: `npm run test -- src/hooks/useOnboarding.test.tsx`

Expected: PASS für alle drei Persistenzfälle.

- [ ] **Step 5: Onboarding-Zustand committen**

```bash
git add src/hooks/useOnboarding.tsx src/hooks/useOnboarding.test.tsx
git commit -m "feat: persist first-run onboarding state"
```

---

### Task 4: Dialograhmen, vier Seiten und Navigation erstellen

**Files:**
- Create: `src/components/onboarding/OnboardingDialog.tsx`
- Create: `src/components/onboarding/OnboardingContent.tsx`
- Create: `src/components/onboarding/OnboardingDialog.test.tsx`

- [ ] **Step 1: Failing Dialogtest für Inhalte, Navigation und Abschluss schreiben**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { ImportProvider } from "@/hooks/useImportController";
import { ONBOARDING_STORAGE_KEY, OnboardingProvider } from "@/hooks/useOnboarding";
import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog";

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ImportProvider><OnboardingProvider><OnboardingDialog /></OnboardingProvider></ImportProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OnboardingDialog", () => {
  beforeEach(() => localStorage.clear());

  it("zeigt vier Seiten und schließt mit gespeichertem Status ab", () => {
    renderDialog();
    expect(screen.getByRole("img", { name: "RVTools Analyzer Logo" })).toHaveAttribute("src", "/favicon-master.png");
    fireEvent.click(screen.getByRole("button", { name: "Tour starten" }));
    expect(screen.getByRole("heading", { name: "Datenbasis hinzufügen" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByRole("heading", { name: "Der globale Systemfilter" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByRole("heading", { name: "Die wichtigsten Werkzeuge" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Analyse öffnen" }));
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe("seen");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Test ausführen und fehlende Komponenten bestätigen**

Run: `npm run test -- src/components/onboarding/OnboardingDialog.test.tsx`

Expected: FAIL mit fehlendem `OnboardingDialog`.

- [ ] **Step 3: Statische Inhaltsseiten implementieren**

`OnboardingContent.tsx` exportiert drei fokussierte Komponenten und die Featuredaten:

```tsx
import { BarChart3, Boxes, Download, Filter, Layers3, Server, ShieldCheck } from "lucide-react";

export function WelcomePage() {
  return <section className="onboarding-stagger mx-auto grid h-full max-w-5xl items-center gap-10 lg:grid-cols-[1fr_0.85fr]">
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-primary">Local-first Infrastructure Analytics</p>
      <h2 tabIndex={-1} className="onboarding-heading mt-5 text-4xl font-semibold tracking-tight sm:text-6xl">Infrastruktur.<br /><em className="font-serif text-primary">Durchblick.</em></h2>
      <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">RVTools- und Tech-Info-Daten lokal verbinden, gezielt analysieren und verständlich exportieren – ohne eigenes Daten-Backend.</p>
      <div className="mt-7 flex flex-wrap gap-2 text-xs"><span className="rounded-full border px-3 py-1.5">Verarbeitung im Browser</span><span className="rounded-full border px-3 py-1.5">Lokale Speicherung</span></div>
    </div>
    <div className="onboarding-logo-stage"><img src="/favicon-master.png" alt="RVTools Analyzer Logo" className="h-44 w-44 rounded-[2rem] object-cover sm:h-56 sm:w-56" /></div>
  </section>;
}

export function FilterPage() {
  return <section className="onboarding-stagger mx-auto max-w-5xl">
    <p className="font-mono text-xs uppercase tracking-[0.22em] text-primary">Gezielt fokussieren</p>
    <h2 tabIndex={-1} className="onboarding-heading mt-3 text-3xl font-semibold sm:text-5xl">Der globale Systemfilter</h2>
    <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">RVTools- und Tech-Info-Felder lassen sich in gemeinsamen Filtergruppen verbinden. Alternativ grenzt eine eingefügte Systemliste die Analysen auf konkrete VMs ein.</p>
    <div className="mt-8 grid gap-4 md:grid-cols-[1fr_auto_1fr]"><div className="onboarding-feature-card"><Server className="h-5 w-5 text-primary" /><strong>RVTools</strong><span>Cluster = PROD</span></div><Filter className="hidden self-center text-primary md:block" /><div className="onboarding-feature-card"><ShieldCheck className="h-5 w-5 text-primary" /><strong>Tech-Info</strong><span>Verantwortung = Team A</span></div></div>
    <div className="mt-4 rounded-xl border bg-card/70 p-4 font-mono text-sm text-muted-foreground">Systemliste: vm-app-01, vm-db-04, vm-web-12 …</div>
  </section>;
}

const features = [
  { icon: Boxes, title: "Detailansichten", text: "VMs, Hosts und Cluster direkt im Kontext untersuchen." },
  { icon: BarChart3, title: "Durchschnittliche VM", text: "Eine typische Ressourcenbasis für Planung und Einordnung ermitteln." },
  { icon: Layers3, title: "Varianten", text: "Host-Hardware- und Host-Netzwerk-Varianten vergleichen." },
  { icon: Download, title: "Export", text: "Jede Tabelle als Excel oder Markdown mitnehmen." },
];

export function FeaturesPage() {
  return <section className="onboarding-stagger mx-auto max-w-5xl">
    <p className="font-mono text-xs uppercase tracking-[0.22em] text-primary">Analysieren und mitnehmen</p>
    <h2 tabIndex={-1} className="onboarding-heading mt-3 text-3xl font-semibold sm:text-5xl">Die wichtigsten Werkzeuge</h2>
    <div className="mt-8 grid gap-4 sm:grid-cols-2">{features.map(({ icon: Icon, title, text }) => <article key={title} className="onboarding-feature-card"><Icon className="h-5 w-5 text-primary" /><h3 className="font-semibold">{title}</h3><p className="text-sm leading-6 text-muted-foreground">{text}</p></article>)}</div>
    <p className="mt-6 font-mono text-xs leading-6 text-muted-foreground">AUCH DABEI · DAILY OPS · CAPACITY · PERFORMANCE · STORAGE/BACKUP · LIFECYCLE · FLEET COMPARE · PLANUNG</p>
  </section>;
}
```

Für Task 4 erhält `OnboardingImportPage.tsx` zunächst die vollständige statische Darstellung. Task 5 bindet genau diese Seite an den Import-Controller an:

```tsx
import { Upload } from "lucide-react";

export function OnboardingImportPage() {
  return <section className="onboarding-stagger mx-auto max-w-4xl">
    <p className="font-mono text-xs uppercase tracking-[0.22em] text-primary">Daten importieren</p>
    <h2 tabIndex={-1} className="onboarding-heading mt-3 text-3xl font-semibold sm:text-5xl">Datenbasis hinzufügen</h2>
    <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">Mehrere RVTools-, Tech-Info-Server- und Tech-Info-Client-Dateien können gemeinsam ausgewählt werden. Die Tour läuft während des Imports weiter.</p>
    <div className="mt-8 flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed bg-card/60 p-8 text-center">
      <Upload className="h-10 w-10 text-primary" />
      <strong className="mt-4">Excel-Dateien ablegen oder auswählen</strong>
      <span className="mt-2 font-mono text-xs text-muted-foreground">.XLSX · .XLS · MEHRFACHAUSWAHL</span>
    </div>
  </section>;
}
```

- [ ] **Step 4: Dialograhmen mit vierseitiger Navigation implementieren**

`OnboardingDialog.tsx` verwendet `Dialog`, rendert je nach `page` die richtige Seite, setzt `key={page}` für die Animation und ruft bei `onOpenChange(false)` immer `dismiss()` auf. Die vollständige erste Version lautet:

```tsx
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { WelcomePage, FilterPage, FeaturesPage } from "@/components/onboarding/OnboardingContent";
import { OnboardingImportPage } from "@/components/onboarding/OnboardingImportPage";
import { useOnboarding } from "@/hooks/useOnboarding";
import { cn } from "@/lib/utils";

const pageTitles = ["Willkommen", "Daten importieren", "Systemfilter", "Werkzeuge"];

export function OnboardingDialog() {
  const navigate = useNavigate();
  const { open, page, direction, dismiss, next, previous } = useOnboarding();
  const finish = () => {
    dismiss();
    navigate("/overview");
  };

  return <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) dismiss(); }}>
    <DialogContent className="flex h-[84vh] w-[90vw] max-w-[1360px] flex-col gap-0 overflow-hidden border-primary/20 bg-background p-0 max-sm:h-[96dvh] max-sm:w-[96vw] sm:rounded-2xl">
      <DialogTitle className="sr-only">Einführung in den RVTools Analyzer</DialogTitle>
      <DialogDescription className="sr-only">Vierseitige Produkttour mit optionalem Excel-Import.</DialogDescription>
      <header className="flex items-center justify-between border-b px-6 py-4 pr-14">
        <div><span className="font-mono text-xs text-primary">0{page + 1} / 04</span><p className="text-sm font-medium">{pageTitles[page]}</p></div>
        <button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={dismiss}>Überspringen</button>
      </header>
      <main key={page} data-direction={direction} className="onboarding-page flex-1 overflow-y-auto p-6 sm:p-10">
        {page === 0 && <WelcomePage />}
        {page === 1 && <OnboardingImportPage />}
        {page === 2 && <FilterPage />}
        {page === 3 && <FeaturesPage />}
      </main>
      <footer className="flex items-center justify-between border-t bg-card/70 px-6 py-4">
        <Button variant="ghost" onClick={previous} disabled={page === 0}>Zurück</Button>
        <div className="flex gap-2" aria-label="Onboarding-Fortschritt">{pageTitles.map((title, index) => <span key={title} className={cn("h-1.5 w-8 rounded-full", index <= page ? "bg-primary" : "bg-muted")} />)}</div>
        {page === 0 ? <Button onClick={next}>Tour starten</Button> : page < 3 ? <Button onClick={next}>Weiter</Button> : <Button onClick={finish}>Analyse öffnen</Button>}
      </footer>
    </DialogContent>
  </Dialog>;
}
```

- [ ] **Step 5: Dialogtest ausführen und Grundgerüst committen**

Run: `npm run test -- src/components/onboarding/OnboardingDialog.test.tsx`

Expected: PASS für Logo, alle vier Seiten, Abschluss und Persistenzeintrag.

```bash
git add src/components/onboarding/OnboardingDialog.tsx src/components/onboarding/OnboardingContent.tsx src/components/onboarding/OnboardingImportPage.tsx src/components/onboarding/OnboardingDialog.test.tsx
git commit -m "feat: add four-page onboarding dialog"
```

---

### Task 5: Importseite und dauerhaften Importstatus fertigstellen

**Files:**
- Modify: `src/components/onboarding/OnboardingImportPage.tsx`
- Create: `src/components/onboarding/OnboardingImportStatus.tsx`
- Modify: `src/components/onboarding/OnboardingDialog.tsx`
- Modify: `src/components/onboarding/OnboardingContent.tsx`
- Modify: `src/components/onboarding/OnboardingDialog.test.tsx`

- [ ] **Step 1: Failing Test für Weiterblättern während eines laufenden Imports ergänzen**

Mocke `importRvtoolsXlsx` mit einer kontrollierten Promise. Wähle eine Datei, klicke sofort „Weiter“ und prüfe, dass Seite 3 sowie der laufende Status sichtbar sind:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react";
import { importRvtoolsXlsx } from "@/domain/services/importService";
import type { ImportResult } from "@/domain/models/types";

vi.mock("@/domain/services/importService", () => ({ importRvtoolsXlsx: vi.fn() }));
const mockedImport = vi.mocked(importRvtoolsXlsx);

it("setzt die Tour während eines laufenden Imports fort", async () => {
  let finishImport!: (value: ImportResult) => void;
  mockedImport.mockImplementation((_file, onProgress) => {
    onProgress?.({ step: "Rohdaten speichern", percent: 61, detail: "infra.xlsx" });
    return new Promise((resolve) => { finishImport = resolve; });
  });
  renderDialog();
  fireEvent.click(screen.getByRole("button", { name: "Tour starten" }));
  fireEvent.change(screen.getByLabelText(/Excel-Dateien auswählen/i), {
    target: { files: [new File(["x"], "infra.xlsx")] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
  expect(screen.getByRole("heading", { name: "Der globale Systemfilter" })).toBeInTheDocument();
  expect(screen.getByText("61 %")).toBeInTheDocument();
  await act(() => finishImport({ success: true, fileKind: "rvtools", warnings: [], errors: [] }));
  expect(await screen.findByText("Import abgeschlossen")).toBeInTheDocument();
});
```

- [ ] **Step 2: Test ausführen und fehlenden global sichtbaren Status bestätigen**

Run: `npm run test -- src/components/onboarding/OnboardingDialog.test.tsx`

Expected: FAIL, weil Status und vollständige Importseite noch fehlen.

- [ ] **Step 3: Importseite an den gemeinsamen Controller anbinden**

```tsx
import { useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { useImportController } from "@/hooks/useImportController";
import { cn } from "@/lib/utils";

export function OnboardingImportPage() {
  const { importing, importFiles, rejectedFileNames } = useImportController();
  const [dragOver, setDragOver] = useState(false);
  return <section className="onboarding-stagger mx-auto max-w-4xl">
    <p className="font-mono text-xs uppercase tracking-[0.22em] text-primary">Daten importieren</p>
    <h2 tabIndex={-1} className="onboarding-heading mt-3 text-3xl font-semibold sm:text-5xl">Datenbasis hinzufügen</h2>
    <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">Mehrere RVTools-, Tech-Info-Server- und Tech-Info-Client-Dateien können gemeinsam ausgewählt werden. Die Tour läuft während des Imports weiter.</p>
    <label className={cn("mt-8 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed bg-card/60 p-8 text-center transition", dragOver && "border-primary bg-primary/5")} onDragOver={(event) => { event.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(event) => { event.preventDefault(); setDragOver(false); void importFiles(event.dataTransfer.files); }}>
      <input type="file" accept=".xlsx,.xls" multiple disabled={importing} className="sr-only" aria-label="RVTools- und Tech-Info-Excel-Dateien auswählen" onChange={(event) => event.target.files && void importFiles(event.target.files)} />
      {importing ? <FileSpreadsheet className="h-10 w-10 animate-pulse text-primary" /> : <Upload className="h-10 w-10 text-primary" />}
      <strong className="mt-4">Excel-Dateien ablegen oder auswählen</strong>
      <span className="mt-2 font-mono text-xs text-muted-foreground">.XLSX · .XLS · MEHRFACHAUSWAHL</span>
    </label>
    {rejectedFileNames.length > 0 && <p role="alert" className="mt-3 text-sm text-destructive">Nicht unterstützt: {rejectedFileNames.join(", ")}</p>}
  </section>;
}
```

- [ ] **Step 4: Persistenten Status bauen und auf Seiten 2 bis 4 rendern**

`OnboardingImportStatus` bestimmt das aktive oder letzte Item. Die Live-Region verwendet `aria-live="polite"`; Status und Prozent werden textuell ausgegeben. `OnboardingDialog` rendert die Komponente im Header, sobald `page >= 1 && items.length > 0`:

```tsx
import { fileKindLabel, useImportController } from "@/hooks/useImportController";
import { cn } from "@/lib/utils";

export function OnboardingImportStatus() {
  const { items, importing } = useImportController();
  const item = items.find((entry) => entry.status === "running") ?? items.at(-1);
  if (!item) return null;
  const label = importing ? item.progress?.step ?? "Import läuft" : item.status === "error" ? "Import fehlgeschlagen" : item.status === "warning" ? "Import mit Warnungen abgeschlossen" : "Import abgeschlossen";
  return <div aria-live="polite" className="rounded-full border bg-background/80 px-3 py-1.5 text-xs shadow-sm">
    <span className={cn("mr-2 inline-block h-2 w-2 rounded-full", importing ? "animate-pulse bg-primary" : item.status === "error" ? "bg-destructive" : item.status === "warning" ? "bg-warning" : "bg-success")} />
    <span>{label}</span>
    <span className="ml-2 max-w-40 truncate text-muted-foreground">{item.fileName}</span>
    {item.fileKind && <span className="ml-2 font-mono text-muted-foreground">{fileKindLabel(item.fileKind)}</span>}
    {item.progress && <span className="ml-2 font-mono text-muted-foreground">{item.progress.percent} %</span>}
  </div>;
}
```

Importiere `OnboardingImportStatus` und `useImportController` in `OnboardingDialog.tsx`, lies `items` im Komponentenrumpf und ergänze den Header zwischen Seitentitel und „Überspringen“:

```tsx
const { items } = useImportController();
```

```tsx
{page >= 1 && items.length > 0 && <OnboardingImportStatus />}
```

Ergänze außerdem `OnboardingContent.tsx` um einen vollständigen Recovery-Bereich und rendere `<ImportRecovery />` am Ende von `FeaturesPage`. So bleiben konkrete Fehler sichtbar und eine neue Auswahl beziehungsweise der Wechsel zur Upload-Seite ist möglich:

```tsx
import { Link } from "react-router-dom";
import { useImportController } from "@/hooks/useImportController";

export function ImportRecovery() {
  const { items, importing, importFiles } = useImportController();
  const failedItems = items.filter((item) => item.status === "error");
  if (failedItems.length === 0) return null;
  return <div role="alert" className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
    <p className="font-semibold">Mindestens eine Datei konnte nicht importiert werden.</p>
    <ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
      {failedItems.map((item) => <li key={item.id}>{item.fileName}: {item.result?.errors.join(", ")}</li>)}
    </ul>
    <div className="mt-4 flex flex-wrap gap-3">
      <label className="inline-flex min-h-10 cursor-pointer items-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent">
        Andere Dateien auswählen
        <input type="file" accept=".xlsx,.xls" multiple disabled={importing} className="sr-only" aria-label="Andere Excel-Dateien auswählen" onChange={(event) => event.target.files && void importFiles(event.target.files)} />
      </label>
      <Link to="/upload" className="inline-flex min-h-10 items-center rounded-md px-4 text-sm font-medium text-primary hover:underline">Zu Uploads &amp; Snapshots</Link>
    </div>
  </div>;
}
```

Der Abschluss von `FeaturesPage` lautet danach:

```tsx
<p className="mt-6 font-mono text-xs leading-6 text-muted-foreground">AUCH DABEI · DAILY OPS · CAPACITY · PERFORMANCE · STORAGE/BACKUP · LIFECYCLE · FLEET COMPARE · PLANUNG</p>
<ImportRecovery />
```

Der Importtest erhält zusätzlich einen Fehlerfall:

```tsx
it("bietet nach einem Importfehler eine neue Auswahl und die Upload-Seite an", async () => {
  mockedImport.mockResolvedValue({ success: false, fileKind: "rvtools", warnings: [], errors: ["Datei beschädigt"] });
  renderDialog();
  fireEvent.click(screen.getByRole("button", { name: "Tour starten" }));
  fireEvent.change(screen.getByLabelText(/Excel-Dateien auswählen/i), { target: { files: [new File(["x"], "broken.xlsx")] } });
  fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
  fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("broken.xlsx: Datei beschädigt");
  expect(screen.getByRole("link", { name: "Zu Uploads & Snapshots" })).toHaveAttribute("href", "/upload");
});
```

- [ ] **Step 5: Test ausführen und Import-UI committen**

Run: `npm run test -- src/components/onboarding/OnboardingDialog.test.tsx src/hooks/useImportController.test.tsx`

Expected: PASS inklusive Weiterblättern bei 61 % und anschließendem Erfolg.

```bash
git add src/components/onboarding/OnboardingImportPage.tsx src/components/onboarding/OnboardingImportStatus.tsx src/components/onboarding/OnboardingContent.tsx src/components/onboarding/OnboardingDialog.tsx src/components/onboarding/OnboardingDialog.test.tsx
git commit -m "feat: keep onboarding import active across pages"
```

---

### Task 6: Adaptive Gestaltung und Reduced Motion ergänzen

**Files:**
- Modify: `src/index.css`
- Modify: `src/components/onboarding/OnboardingDialog.test.tsx`

- [ ] **Step 1: Test für Theme-unabhängige Tokenklassen und Bewegungsrichtung ergänzen**

```tsx
it("kennzeichnet die adaptive Onboarding-Fläche und den Fortschritt", () => {
  renderDialog();
  const page = screen.getByRole("heading", { name: /Infrastruktur/ }).closest("main");
  expect(page).toHaveAttribute("data-direction", "forward");
  expect(page).toHaveClass("onboarding-page");
  expect(screen.getByRole("dialog")).toHaveClass("onboarding-surface", "bg-background");
  expect(screen.getByLabelText("Onboarding-Fortschritt")).toHaveClass("onboarding-progress-track");
});
```

- [ ] **Step 2: Test ausführen und fehlende beziehungsweise unvollständige Klassen bestätigen**

Run: `npm run test -- src/components/onboarding/OnboardingDialog.test.tsx`

Expected: FAIL, weil `onboarding-surface` und `onboarding-progress-track` noch nicht gesetzt sind.

- [ ] **Step 3: Onboarding-CSS mit adaptiven Tokens implementieren**

```css
@layer components {
  .onboarding-surface { isolation: isolate; box-shadow: 0 36px 100px -42px hsl(var(--primary) / .42); }
  .onboarding-surface::before { content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none; opacity: .12; background-image: linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px); background-size: 36px 36px; mask-image: linear-gradient(to bottom, black, transparent 72%); }
  .onboarding-progress-track { @apply flex gap-2; }
  .onboarding-page[data-direction="forward"] { animation: onboarding-forward 280ms cubic-bezier(.22, 1, .36, 1); }
  .onboarding-page[data-direction="backward"] { animation: onboarding-backward 280ms cubic-bezier(.22, 1, .36, 1); }
  .onboarding-stagger > * { animation: onboarding-rise 360ms both; }
  .onboarding-stagger > *:nth-child(2) { animation-delay: 55ms; }
  .onboarding-stagger > *:nth-child(3) { animation-delay: 110ms; }
  .onboarding-stagger > *:nth-child(4) { animation-delay: 165ms; }
  .onboarding-logo-stage { @apply relative grid min-h-72 place-items-center overflow-hidden rounded-3xl border bg-card; }
  .onboarding-logo-stage::before { content: ""; position: absolute; inset: 12%; border-radius: 999px; background: hsl(var(--primary) / .2); filter: blur(52px); }
  .onboarding-logo-stage::after { content: ""; position: absolute; inset: 0; opacity: .22; background-image: linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px); background-size: 28px 28px; }
  .onboarding-logo-stage img { position: relative; z-index: 1; box-shadow: 0 28px 70px -32px hsl(var(--primary) / .65); }
  .onboarding-feature-card { @apply flex flex-col gap-3 rounded-2xl border bg-card/80 p-5 shadow-sm; }
}

@keyframes onboarding-forward { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
@keyframes onboarding-backward { from { opacity: 0; transform: translateX(-24px); } to { opacity: 1; transform: translateX(0); } }
@keyframes onboarding-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

@media (prefers-reduced-motion: reduce) {
  .onboarding-page,
  .onboarding-stagger > * { animation: none !important; }
}
```

Setze in `OnboardingDialog.tsx` `onboarding-surface` zusätzlich am `DialogContent` und `onboarding-progress-track` an der Fortschrittsgruppe. Die übrigen Klassen bleiben unverändert:

```tsx
<DialogContent className="onboarding-surface flex h-[84vh] w-[90vw] max-w-[1360px] flex-col gap-0 overflow-hidden border-primary/20 bg-background p-0 max-sm:h-[96dvh] max-sm:w-[96vw] sm:rounded-2xl">
```

```tsx
<div className="onboarding-progress-track" aria-label="Onboarding-Fortschritt">
```

Alle Farben bleiben Token-basiert. Dadurch reagiert das Onboarding automatisch auf `.light` und `.dark`, auch bei einem Theme-Wechsel im geöffneten Dialog.

- [ ] **Step 4: Test und Lint für die betroffenen UI-Dateien ausführen**

Run: `npm run test -- src/components/onboarding/OnboardingDialog.test.tsx && npm run lint`

Expected: PASS und keine neuen ESLint-Fehler.

- [ ] **Step 5: Gestaltung committen**

```bash
git add src/index.css src/components/onboarding/OnboardingDialog.tsx src/components/onboarding/OnboardingDialog.test.tsx
git commit -m "style: add adaptive onboarding command-center design"
```

---

### Task 7: Provider in die App integrieren und Wiederaufruf im Impressum ergänzen

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/Impressum.tsx`
- Modify: `src/pages/Impressum.test.tsx`

- [ ] **Step 1: Failing Impressum-Test für den Wiederaufruf schreiben**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Impressum from "@/pages/Impressum";

const openOnboarding = vi.fn();
vi.mock("@/hooks/useOnboarding", () => ({
  useOnboarding: () => ({ openOnboarding }),
}));

describe("Impressum", () => {
  it("startet das Onboarding erneut", () => {
    render(<Impressum />);
    fireEvent.click(screen.getByRole("button", { name: "Onboarding erneut starten" }));
    expect(openOnboarding).toHaveBeenCalledOnce();
  });
});
```

Behalte die vorhandenen Assertions zu Logo, Datenschutz und Kontakt im selben Testfile bei.

- [ ] **Step 2: Test ausführen und fehlende Aktion bestätigen**

Run: `npm run test -- src/pages/Impressum.test.tsx`

Expected: FAIL, weil der Button noch nicht existiert.

- [ ] **Step 3: Wiederaufruf im Impressum implementieren**

Importiere `Button`, `RotateCcw` und `useOnboarding`. Ergänze unter dem Markenabschnitt eine klar erkennbare Aktion:

```tsx
const { openOnboarding } = useOnboarding();

<Button type="button" variant="outline" onClick={openOnboarding}>
  <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
  Onboarding erneut starten
</Button>
```

- [ ] **Step 4: Provider und Dialog in `App.tsx` korrekt verschachteln**

Innerhalb von `QueryClientProvider`, `ThemeProvider` und `BrowserRouter` gilt diese Reihenfolge:

```tsx
<BrowserRouter>
  <ImportProvider>
    <OnboardingProvider>
      <FilterProvider>
        <SelectionProvider>
          <AppLayout>
            <Suspense fallback={<PageFallback />}>
              <Routes>{/* bestehende Routes unverändert */}</Routes>
            </Suspense>
          </AppLayout>
          <OnboardingDialog />
        </SelectionProvider>
      </FilterProvider>
    </OnboardingProvider>
  </ImportProvider>
</BrowserRouter>
```

Der `OnboardingDialog` bleibt innerhalb des Routers, damit „Analyse öffnen“ navigieren kann, und innerhalb des Import-Providers, damit der Upload nach dem Schließen weiterläuft.

- [ ] **Step 5: Integration testen und committen**

Run: `npm run test -- src/pages/Impressum.test.tsx src/components/onboarding/OnboardingDialog.test.tsx src/hooks/useOnboarding.test.tsx`

Expected: PASS für Wiederaufruf, Dialog und Persistenz.

```bash
git add src/App.tsx src/pages/Impressum.tsx src/pages/Impressum.test.tsx
git commit -m "feat: launch onboarding on first visit and from imprint"
```

---

### Task 8: Accessibility-Regressions und vollständige Verifikation

**Files:**
- Modify: `src/components/onboarding/OnboardingDialog.test.tsx`
- Modify: `src/components/onboarding/OnboardingDialog.tsx`

- [ ] **Step 1: Tastatur-, Fokus- und Schließtests ergänzen**

```tsx
it("markiert Escape als gesehen und schließt den Dialog", () => {
  renderDialog();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe("seen");
});

it("beschriftet Fortschritt und Importstatus ohne reine Farbcodierung", () => {
  renderDialog();
  expect(screen.getByLabelText("Onboarding-Fortschritt")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tour starten" }));
  expect(screen.getByLabelText(/Excel-Dateien auswählen/i)).toHaveAttribute("multiple");
});
```

- [ ] **Step 2: Fokussierung der Seitenüberschrift implementieren**

In `OnboardingDialog.tsx` wird der scrollende Bereich per Ref angesprochen. Nach jedem Seitenwechsel erhält die `.onboarding-heading` den Fokus:

```tsx
const pageRef = useRef<HTMLElement>(null);

useEffect(() => {
  const frame = requestAnimationFrame(() => {
    pageRef.current?.querySelector<HTMLElement>(".onboarding-heading")?.focus();
  });
  return () => cancelAnimationFrame(frame);
}, [page]);
```

Setze `ref={pageRef}` am `<main>` und behalte `tabIndex={-1}` an jeder Seitenüberschrift.

- [ ] **Step 3: Fokussierte Tests ausführen**

Run: `npm run test -- src/components/onboarding/OnboardingDialog.test.tsx src/hooks/useImportController.test.tsx src/hooks/useOnboarding.test.tsx src/pages/UploadSnapshots.test.tsx src/pages/Impressum.test.tsx`

Expected: Alle neuen und geänderten Tests PASS.

- [ ] **Step 4: Gesamte Qualitätssicherung ausführen**

Run: `npm run test`

Expected: Gesamte Vitest-Suite PASS.

Run: `npm run lint`

Expected: Keine neuen ESLint-Fehler; bestehende, nicht betroffene Baustellen werden nicht verändert.

Run: `npm run build`

Expected: TypeScript- und Vite-Production-Build erfolgreich; keine neue Server- oder Backend-Abhängigkeit.

- [ ] **Step 5: Responsive Sichtprüfung durchführen**

Mit `npm run dev` prüfen:

- Dark Theme und Light Theme bei geöffnetem Onboarding.
- Desktop bei 1.440 × 900 Pixeln: Fokusfenster ungefähr `90vw × 84vh`, maximal 1.360 Pixel breit.
- kleiner Viewport bei 390 × 844 Pixeln: nahezu bildschirmfüllend, Footer sichtbar, Inhalt intern scrollbar.
- Mehrfachimport starten, sofort auf Seite 3 und 4 wechseln und den Status weiter beobachten.
- Onboarding während des Imports schließen; Import auf „Uploads & Snapshots“ weiterlaufen beziehungsweise abgeschlossen erscheinen lassen.
- Impressum öffnen und Tour erneut auf Seite 1 starten.
- Reduced Motion im Betriebssystem beziehungsweise in DevTools aktivieren; Seitentransformationen müssen entfallen.

- [ ] **Step 6: Verifikation committen**

```bash
git add src/components/onboarding/OnboardingDialog.tsx src/components/onboarding/OnboardingDialog.test.tsx
git commit -m "test: cover onboarding accessibility and lifecycle"
```
