# RVTools Analyzer als installierbare PWA

## Problem

Die App ([vite.config.ts](../../../vite.config.ts), React + Vite, Deployment
über Cloudflare Pages) läuft ausschließlich clientseitig: XLSX-Import,
Aufbereitung und Speicherung passieren komplett im Browser
([src/data/db/index.ts](../../../src/data/db/index.ts), IndexedDB), es gibt
keine eigene API. Trotzdem lässt sie sich nur als Browser-Tab öffnen — kein
Icon im Startmenü/Desktop, kein eigenes Fenster ohne Browser-Chrome. Für ein
Tool, das Nutzer wiederkehrend wie eine Desktop-Anwendung öffnen, ist das ein
unnötiger Umweg.

## Ziel

Die App wird installierbar (Web App Manifest + Service Worker), ohne einen
Anspruch auf vollständiges Offline-Arbeiten mit neuen Daten zu erheben. Kern
ist: Icon/Startmenü-Eintrag, eigenes Fenster (`display: standalone`), und ein
kontrollierter Update-Mechanismus, der Nutzer nie unbemerkt auf einer
veralteten Version hängen lässt. Als Nebeneffekt des Standard-Workbox-
Precachings lädt die App-Shell auch offline, das wird aber nicht als Feature
beworben oder getestet.

## Bausteine

### 1. Manifest & Icons

- **Plugin:** [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) (Workbox-
  basiert) als neue Dev-Dependency, in [vite.config.ts](../../../vite.config.ts)
  registriert. Strategie `generateSW` — kein individuelles Caching von API-
  Calls nötig, da die App keine eigene API hat.
- **Manifest** (per Plugin-Option `manifest`, kein separates
  `manifest.webmanifest` von Hand): `name: "RVTools Analyzer"`,
  `short_name: "RVTools"`, `description` analog zum bestehenden
  `<meta name="description">` in [index.html](../../../index.html),
  `display: "standalone"`, `start_url: "/"`, `theme_color`/`background_color`
  auf `#0d0f12` (bereits bestehender `<meta name="theme-color">`-Wert).
- **Icons:** einmaliges Node-Skript `scripts/generate-pwa-icons.mjs`
  (`sharp` als Dev-Dependency) erzeugt aus
  [public/favicon-master.png](../../../public/favicon-master.png)
  (1254×1254, ausreichend groß) drei Dateien in `public/icons/`:
  `pwa-192x192.png`, `pwa-512x512.png` und `pwa-512x512-maskable.png`
  (mit Sicherheitsabstand für den maskable-Zuschnitt). Das Skript läuft
  einmalig lokal, die erzeugten PNGs werden committet — kein Teil der
  Build-Pipeline. Bei zukünftigem Rebranding kann es erneut ausgeführt
  werden.
- **iOS:** `<meta name="apple-mobile-web-app-capable" content="yes">` und
  `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
  in `index.html` ergänzt, da Safari keinen Install-Prompt kennt, aber diese
  Tags für einen sauberen Standalone-Look bei „Zum Home-Bildschirm" braucht.
  Das bestehende `apple-touch-icon` bleibt unverändert.
- **Google Fonts:** `runtimeCaching`-Regel (StaleWhileRevalidate) für die
  bestehenden `fonts.googleapis.com`/`fonts.gstatic.com`-Requests aus
  `index.html`, damit die Schrift nach dem ersten Laden auch offline
  greift. Kein zusätzlicher Aufwand, da Standard-Workbox-Recipe.

### 2. Update-Warnung

- **Neue Komponente** `src/components/pwa/PwaUpdateWarning.tsx`, nutzt den
  `useRegisterSW`-Hook aus `virtual:pwa-register/react` (React-Bindung von
  vite-plugin-pwa, `registerType: "prompt"` — kein `skipWaiting`/
  `clientsClaim` ohne Nutzerinteraktion).
- **Darstellung:** Solange `needRefresh === false`, rendert die Komponente
  `null`. Wird eine neue Version erkannt, erscheint eine rote Pille
  (`bg-destructive text-destructive-foreground`, `AlertTriangle`-Icon aus
  `lucide-react`, Text „Neue Version laden") als Button.
- **Platzierung:** in [AppLayout.tsx](../../../src/app/layout/AppLayout.tsx),
  in der rechten Header-Button-Gruppe, direkt **vor** `<GlobalFilterControl />`
  (also links vom Filter-Icon) — global auf jeder Seite sichtbar, unabhängig
  vom `snapshots.length === 0`-Zustand.
- **Persistenz:** kein Auto-Dismiss, kein Timeout. Bleibt sichtbar, bis der
  Nutzer klickt oder die Seite anderweitig neu lädt.
- **Klick-Verhalten:** ruft die von `useRegisterSW` zurückgegebene
  `updateServiceWorker(true)`-Funktion auf → aktiviert den neuen Service
  Worker und lädt neu.
- **Kein Offline-Ready-Hinweis:** bewusst weggelassen (YAGNI) — es gibt für
  dieses Feature keinen etablierten Toast-Mechanismus, und der Hinweis wäre
  rein kosmetisch.
- **Keine Polling-Logik:** Erkennung neuer Versionen läuft über den
  Standard-Workbox-Zyklus (Service Worker prüft beim Navigations-/Fetch-
  Ereignis), kein zusätzlicher Timer.

## Fehlerbehandlung

- Browser ohne Service-Worker-Unterstützung: `vite-plugin-pwa`/Workbox
  feature-detected `navigator.serviceWorker` selbst; ohne Unterstützung
  bleibt die App exakt wie heute nutzbar, nur ohne Installierbarkeit.
- Fehlschlägt die SW-Registrierung (z. B. gesperrte Unternehmens-Policy):
  kein Fehler-UI, die App funktioniert weiter wie ein normaler Tab.

## Out of Scope (YAGNI)

- Push-Benachrichtigungen, Background-Sync.
- Vollständiges Offline-Caching von Anwendungsdaten über den Precache der
  App-Shell hinaus. Import/Analyse bleibt clientseitig und funktioniert
  dadurch eventuell als Nebeneffekt auch offline, das wird aber nicht
  garantiert oder getestet.
- Eigene Splashscreens — die vom Betriebssystem aus Manifest/Icon generierten
  Standard-Splashscreens reichen.
- Automatisierte Service-Worker-Update-Tests in CI (Workbox-generierter Code
  lässt sich sinnvoll nur manuell verifizieren).
- Änderungen an `public/_redirects`/dem bestehenden SPA-Fallback — der
  Service Worker arbeitet zusätzlich zum bestehenden Cloudflare-Pages-Setup,
  nicht als Ersatz.

## Testing

- **Unit-Test** für `PwaUpdateWarning.tsx`: `virtual:pwa-register/react`
  gemockt (Vitest + Testing-Library, passend zum bestehenden Testmuster).
  Prüft: bei `needRefresh === false` wird nichts gerendert; bei `true`
  erscheint die rote Pille mit Text „Neue Version laden"; Klick ruft
  `updateServiceWorker(true)` auf.
- **Manuelle Verifikation** (nicht sinnvoll automatisierbar, da
  Workbox-generierter Service Worker):
  - `npm run build && npm run preview`, Chrome DevTools → Application-Tab:
    Manifest-Felder, Icons, Service-Worker-Registrierung prüfen.
  - Lighthouse-Installability-Check besteht.
  - Installation testen (Chrome-Adressleiste-Icon bzw. „App installieren").
  - Offline-Reload testen (DevTools „Offline"): App-Shell lädt weiterhin.
  - Update-Zyklus simulieren: Build-Inhalt minimal ändern, erneut builden,
    `preview` neu starten, Tab mit alter Version offen lassen — rote Pille
    muss erscheinen, Klick lädt neue Version.
