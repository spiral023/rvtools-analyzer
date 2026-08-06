# 001 — Theme-Wechsel als kreisförmige Aufblende vom Schalter animieren

- **Status**: TODO
- **Commit**: 268cd66
- **Severity**: MEDIUM
- **Category**: 8 — Missed opportunities (sekundär: 3 Physicality & origin, 7 Cohesion & tokens)
- **Estimated scope**: 2 Dateien (`src/app/layout/ThemeProvider.tsx`, `src/index.css`), ca. 90 geänderte/neue Zeilen

## Problem

Der Wechsel zwischen Dark und Light Mode ist ein harter Schnitt über die gesamte
Viewport-Fläche. `ThemeProvider` tauscht die Klasse auf `<html>` in einem Effect,
und es existiert **keine** Transition auf den Farb-Tokens:

```tsx
// src/app/layout/ThemeProvider.tsx:27-41 — aktuell
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.remove("dark");
      root.classList.add("light");
    } else {
      root.classList.add("dark");
      root.classList.remove("light");
    }
    try {
      localStorage.setItem("rvtools-theme", theme);
    } catch {
      // localStorage not available
    }
  }, [theme]);
```

```tsx
// src/app/layout/ThemeProvider.tsx:43 — aktuell
  const toggleTheme = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
```

Alle Farben in `src/index.css:6-95` sind HSL-Custom-Properties auf `:root` bzw. `.light`.
Beim Klassentausch springen dadurch Hintergrund, Karten, Rahmen, Charts und Text in
**einem** Frame um. Bei einem dunklen Dashboard, das auf `--background: 222 15% 6%`
gegen `220 20% 97%` wechselt, ist das ein Vollflächen-Helligkeitssprung — genau der
"jarring state change", den Kategorie 8 des Audits als fehlende Animation ausweist.

Zusätzlich fehlt jeder räumliche Bezug: der Wechsel wird von einem konkreten Schalter
ausgelöst (drei Fundstellen, siehe unten), aber die Zustandsänderung hat keinen
sichtbaren Ursprung.

Auslösende Schalter (werden in diesem Plan **nicht** geändert, nur zur Orientierung):

- `src/app/layout/AppLayout.tsx:55-67` — Header-Button, `onClick={toggleTheme}`
- `src/components/startscreen/StartScreen.tsx:163-171` — Footer-Button, `onClick={toggleTheme}`
- `src/components/startscreen/StartScreenPageFrame.tsx:23-30` — Header-Button, `onClick={toggleTheme}`

Ergänzend fehlen dem Repo Motion-Tokens: Kurven und Dauern sind über `src/index.css`
handgetippt (`120ms ease`, `180ms ease`, `200ms ease`, `460ms cubic-bezier(0.22, 1, 0.36, 1)`).
Dieser Plan legt die ersten geteilten Tokens an, damit die neue Animation nicht die
fünfte Variante wird.

## Target

Der Klick auf einen Theme-Schalter startet eine View Transition. Das alte Theme bleibt
als Schnappschuss liegen, das neue Theme flutet als **Kreis vom Klickpunkt** darüber.
Keine Inhalte bewegen sich, es wird ausschließlich eine `clip-path`-Maske animiert.

Zielwerte, exakt so zu verwenden:

- Dauer: `480ms` (Vollflächen-Reveal, seltene Interaktion → im Budget "Modals/Drawers 200–500ms")
- Kurve: `cubic-bezier(0.23, 1, 0.32, 1)` (starkes `ease-out`; der Reveal ist ein Entrance)
- Ursprung: Klickkoordinaten; bei Tastaturauslösung (`detail === 0`) Viewport-Mitte
- Endradius: `Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))`
- Fallback ohne View-Transitions-Support: `260ms` Farb-Crossfade, der **nur während**
  des Wechsels aktiv ist
- `prefers-reduced-motion: reduce`: sofortiger Tausch, keine Animation

Ziel-CSS (Tokens):

```css
/* target — src/index.css, im :root-Block */
    /* Motion-Tokens: themeunabhängig, deshalb absichtlich nicht in .light gespiegelt. */
    --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
    --duration-theme-reveal: 480ms;
    --duration-theme-fade: 260ms;
```

Ziel-CSS (View Transition, auf Dokumentebene):

```css
/* target — src/index.css, oberste Ebene */
::view-transition-old(root),
::view-transition-new(root) {
  animation: none;
  mix-blend-mode: normal;
}

::view-transition-old(root) { z-index: 0; }
::view-transition-new(root) { z-index: 1; }

html[data-theme-reveal]::view-transition-new(root) {
  animation: theme-reveal var(--duration-theme-reveal) var(--ease-out) forwards;
}

@keyframes theme-reveal {
  from { clip-path: circle(0 at var(--theme-reveal-x) var(--theme-reveal-y)); }
  to { clip-path: circle(var(--theme-reveal-r) at var(--theme-reveal-x) var(--theme-reveal-y)); }
}
```

Ziel-CSS (Fallback):

```css
/* target — src/index.css, oberste Ebene */
html[data-theme-fade],
html[data-theme-fade] * {
  transition:
    background-color var(--duration-theme-fade) ease,
    border-color var(--duration-theme-fade) ease,
    color var(--duration-theme-fade) ease,
    fill var(--duration-theme-fade) ease !important;
}
```

## Repo conventions to follow

- **Farb- und Radius-Tokens** stehen in `src/index.css:6-95` innerhalb von `@layer base`
  im `:root`-Block; `.light` überschreibt dort nur Farben. Die neuen Motion-Tokens
  gehören in `:root`, direkt unter `--radius: 0.5rem;` (Zeile 26).
- **Rohe Keyframes und Media-Queries** stehen bewusst **außerhalb** der `@layer`-Blöcke
  am Dateiende — Exemplar: `src/index.css:487-497` (`@keyframes startscreen-rise`,
  `@keyframes startscreen-scan`). Die neuen Regeln kommen ebenfalls dorthin.
- **`prefers-reduced-motion`** wird in einem einzigen gemeinsamen Block gepflegt:
  `src/index.css:499-522`. Dort ergänzen, keinen zweiten Block anlegen.
- **Kommentare in `src/index.css` und in Layout-Dateien sind deutsch** und erklären das
  *Warum*, nicht das *Was* — Exemplar: `src/index.css:132-137` und `src/index.css:156`.
- **Keine neuen Dependencies**: das Projekt hat keine Motion-Library (kein Framer Motion),
  Bewegung ist ausschließlich CSS + `tailwindcss-animate`. Siehe `package.json:22-59`.
- `flushSync` kommt aus `react-dom` (React 18.3, siehe `package.json:52-53`).

## Steps

### Schritt 1 — Motion-Tokens in `src/index.css` ergänzen

In `src/index.css` nach Zeile 26 (`--radius: 0.5rem;`) und vor der Leerzeile zu
`--success` einfügen:

```css
    --radius: 0.5rem;

    /* Motion-Tokens: themeunabhängig, deshalb absichtlich nicht in .light gespiegelt. */
    --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
    --duration-theme-reveal: 480ms;
    --duration-theme-fade: 260ms;
```

Nichts anderes im `:root`-Block ändern. `.light` **nicht** anfassen.

### Schritt 2 — View-Transition-Regeln in `src/index.css` anlegen

Direkt **nach** `@keyframes startscreen-scan { … }` (endet in Zeile 497) und **vor**
dem `@media (prefers-reduced-motion: reduce)`-Block (beginnt Zeile 499) einfügen:

```css
/*
 * Theme-Wechsel: das alte Theme bleibt als Schnappschuss liegen, das neue flutet als
 * Kreis vom angeklickten Schalter darüber. Animiert wird nur eine clip-path-Maske auf
 * einem statischen View-Transition-Snapshot – die Inhalte selbst bewegen sich nicht.
 * Die Koordinaten setzt der ThemeProvider einmalig vor dem Start, sie werden nicht
 * pro Frame aktualisiert.
 */
::view-transition-old(root),
::view-transition-new(root) {
  animation: none;
  mix-blend-mode: normal;
}

::view-transition-old(root) { z-index: 0; }
::view-transition-new(root) { z-index: 1; }

html[data-theme-reveal]::view-transition-new(root) {
  animation: theme-reveal var(--duration-theme-reveal) var(--ease-out) forwards;
}

@keyframes theme-reveal {
  from { clip-path: circle(0 at var(--theme-reveal-x) var(--theme-reveal-y)); }
  to { clip-path: circle(var(--theme-reveal-r) at var(--theme-reveal-x) var(--theme-reveal-y)); }
}

/*
 * Fallback für Browser ohne View Transitions: kurzer Farb-Crossfade. Bewusst über das
 * Attribut gesteuert und nach dem Wechsel wieder entfernt – eine dauerhafte Transition
 * auf * würde jede Hover-Rückmeldung der App verlangsamen.
 */
html[data-theme-fade],
html[data-theme-fade] * {
  transition:
    background-color var(--duration-theme-fade) ease,
    border-color var(--duration-theme-fade) ease,
    color var(--duration-theme-fade) ease,
    fill var(--duration-theme-fade) ease !important;
}
```

### Schritt 3 — Reduced-Motion-Block erweitern

Im bestehenden Block `@media (prefers-reduced-motion: reduce)` in `src/index.css`
(beginnt Zeile 499) als letzte Regeln vor der schließenden Klammer ergänzen:

```css
  /* Doppelte Absicherung: der ThemeProvider überspringt die View Transition bereits. */
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation: none !important;
  }

  html[data-theme-fade],
  html[data-theme-fade] * {
    transition: none !important;
  }
```

Die vorhandenen Regeln in diesem Block unverändert lassen.

### Schritt 4 — `src/app/layout/ThemeProvider.tsx` ersetzen

Die Datei vollständig durch folgenden Inhalt ersetzen:

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

type Theme = "dark" | "light";

/**
 * Strukturell kompatibel mit React.MouseEvent: die Schalter übergeben ihr Klick-Event
 * unverändert (`onClick={toggleTheme}`), daraus entsteht der Mittelpunkt der Aufblende.
 */
type ThemeToggleOrigin = { clientX: number; clientY: number; detail?: number };

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: (origin?: ThemeToggleOrigin) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggleTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

const REVEAL_ATTR = "data-theme-reveal";
const FADE_ATTR = "data-theme-fade";
/** Muss zu --duration-theme-fade in src/index.css passen. */
const FADE_MS = 260;

function applyThemeClass(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("light", theme === "light");
  root.classList.toggle("dark", theme === "dark");
}

function prefersReducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem("rvtools-theme");
      return stored === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });

  // Läuft gerade eine Aufblende? Schnelles Doppelklicken startet dann keine zweite,
  // sondern schaltet sofort – gestapelte halbe Reveals sähen kaputt aus.
  const revealRunningRef = useRef(false);

  useEffect(() => {
    applyThemeClass(theme);
    try {
      localStorage.setItem("rvtools-theme", theme);
    } catch {
      // localStorage not available
    }
  }, [theme]);

  const toggleTheme = useCallback(
    (origin?: ThemeToggleOrigin) => {
      const next: Theme = theme === "dark" ? "light" : "dark";
      const root = document.documentElement;

      // Der Klassentausch muss synchron im View-Transition-Callback passieren, damit der
      // Browser den neuen Zustand im selben Snapshot erfasst.
      const commit = () => {
        applyThemeClass(next);
        flushSync(() => setTheme(next));
      };

      const startViewTransition = (
        document as unknown as {
          startViewTransition?: (callback: () => void) => { finished: Promise<void> };
        }
      ).startViewTransition?.bind(document);

      if (revealRunningRef.current || prefersReducedMotion()) {
        commit();
        return;
      }

      if (!startViewTransition) {
        root.setAttribute(FADE_ATTR, "");
        commit();
        window.setTimeout(() => root.removeAttribute(FADE_ATTR), FADE_MS);
        return;
      }

      // Tastaturauslösung liefert detail === 0 und keine brauchbaren Koordinaten –
      // dann blendet der Kreis symmetrisch aus der Viewport-Mitte auf.
      const fromPointer = origin !== undefined && origin.detail !== 0;
      const x = fromPointer ? origin.clientX : window.innerWidth / 2;
      const y = fromPointer ? origin.clientY : window.innerHeight / 2;
      const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

      root.style.setProperty("--theme-reveal-x", `${x}px`);
      root.style.setProperty("--theme-reveal-y", `${y}px`);
      root.style.setProperty("--theme-reveal-r", `${radius}px`);
      root.setAttribute(REVEAL_ATTR, "");
      revealRunningRef.current = true;

      const cleanup = () => {
        revealRunningRef.current = false;
        root.removeAttribute(REVEAL_ATTR);
      };

      startViewTransition(commit).finished.then(cleanup, cleanup);
    },
    [theme],
  );

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
```

### Schritt 5 — Aufrufstellen prüfen, nicht ändern

`onClick={toggleTheme}` in `src/app/layout/AppLayout.tsx:58`,
`src/components/startscreen/StartScreen.tsx:165` und
`src/components/startscreen/StartScreenPageFrame.tsx:25` funktioniert unverändert:
`React.MouseEvent` ist strukturell auf `ThemeToggleOrigin` zuweisbar. Nur prüfen, dass
`npm run typecheck` diese drei Stellen nicht beanstandet. **Keine Edits** dort.

## Boundaries

- Nur `src/index.css` und `src/app/layout/ThemeProvider.tsx` anfassen.
- Die drei Schalter-Komponenten (`AppLayout.tsx`, `StartScreen.tsx`,
  `StartScreenPageFrame.tsx`) **nicht** ändern — auch nicht das Sun/Moon-Icon.
- **Kein** `view-transition-name` an irgendein Element außer dem impliziten `root`
  setzen. Zwei gleichzeitig gemountete Elemente mit gleichem Namen brechen die
  Transition.
- Keine Farb-Tokens in `:root` oder `.light` ändern, keine bestehende Transition oder
  Dauer in `src/index.css` umschreiben (das ist Thema eines eigenen Plans).
- Keine neuen Dependencies, kein `next-themes` (liegt in `package.json`, wird nur von
  `src/components/ui/sonner.tsx` genutzt und ist hier ausdrücklich außerhalb des Scopes).
- Keine dauerhafte `transition`-Regel auf `*` — der Fallback ist attributgesteuert und
  muss nach `FADE_MS` wieder verschwinden.
- Wenn ein Schritt nicht zum vorgefundenen Code passt (Drift seit Commit `268cd66`):
  **stoppen und melden**, nicht improvisieren.

## Verification

- **Mechanisch**:
  - `npm run typecheck` — muss ohne Fehler durchlaufen (achte besonders auf die drei
    `onClick={toggleTheme}`-Stellen).
  - `npm run lint` — keine neuen Findings.
  - `npm run test` — muss grün bleiben. Relevant sind
    `src/components/startscreen/StartScreen.test.tsx` und
    `src/hooks/useTableDisplayPreferences.test.tsx`. In jsdom gibt es kein
    `document.startViewTransition`, der Test läuft also über den Fallback-Pfad;
    `window.matchMedia` ist in `src/test/setup.ts:15-27` mit `matches: false` gemockt.

- **Feel check** (`npm run dev`, App läuft auf **Port 8080**, nicht 5173):
  - Theme-Schalter oben rechts im Header klicken: das neue Theme muss als Kreis
    **genau unter dem Mauszeiger** beginnen, nicht in der Bildschirmmitte und nicht
    oben links.
  - In beide Richtungen prüfen (dunkel → hell und hell → dunkel). Der Reveal ist
    absichtlich in beide Richtungen gleich: das neue Theme flutet über das alte.
  - Während der Aufblende darf **nichts** verrutschen — keine Textsprünge, kein
    Nachrücken von Tabellenzeilen. Wenn sich Inhalte bewegen, ist versehentlich eine
    zweite View Transition oder ein zusätzliches `view-transition-name` im Spiel.
  - Auf einer datenreichen Seite testen (Dashboard mit Charts und einer großen,
    virtualisierten Tabelle). Der erste Frame nach dem Klick darf nicht sichtbar
    hängen; wenn doch, in DevTools → Performance eine Aufnahme über den Klick machen
    und den Snapshot-Cost notieren, statt die Dauer zu verkürzen.
  - Chrome DevTools → Animations, Playback auf 10% stellen: der Kreisrand muss eine
    saubere Kante sein und am Ende **alle vier Viewport-Ecken** überdecken (kein
    dunkler Restkeil in einer Ecke).
  - Den Schalter fünfmal schnell hintereinander klicken: die Reveals dürfen sich nicht
    stapeln, spätere Klicks schalten sofort um. Kein halb aufgeblendeter Kreis bleibt
    stehen.
  - Mit `Tab` auf den Schalter fokussieren und mit `Enter` bzw. `Leertaste` auslösen:
    der Kreis startet aus der Viewport-Mitte (nicht aus der linken oberen Ecke).
  - DevTools → Rendering → "Emulate CSS prefers-reduced-motion: reduce": der Wechsel
    muss sofort erfolgen, ganz ohne Aufblende. Bei einem Vollflächen-Helligkeitswechsel
    ist der harte Schnitt hier die schonendere Variante.
  - Nach Abschluss prüfen: `document.documentElement` trägt **kein**
    `data-theme-reveal` und kein `data-theme-fade` mehr (Elements-Panel oder
    `document.documentElement.attributes` in der Konsole).
  - Seite neu laden: das gewählte Theme bleibt erhalten (`localStorage`-Key
    `rvtools-theme`) und beim Erstladen läuft **keine** Aufblende.

- **Done when**: Typecheck, Lint und Tests sind grün; die Aufblende startet am
  Klickpunkt, deckt den Viewport vollständig ab, verschiebt keine Inhalte, hinterlässt
  keine Attribute auf `<html>`, und bei `prefers-reduced-motion: reduce` sowie bei
  schnellem Mehrfachklicken schaltet das Theme ohne Animation um.
