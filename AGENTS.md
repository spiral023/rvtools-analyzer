# AGENTS.md

## Zweck
Diese Datei beschreibt verbindliche Arbeitsregeln für Agenten in diesem Repository.
Ziel ist, Änderungen konsistent, sicher und wartbar umzusetzen.

## Projektüberblick
- Name: RVTools Analyzer (Frontend-only, local-first)
- Stack: Vite, React 18, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query/Table/Virtual, Recharts
- Datenspeicherung: ausschließlich lokal im Browser (IndexedDB über `idb`), kein Backend
- Kernfunktion: Import von RVTools-XLSX, Normalisierung der Daten und Analyse-Dashboards pro Snapshot/vCenter

## Wichtige Verzeichnisse
- `src/App.tsx`: globale Provider + Routing
- `src/pages/*`: Seiten pro Analysebereich
- `src/app/layout/*`: Layout, Sidebar, Theme
- `src/domain/models/types.ts`: zentrale Domain-Typen
- `src/domain/services/importService.ts`: Import-Pipeline (inkl. Progress)
- `src/workers/parser.worker.ts`: XLSX-Parsing im Web Worker
- `src/data/db/index.ts`: IndexedDB-Schema, Query- und Delete-Helper
- `src/hooks/useActiveSnapshots.ts`: datengetriebene Hooks mit TanStack Query
- `src/components/ui/*`: UI-Bausteine (shadcn)

## Entwicklungsbefehle
- `npm run dev`: lokaler Dev-Server
- `npm run build`: Production-Build
- `npm run preview`: Build lokal prüfen
- `npm run test`: Vitest Tests ausführen
- `npm run lint`: ESLint ausführen

## Architektur- und Änderungsregeln
- Änderungen am Datenmodell immer in `src/domain/models/types.ts` starten und danach Service/DB/Hooks synchron halten.
- Neue Seiten müssen an zwei Stellen eingehängt werden:
  - Route in `src/App.tsx`
  - Navigation in `src/app/layout/AppSidebar.tsx`
- Datenzugriff nach Möglichkeit über die bestehenden Hooks in `src/hooks/useActiveSnapshots.ts` umsetzen, nicht ad hoc direkt in jeder Seite.
- Import-Logik im Browser halten (Worker + IndexedDB). Keine Serverabhängigkeit einführen.
- Bei Schemaänderungen in IndexedDB `DB_VERSION` erhöhen und Migration in `src/data/db/index.ts` pflegen.
- `@/*`-Alias verwenden statt tiefer relativer Pfade, wenn möglich.

## UI- und UX-Regeln
- Bestehende Design-Tokens aus `src/index.css` und `tailwind.config.ts` weiterverwenden.
- Für wiederkehrende Tabellen die `VirtualTable` nutzen, damit große Datenmengen performant bleiben.
- Bei Zahlen/Datumsformaten den bestehenden deutschen Kontext beachten (`de-DE` wird bereits verwendet).
- Warnungen/Fehler im Importfluss klar sichtbar halten (Progress, Toasts, Ergebnis-Card).

## Qualitätssicherung
- Nach Änderungen an produktivem Code mindestens `npm run test` ausführen.
- Bei betroffenen TS/React-Dateien zusätzlich `npm run lint` ausführen und neue Lint-Probleme vermeiden.
- Bereits bestehende Lint-Baustellen nur dann anfassen, wenn sie im Scope der Änderung liegen.

## Sprach- und Encoding-Regeln
- Dateien und Inhalte immer als UTF-8 pflegen.
- Umlaute normal schreiben: `ü`, `ä`, `ö`, `ß` statt Umschreibungen wie `ue`, `ae`, `oe`, `ss`, sofern fachlich sinnvoll.
- UI-Texte konsistent halten (bestehende Mischung aus deutschen und englischen Begriffen nicht ohne Grund umstellen).

## Nicht-Ziele
- Keine unnötigen Framework-Wechsel oder großflächigen Refactors ohne klaren Auftrag.
- Keine Einführung eines Backends für Persistenz; der aktuelle Ansatz ist bewusst lokal.
