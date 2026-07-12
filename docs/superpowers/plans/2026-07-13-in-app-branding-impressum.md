# In-App-Branding und Impressum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das neue RVTools-Analyzer-Logo in der Sidebar verwenden und eine responsive Impressumsseite mit lokaler Datensicherheits-Erklärung ergänzen.

**Architecture:** Eine neue lazy geladene React-Seite kapselt alle Impressumsinhalte. Die bestehende Sidebar erhält ausschließlich das Logo im Markenbereich und eine neue Info-Navigation; Routing und Layout folgen den vorhandenen Mustern.

**Tech Stack:** React 18, TypeScript, React Router, Tailwind CSS, shadcn/ui, Lucide, Vitest, Testing Library

---

### Task 1: Impressumsseite testgetrieben erstellen

**Files:**
- Create: `src/pages/Impressum.test.tsx`
- Create: `src/pages/Impressum.tsx`

- [ ] **Step 1: Fehlenden Seiteninhalt testen**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Impressum from "@/pages/Impressum";

describe("Impressum", () => {
  it("zeigt Marke, lokale Datenverarbeitung und Kontaktdaten", () => {
    render(<Impressum />);

    expect(screen.getByRole("img", { name: "RVTools Analyzer Logo" })).toHaveAttribute(
      "src",
      "/favicon-master.png",
    );
    expect(screen.getByRole("heading", { name: "RVTools Analyzer" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ihre Daten bleiben lokal" })).toBeInTheDocument();
    expect(screen.getByText("Philipp Asanger")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "philipp.asanger@gmail.com" })).toHaveAttribute(
      "href",
      "mailto:philipp.asanger@gmail.com",
    );
  });
});
```

- [ ] **Step 2: Test ausführen und erwartetes Rot bestätigen**

Run: `npm run test -- src/pages/Impressum.test.tsx`

Expected: FAIL, weil `@/pages/Impressum` noch nicht existiert.

- [ ] **Step 3: Impressumsseite implementieren**

`src/pages/Impressum.tsx` als default exportierte React-Komponente erstellen. Sie verwendet `Card`, `CardContent`, `Badge` sowie die Lucide-Symbole `CircleUserRound`, `Database`, `Mail`, `MapPin`, `ShieldCheck` und `Workflow`. Die Seite enthält:

- Logo `/favicon-master.png` mit Alt-Text `RVTools Analyzer Logo`
- H1 `RVTools Analyzer`
- Zweckbeschreibung der lokalen RVTools-XLSX-Analyse
- H2 `Ihre Daten bleiben lokal`
- technisch genaue Hinweise auf Browser, Web Worker, IndexedDB, kein eigenes Backend und Löschbarkeit
- H2 `Impressum`
- Philipp Asanger, Karl-Renner-Str. 3, 4040 Linz, Österreich
- Mail-Link `mailto:philipp.asanger@gmail.com`

Layout: responsives Zwei-Spalten-Grid ab `lg`, cyanfarbene Akzente aus `primary`, vorhandene Card-/Border-Tokens, keine Animationen.

- [ ] **Step 4: Seitentest ausführen und Grün bestätigen**

Run: `npm run test -- src/pages/Impressum.test.tsx`

Expected: 1 Test besteht.

- [ ] **Step 5: Seite und Test committen**

```bash
git add src/pages/Impressum.tsx src/pages/Impressum.test.tsx
git commit -m "feat: add RVTools Analyzer imprint page"
```

### Task 2: Logo und Impressum in die App-Navigation integrieren

**Files:**
- Modify: `src/app/layout/AppSidebar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Sidebar-Markenblock umstellen**

Den bisherigen `RV`-Block ersetzen durch:

```tsx
<img
  src="/favicon-master.png"
  alt=""
  aria-hidden="true"
  className="h-8 w-8 rounded-md object-cover ring-1 ring-primary/20"
/>
```

`CircleInfo` importieren, `infoNav` ergänzen und nach den bestehenden Gruppen rendern:

```tsx
const infoNav = [{ title: "Impressum", url: "/impressum", icon: CircleInfo }];
```

```tsx
<NavSection label="Info" items={infoNav} />
```

- [ ] **Step 2: Lazy Route ergänzen**

In `src/App.tsx` ergänzen:

```tsx
const Impressum = lazy(() => import("@/pages/Impressum"));
```

```tsx
<Route path="/impressum" element={<Impressum />} />
```

- [ ] **Step 3: Fokussierten Test erneut ausführen**

Run: `npm run test -- src/pages/Impressum.test.tsx`

Expected: 1 Test besteht.

- [ ] **Step 4: Navigation und Route committen**

```bash
git add src/app/layout/AppSidebar.tsx src/App.tsx
git commit -m "feat: expose branding and imprint in navigation"
```

### Task 3: React- und Projektqualität verifizieren

**Files:**
- Verify: `src/pages/Impressum.tsx`
- Verify: `src/app/layout/AppSidebar.tsx`
- Verify: `src/App.tsx`

- [ ] **Step 1: React Doctor ausführen**

Run: `npx -y react-doctor@latest . --verbose`

Expected: keine neuen Probleme in den drei geänderten React-Dateien.

- [ ] **Step 2: Gesamte Testsuite ausführen**

Run: `npm run test`

Expected: alle Tests bestehen.

- [ ] **Step 3: ESLint ausführen**

Run: `npm run lint`

Expected: Exit Code 0 und keine neuen Probleme.

- [ ] **Step 4: Production-Build ausführen**

Run: `npm run build`

Expected: Vite erstellt `dist/` erfolgreich und enthält einen lazy geladenen Impressum-Chunk.

- [ ] **Step 5: Arbeitsbaum prüfen**

Run: `git status --short`

Expected: sauberer Arbeitsbaum auf `main`.
