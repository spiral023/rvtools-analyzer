# In-App-Branding und Impressum – Design

## Ziel

Das neue RVTools-Analyzer-Logo wird in der App sichtbar eingesetzt. Zusätzlich erhält die Anwendung eine gut auffindbare Impressumsseite, die Zweck, lokale Datenverarbeitung und Verantwortlichkeit verständlich erklärt.

## Navigation und Branding

- Das Logo `public/favicon-master.png` ersetzt den bisherigen cyanfarbenen „RV“-Textblock oben links in der Sidebar.
- Die bestehende Wortmarke „RVTools / Analyzer“ bleibt rechts neben dem Logo erhalten.
- Ein neuer Sidebar-Punkt „Impressum“ mit `CircleInfo`-Symbol wird in einer eigenen Info-Gruppe unterhalb der bestehenden Navigation ergänzt.
- Die neue Route lautet `/impressum` und wird wie die übrigen Seiten lazy geladen.

## Seitenentwurf

Die Impressumsseite folgt einer technisch-redaktionellen Gestaltung, die zu den vorhandenen Anthrazit-/Cyan-Tokens passt:

1. Ein kompakter Markenbereich mit Logo, Titel „RVTools Analyzer“ und einer kurzen Erklärung des Anwendungszwecks.
2. Ein hervorgehobener Abschnitt „Ihre Daten bleiben lokal“, der Browser-Verarbeitung, Web Worker und IndexedDB verständlich erklärt.
3. Ein Verantwortlichkeitsbereich mit Name, Anschrift und klickbarer E-Mail-Adresse.

Die Seite bleibt responsiv, kontrastreich und ohne dekorative Animationen. Vorhandene Design-Tokens und UI-Komponenten werden wiederverwendet.

## Inhalt

Der RVTools Analyzer wertet RVTools-XLSX-Exporte lokal aus und stellt Infrastruktur-, Kapazitäts-, Performance-, Netzwerk-, Hardware- und Lifecycle-Informationen übersichtlich dar.

Die Datenschutzerklärung auf der Seite beschränkt sich auf technisch belegbare Aussagen:

- Importierte Dateien werden im Browser verarbeitet.
- Das Parsing läuft clientseitig in einem Web Worker.
- Aufbereitete Daten werden lokal in IndexedDB gespeichert.
- Die Anwendung überträgt die importierten RVTools-Inhalte nicht an ein eigenes Backend.
- Browserdaten können über die App oder die Browser-/Website-Einstellungen gelöscht werden.

Verantwortlich:

```text
Philipp Asanger
Karl-Renner-Str. 3
4040 Linz
Österreich
philipp.asanger@gmail.com
```

## Betroffene Dateien

- `src/app/layout/AppSidebar.tsx`: Logo und Navigationspunkt
- `src/App.tsx`: Lazy Import und Route
- `src/pages/Impressum.tsx`: neue Seite

## Qualitätssicherung

- Komponententest prüft zentrale Inhalte, Logo und E-Mail-Link der Impressumsseite.
- React Doctor wird nach den React-Änderungen ausgeführt.
- `npm run test`, `npm run lint` und `npm run build` müssen erfolgreich sein.
