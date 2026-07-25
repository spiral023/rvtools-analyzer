# RVTools Analyzer als PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die App installierbar machen (Manifest + Service Worker via
`vite-plugin-pwa`) mit einer persistenten, klickbaren Update-Warnung im
Header statt automatischem/stillem Reload.

**Architecture:** `vite-plugin-pwa` mit Strategie `generateSW` generiert
Manifest + Service Worker aus dem bestehenden Vite-Build (keine eigene API,
kein individuelles Daten-Caching nötig). Eine neue React-Komponente
`PwaUpdateWarning` nutzt den `useRegisterSW`-Hook des Plugins und rendert bei
verfügbarem Update eine rote, nicht auto-verschwindende Pille links vom
Filter-Icon im globalen `AppLayout`.

**Tech Stack:** Vite 6, React, `vite-plugin-pwa` (Workbox), `sharp`
(einmalige Icon-Generierung), Vitest + Testing Library.

## Global Constraints

- Kein echter Offline-Anspruch für neue Daten/Importe — nur App-Shell
  installierbar, Update-Erkennung kontrolliert (kein `skipWaiting`/
  `clientsClaim` ohne Klick).
- `registerType: "prompt"` — Update wird nie automatisch angewendet.
- Update-Hinweis ist eine persistente rote Pille (`bg-destructive`), **kein**
  Sonner-Toast, platziert in `AppLayout.tsx` direkt vor
  `<GlobalFilterControl />`.
- Theme-/Hintergrundfarbe im Manifest: `#0d0f12` (bestehender
  `<meta name="theme-color">`-Wert aus `index.html`).
- Icons werden aus `public/favicon-master.png` generiert, kein neues
  Icon-Design.
- Spec: `docs/superpowers/specs/2026-07-25-pwa-conversion-design.md`.

---

## File Structure

- **Create:** `pwa.config.ts` (Root) — geteilte `VitePWA`-Optionen, von
  `vite.config.ts` **und** `vitest.config.ts` importiert (DRY, und macht die
  virtuelle `virtual:pwa-register/react`-Modul-Auflösung auch unter Vitest
  verfügbar).
- **Create:** `scripts/generate-pwa-icons.mjs` — einmaliges Icon-Skript.
- **Create:** `public/icons/pwa-192x192.png`,
  `public/icons/pwa-512x512.png`, `public/icons/pwa-512x512-maskable.png` —
  generierte Assets, committet.
- **Create:** `src/components/pwa/PwaUpdateWarning.tsx` +
  `src/components/pwa/PwaUpdateWarning.test.tsx`.
- **Modify:** `vite.config.ts` (Plugin registrieren), `vitest.config.ts`
  (Plugin für Testauflösung registrieren), `index.html` (iOS-Meta-Tags),
  `src/vite-env.d.ts` (Typen-Referenz für `virtual:pwa-register/react`),
  `src/app/layout/AppLayout.tsx` (Komponente einhängen), `package.json`
  (neue Dev-Dependencies + Icon-Script-Alias).

---

### Task 1: Dependencies installieren

**Files:**
- Modify: `package.json`, `package-lock.json` (automatisch durch `npm install`)

- [ ] **Step 1: `vite-plugin-pwa` und `sharp` als Dev-Dependencies installieren**

Run: `npm install -D vite-plugin-pwa sharp`

- [ ] **Step 2: Installation verifizieren**

Run: `npm ls vite-plugin-pwa sharp`
Expected: beide Pakete werden mit einer Versionsnummer aufgelistet, keine
`UNMET DEPENDENCY`-Fehler.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add vite-plugin-pwa and sharp dependencies"
```

---

### Task 2: PWA-Icons generieren

**Files:**
- Create: `scripts/generate-pwa-icons.mjs`
- Create: `public/icons/pwa-192x192.png`, `public/icons/pwa-512x512.png`,
  `public/icons/pwa-512x512-maskable.png`
- Modify: `package.json` (neuer `pwa:icons`-Script-Alias)

**Interfaces:**
- Produces: drei PNG-Dateien unter `public/icons/`, referenziert von
  `pwa.config.ts` (Task 3) im Manifest-`icons`-Array.

- [ ] **Step 1: Icon-Skript schreiben**

Create `scripts/generate-pwa-icons.mjs`:

```js
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SOURCE = "public/favicon-master.png";
const OUT_DIR = "public/icons";
const BACKGROUND = "#0d0f12";

async function generate() {
  await mkdir(OUT_DIR, { recursive: true });

  await sharp(SOURCE).resize(192, 192).toFile(`${OUT_DIR}/pwa-192x192.png`);
  await sharp(SOURCE).resize(512, 512).toFile(`${OUT_DIR}/pwa-512x512.png`);

  // Maskable-Icon braucht eine Safe Zone (~80% sichtbarer Inhalt, Rest
  // Hintergrundfarbe statt Transparenz), sonst schneiden Android-Launcher
  // das Motiv beim Masken zu stark an.
  const canvasSize = 512;
  const contentSize = Math.round(canvasSize * 0.8);
  const resizedContent = await sharp(SOURCE).resize(contentSize, contentSize).toBuffer();
  await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: BACKGROUND,
    },
  })
    .composite([{ input: resizedContent, gravity: "center" }])
    .png()
    .toFile(`${OUT_DIR}/pwa-512x512-maskable.png`);

  console.log(`PWA-Icons erzeugt in ${OUT_DIR}/`);
}

generate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Script-Alias in `package.json` ergänzen**

In `package.json` im `"scripts"`-Block, direkt nach `"lint"`, ergänzen:

```json
    "pwa:icons": "node scripts/generate-pwa-icons.mjs",
```

- [ ] **Step 3: Icons generieren**

Run: `npm run pwa:icons`
Expected: Konsolenausgabe `PWA-Icons erzeugt in public/icons/`, und die drei
Dateien existieren.

Run: `ls public/icons`
Expected: `pwa-192x192.png  pwa-512x512-maskable.png  pwa-512x512.png`

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-pwa-icons.mjs public/icons package.json
git commit -m "feat: generate PWA icon set from favicon-master.png"
```

---

### Task 3: `vite-plugin-pwa` konfigurieren (Manifest, Workbox, iOS-Tags)

**Files:**
- Create: `pwa.config.ts`
- Modify: `vite.config.ts`, `vitest.config.ts`, `index.html`,
  `src/vite-env.d.ts`

**Interfaces:**
- Produces: `pwaOptions` (aus `pwa.config.ts`), importiert von
  `vite.config.ts` und `vitest.config.ts`. Registriert die virtuellen Module
  `virtual:pwa-register` / `virtual:pwa-register/react`, die Task 4
  (`PwaUpdateWarning.tsx`) konsumiert.

- [ ] **Step 1: Geteilte PWA-Optionen schreiben**

Create `pwa.config.ts`:

```ts
import type { VitePWAOptions } from "vite-plugin-pwa";

export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: "prompt",
  injectRegister: false,
  manifest: {
    name: "RVTools Analyzer",
    short_name: "RVTools",
    description: "Lokales VMware-Infrastruktur-Dashboard für RVTools XLSX-Exporte",
    start_url: "/",
    display: "standalone",
    theme_color: "#0d0f12",
    background_color: "#0d0f12",
    icons: [
      { src: "/icons/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/pwa-512x512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  },
  workbox: {
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: "StaleWhileRevalidate",
        options: { cacheName: "google-fonts-stylesheets" },
      },
      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "google-fonts-webfonts",
          cacheableResponse: { statuses: [0, 200] },
          expiration: { maxAgeSeconds: 60 * 60 * 24 * 365, maxEntries: 30 },
        },
      },
    ],
  },
};
```

- [ ] **Step 2: Plugin in `vite.config.ts` registrieren**

In `vite.config.ts`, Import ergänzen:

```ts
import { VitePWA } from "vite-plugin-pwa";
import { pwaOptions } from "./pwa.config";
```

Die `plugins`-Zeile ändern von:

```ts
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
```

zu:

```ts
  plugins: [react(), mode === "development" && componentTagger(), VitePWA(pwaOptions)].filter(Boolean),
```

- [ ] **Step 3: Plugin auch in `vitest.config.ts` registrieren**

`vitest.config.ts` nutzt eine eigene, von `vite.config.ts` unabhängige
Plugin-Liste. Ohne diesen Schritt ist `virtual:pwa-register/react` unter
Vitest nicht auflösbar, und der Test aus Task 4 schlägt mit einem
Resolve-Fehler fehl (nicht mit einem Assertion-Fehler).

Import ergänzen:

```ts
import { VitePWA } from "vite-plugin-pwa";
import { pwaOptions } from "./pwa.config";
```

Die `plugins`-Zeile ändern von:

```ts
  plugins: [react()],
```

zu:

```ts
  plugins: [react(), VitePWA(pwaOptions)],
```

- [ ] **Step 4: Typen-Referenz für `virtual:pwa-register/react` ergänzen**

In `src/vite-env.d.ts`, nach der bestehenden
`/// <reference types="vite/client" />`-Zeile ergänzen:

```ts
/// <reference types="vite-plugin-pwa/react" />
```

- [ ] **Step 5: iOS-Meta-Tags in `index.html` ergänzen**

In `index.html`, direkt nach der bestehenden Zeile

```html
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
```

ergänzen:

```html
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
```

- [ ] **Step 6: Build verifizieren**

Run: `npm run build`
Expected: Build läuft durch, und im `dist/`-Ordner existieren zusätzlich
`sw.js`, `workbox-*.js` und `manifest.webmanifest`.

Run: `ls dist | grep -E "sw.js|workbox|manifest"`
Expected: alle drei Treffer werden aufgelistet.

- [ ] **Step 7: Typecheck verifizieren**

Run: `npm run typecheck`
Expected: keine Fehler (insbesondere keine Fehler zu
`virtual:pwa-register/react` oder `VitePWAOptions`).

- [ ] **Step 8: Commit**

```bash
git add pwa.config.ts vite.config.ts vitest.config.ts index.html src/vite-env.d.ts
git commit -m "feat: configure vite-plugin-pwa with manifest and font caching"
```

---

### Task 4: `PwaUpdateWarning`-Komponente (TDD)

**Files:**
- Create: `src/components/pwa/PwaUpdateWarning.tsx`
- Test: `src/components/pwa/PwaUpdateWarning.test.tsx`

**Interfaces:**
- Consumes: `useRegisterSW` aus `virtual:pwa-register/react` (bereitgestellt
  durch Task 3), `Button` aus `@/components/ui/button`
  (`variant="destructive"`, `size="sm"` bereits vorhanden, siehe
  `src/components/ui/button-variants.ts`), `AlertTriangle` aus
  `lucide-react`.
- Produces: `export function PwaUpdateWarning(): JSX.Element | null` — von
  Task 5 in `AppLayout.tsx` eingehängt.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

Create `src/components/pwa/PwaUpdateWarning.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRegisterSW } from "virtual:pwa-register/react";
import { PwaUpdateWarning } from "@/components/pwa/PwaUpdateWarning";

vi.mock("virtual:pwa-register/react", () => ({ useRegisterSW: vi.fn() }));

const mockedUseRegisterSW = vi.mocked(useRegisterSW);

describe("PwaUpdateWarning", () => {
  it("rendert nichts ohne ausstehendes Update", () => {
    mockedUseRegisterSW.mockReturnValue({
      needRefresh: [false, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    });

    const { container } = render(<PwaUpdateWarning />);

    expect(container).toBeEmptyDOMElement();
  });

  it("zeigt eine klickbare Warnung, wenn ein Update aussteht", () => {
    const updateServiceWorker = vi.fn();
    mockedUseRegisterSW.mockReturnValue({
      needRefresh: [true, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker,
    });

    render(<PwaUpdateWarning />);
    const button = screen.getByRole("button", { name: /neue version laden/i });
    fireEvent.click(button);

    expect(button).toBeInTheDocument();
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `npx vitest run src/components/pwa/PwaUpdateWarning.test.tsx`
Expected: FAIL — `Cannot find module '@/components/pwa/PwaUpdateWarning'`
(Komponente existiert noch nicht).

- [ ] **Step 3: Komponente implementieren**

Create `src/components/pwa/PwaUpdateWarning.tsx`:

```tsx
import { AlertTriangle } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";

export function PwaUpdateWarning() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <Button
      variant="destructive"
      size="sm"
      className="h-8 gap-1.5 px-2.5 text-xs"
      onClick={() => void updateServiceWorker(true)}
    >
      <AlertTriangle className="h-3.5 w-3.5" />
      Neue Version laden
    </Button>
  );
}
```

- [ ] **Step 4: Test ausführen, Erfolg bestätigen**

Run: `npx vitest run src/components/pwa/PwaUpdateWarning.test.tsx`
Expected: PASS (2 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/pwa/PwaUpdateWarning.tsx src/components/pwa/PwaUpdateWarning.test.tsx
git commit -m "feat: add persistent PWA update warning component"
```

---

### Task 5: In `AppLayout.tsx` einhängen

**Files:**
- Modify: `src/app/layout/AppLayout.tsx:1-10,24-26`

**Interfaces:**
- Consumes: `PwaUpdateWarning` aus Task 4 (`@/components/pwa/PwaUpdateWarning`).

- [ ] **Step 1: Import ergänzen**

In `src/app/layout/AppLayout.tsx`, nach der bestehenden Zeile

```ts
import { GlobalFilterControl } from "@/components/global-filter/GlobalFilterControl";
```

ergänzen:

```ts
import { PwaUpdateWarning } from "@/components/pwa/PwaUpdateWarning";
```

- [ ] **Step 2: Komponente vor `GlobalFilterControl` einhängen**

Die bestehende Zeile

```tsx
            <div className="flex items-center gap-2">
              <GlobalFilterControl />
```

ändern zu:

```tsx
            <div className="flex items-center gap-2">
              <PwaUpdateWarning />
              <GlobalFilterControl />
```

- [ ] **Step 3: Typecheck und volle Testsuite verifizieren**

Run: `npm run typecheck`
Expected: keine Fehler.

Run: `npx vitest run`
Expected: alle bestehenden Tests bleiben grün (kein bestehender Test rendert
`AppLayout` direkt, daher keine Anpassung an bestehenden Tests nötig).

- [ ] **Step 4: Commit**

```bash
git add src/app/layout/AppLayout.tsx
git commit -m "feat: wire PWA update warning into the global header"
```

---

### Task 6: Manuelle Verifikation (nicht automatisierbar)

**Files:** keine Code-Änderungen — reine Verifikation des Workbox-generierten
Service Workers, der sich sinnvoll nur manuell im echten Browser prüfen
lässt.

- [ ] **Step 1: Produktions-Build lokal servieren**

Run: `npm run build && npm run preview`
Expected: Server startet (Standard-Port aus `vite preview`, z. B. 4173).

- [ ] **Step 2: Manifest, Icons und Service-Worker-Registrierung prüfen**

In Chrome: Seite öffnen → DevTools → Tab "Application" → Abschnitt
"Manifest" prüft Name, Icons, `theme_color`/`background_color`; Abschnitt
"Service Workers" zeigt einen aktivierten Worker für die Origin.

- [ ] **Step 3: Installierbarkeit prüfen**

In Chrome: Adressleiste zeigt ein Installations-Icon, oder DevTools →
Lighthouse → Kategorie "Installable" liefert keine Fehler.

- [ ] **Step 4: Offline-Verhalten der App-Shell prüfen**

DevTools → Network-Tab → "Offline" aktivieren → Seite neu laden.
Expected: App-Shell lädt weiterhin (kein Netzwerkfehler-Bildschirm des
Browsers). Datenimport/-analyse selbst wird in diesem Schritt **nicht**
getestet (out of scope laut Spec).

- [ ] **Step 5: Update-Zyklus simulieren**

Mit dem Preview-Server-Tab weiterhin offen: in `pwa.config.ts` testweise
`description` im `manifest`-Objekt leicht ändern (z. B. ein Leerzeichen
anhängen), erneut `npm run build` ausführen, `npm run preview` neu starten.

Expected: im weiterhin offenen alten Tab erscheint nach kurzer Zeit
(spätestens beim nächsten Fokus-Wechsel des Tabs) die rote Pille "Neue
Version laden" links vom Filter-Icon im Header. Klick darauf lädt die Seite
neu und die Pille verschwindet.

Die Testweise vorgenommene Änderung an `pwa.config.ts` danach wieder
rückgängig machen (`git checkout -- pwa.config.ts`) — sie diente nur der
Verifikation.

- [ ] **Step 6: Ergebnis festhalten**

Keine Code-Änderung nötig, wenn alle Schritte wie erwartet funktionieren.
Bei Abweichungen: konkretes Fehlerbild notieren und vor Abschluss des Plans
beheben (z. B. Icon-Pfad falsch, `runtimeCaching`-Pattern greift nicht).

---

## Self-Review Notes

- **Spec-Abdeckung:** Manifest/Icons → Task 2+3; iOS-Meta-Tags → Task 3;
  Google-Fonts-Caching → Task 3; Update-Warnung inkl. Platzierung/Styling
  → Task 4+5; Fehlerbehandlung (kein SW-Support bricht nichts) → ergibt sich
  aus Workbox/`vite-plugin-pwa`-Feature-Detection, keine eigene Code-Änderung
  nötig, daher kein separater Task; Testing/Out-of-Scope → Task 4 (Unit-Test)
  + Task 6 (manuelle Checkliste).
- **Platzhalter-Scan:** keine TBD/TODO, jeder Schritt enthält konkreten Code
  oder ein konkretes Kommando mit erwartetem Ergebnis.
- **Typkonsistenz:** `pwaOptions` (Task 3) wird identisch in
  `vite.config.ts` und `vitest.config.ts` importiert; `PwaUpdateWarning`
  (Task 4) wird in Task 5 ohne Props aufgerufen, passend zur Signatur ohne
  Parameter aus Task 4.
