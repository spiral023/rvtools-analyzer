# First-Run-Onboarding – Design

## Ziel

Der RVTools Analyzer erhält ein vierseitiges, animiertes Onboarding. Es öffnet sich automatisch nur beim ersten Aufruf in einem Browserprofil, stellt die wichtigsten Funktionen kompakt vor und ermöglicht direkt den Import mehrerer RVTools- und Tech-Info-Excel-Dateien. Im Impressum lässt sich die Tour jederzeit erneut starten.

Das Onboarding bleibt vollständig clientseitig. Es führt weder Backend- noch Serverabhängigkeiten ein und verarbeitet importierte Daten weiterhin ausschließlich im Browser.

## Grundentscheidungen

- Das Onboarding erscheint als großes modales Fokusfenster über der bestehenden App.
- Es umfasst genau vier Seiten und bleibt jederzeit überspringbar.
- Der Datei-Upload ist optional.
- Texte werden möglichst neutral und ohne direkte Anrede formuliert.
- Ein gestarteter Import läuft unabhängig von Seitenwechseln und vom Schließen des Onboardings weiter.
- Auf der letzten Seite darf das Onboarding auch geschlossen werden, solange ein Import noch läuft.
- Das Design folgt dem aktiven Light- oder Dark-Theme der App.

## Erstaufruf und Wiederaufruf

Ein versionierter `localStorage`-Eintrag speichert, ob das Onboarding übersprungen oder abgeschlossen wurde. Fehlt dieser Eintrag, öffnet sich das Onboarding nach dem clientseitigen App-Start automatisch. Überspringen, Escape, der Schließen-Button und der reguläre Abschluss gelten jeweils als gesehen und verhindern eine erneute automatische Anzeige.

Ein neuer Button „Onboarding erneut starten“ im Impressum öffnet die Tour auf Seite 1. Dieser manuelle Wiederaufruf verändert den gespeicherten Erstaufruf-Status nicht. Werden die Website-Daten des Browsers gelöscht, erscheint das Onboarding beim nächsten Aufruf wieder.

## Vierseitiger Ablauf

### 1. Willkommen

- Das Logo `public/favicon-master.png` ist das zentrale visuelle Element.
- Eine kurze Einleitung beschreibt den RVTools Analyzer als lokale Infrastruktur-Analyse.
- Das Local-first-Prinzip wird knapp und technisch korrekt erklärt: Verarbeitung im Browser, lokale Speicherung und kein eigenes Daten-Backend.
- Hauptaktion: „Tour starten“; sekundäre Aktion: „Überspringen“.

### 2. Daten importieren

- Eine großzügige Dropzone akzeptiert mehrere `.xlsx`- und `.xls`-Dateien per Drag-and-drop oder Dateiauswahl.
- Unterstützt werden RVTools, Tech-Info Server und Tech-Info Client. Die vorhandene Dateierkennung bestimmt den Typ jeder Datei.
- Der Import startet sofort nach der Auswahl. Fortschritt, aktueller Dateiname, Dateityp und Warnungen beziehungsweise Fehler werden sichtbar kommuniziert.
- „Weiter“ bleibt während des Imports aktiv. Ein Import ist keine Voraussetzung, um die Tour fortzusetzen.

### 3. Gezielt fokussieren

- Der globale Systemfilter steht im Mittelpunkt.
- Die Seite erklärt, dass RVTools- und Tech-Info-Felder gemeinsam in Filtergruppen kombiniert werden können.
- Alternativ lässt sich eine konkrete Liste von System- beziehungsweise VM-Namen angeben.
- Eine kompakte visuelle Filterformel zeigt beispielhaft die Verbindung von RVTools- und Tech-Info-Kriterien.
- Ein laufender Import bleibt als unaufdringliche Statuskapsel mit Prozentwert sichtbar.

### 4. Analysieren, verstehen und mitnehmen

Vier hervorgehobene Funktionskarten stellen die wichtigsten Werkzeuge vor:

1. Detailansichten für VMs, Hosts und Cluster.
2. Die Funktion „Durchschnittliche VM“ als typische Ressourcenbasis für Planung und Einordnung.
3. Host-Hardware-Varianten und Host-Netzwerk-Varianten für den strukturierten Vergleich.
4. Tabellenexport als Excel oder Markdown.

Eine ergänzende, bewusst kurze Zeile verweist auf weitere Bereiche wie Daily Ops, Capacity, Performance, Storage/Backup, Compliance/Lifecycle, Fleet Compare und Planung. Die Seite soll Funktionsbreite vermitteln, ohne zu einer vollständigen Featureliste zu werden.

Die Importstatuskapsel zeigt auf dieser Seite weiterhin „läuft“, „erfolgreich“, „mit Warnungen“ oder „fehlgeschlagen“. Die Hauptaktion „Analyse öffnen“ schließt das Onboarding und führt zur Übersicht. Bei einem noch laufenden Import bleibt diese Aktion verfügbar.

## Komponenten und Zuständigkeiten

### Onboarding-Status

Ein appweiter `OnboardingProvider` verwaltet:

- automatisches Öffnen beim Erstaufruf,
- manuelles Öffnen aus dem Impressum,
- aktuelle Seite und Navigationsrichtung,
- Schließen, Überspringen und Abschließen,
- den versionierten Persistenzschlüssel.

Der Provider liegt innerhalb der bestehenden globalen Provider-Struktur und stellt eine kleine, klar typisierte API bereit. Die modale Darstellung selbst bleibt in einer eigenständigen `OnboardingDialog`-Komponente. Die vier Seiten werden in fokussierte Unterkomponenten aufgeteilt, damit Inhalt, Navigation und Import voneinander unabhängig testbar bleiben.

### Gemeinsamer Import

Die derzeit in `UploadSnapshots.tsx` gebündelte UI- und Importsteuerung wird in einen gemeinsamen Import-Controller beziehungsweise `ImportProvider` überführt. Onboarding und Upload-Seite verwenden dieselbe Zustandsquelle für:

- Mehrfachauswahl und sequenzielle Verarbeitung,
- Dateityperkennung,
- Fortschritt und Ergebnis,
- Warnungen und Fehler,
- Toasts,
- Invalidierung der TanStack-Query-Daten nach Abschluss.

Der Importzustand lebt oberhalb der Onboarding-Seiten. Deshalb unterbrechen Weiterblättern, Zurückblättern und Schließen weder die laufende Promise-Kette noch die Fortschrittsanzeige. Die bestehende Upload-Seite behält ihre gespeicherten Uploads, Diagnose- und Löschfunktionen; nur der wiederverwendbare Importteil wird gemeinsam genutzt.

## Fenster, Navigation und Responsivität

- Desktop: ungefähr `90vw × 84vh`, mit einer Maximalbreite von 1.360 Pixeln.
- Kleine Displays: nahezu bildschirmfüllend, mit reduzierten Außenabständen.
- Kopfbereich, Seitennavigation, Importstatus und Aktionsleiste bleiben sichtbar.
- Nur der jeweilige Seiteninhalt scrollt.
- „Zurück“, „Weiter“, „Überspringen“ und Schließen sind klar erreichbar.
- Die Fortschrittsanzeige zeigt vier Schritte und den aktuellen Seitentitel.
- Fokus wird beim Seitenwechsel auf die neue Seitenüberschrift gesetzt, ohne Mausnutzer zu irritieren.

## Visuelle Richtung

Die Gestaltung folgt einer ruhigen, technischen „Kommandozentrale“. Sie nutzt großzügige Flächen, präzise Konturen, dezente Rasterstrukturen und ein einzelnes atmosphärisches Lichtfeld statt vieler dekorativer Effekte.

### Dark Theme

- tiefe Blau-Grau-Flächen aus den vorhandenen Background- und Card-Tokens,
- Cyan als klarer Primärakzent,
- helle technische Konturen und zurückhaltende Leuchteffekte.

### Light Theme

- helle, leicht kühle Background- und Card-Flächen,
- Graphit für Typografie und technische Linien,
- Cyan als präziser Akzent,
- subtile Rasterlinien und fein gestaffelte Schatten statt dunkler Leuchtflächen.

Komposition, Logo, Typografie und Animationen bleiben in beiden Themes identisch. Ein Theme-Wechsel bei geöffnetem Onboarding wird unmittelbar übernommen.

Für große Überschriften wird eine charaktervolle Editorial-Serifenschrift aus lokalen System-Fallbacks eingesetzt. Fließtext nutzt die vorhandene `DM Sans`, technische Labels und Statusangaben die vorhandene `JetBrains Mono`. Es werden keine extern geladenen Schriftarten benötigt.

## Animation

- Vorwärtswechsel bewegen die neue Seite leicht von rechts nach links; Rückwärtswechsel spiegeln die Richtung.
- Überschrift, Erklärung und Funktionskarten erscheinen in einer kurzen, gestaffelten Sequenz.
- Der Importstatus darf während der Verarbeitung ruhig pulsieren; Fortschrittswerte wechseln ohne auffällige Sprünge.
- Der erste Auftritt des Logos bildet den stärksten Animationsmoment. Weitere Bewegung bleibt zurückhaltend.
- Animationen werden mit CSS und vorhandenen Tailwind-Mitteln umgesetzt. Eine zusätzliche Animationsbibliothek ist nicht erforderlich.
- `prefers-reduced-motion` entfernt nicht notwendige Transformationen und Staffelungen.

## Fehler- und Statusverhalten

- Nicht unterstützte Dateien erzeugen eine verständliche Inline-Meldung und einen Toast.
- Fehler einer Datei stoppen nicht automatisch die gesamte Tour. Weitere Dateien werden entsprechend dem bestehenden Importverhalten verarbeitet.
- Warnungen und Fehler bleiben über Seitenwechsel hinweg im gemeinsamen Importzustand erhalten.
- Die Schlussseite bietet bei Fehlern eine erneute Dateiauswahl beziehungsweise einen klaren Verweis auf „Uploads & Snapshots“.
- Fortschritt wird mit Text, Prozentwert und Statussymbol vermittelt und nicht ausschließlich durch Farbe.
- Screenreader erhalten relevante Statusänderungen über eine zurückhaltende Live-Region.

## Barrierefreiheit

- Das bestehende Radix-Dialogverhalten stellt Fokusfalle, Escape-Unterstützung und Rückgabe des Fokus sicher.
- Alle Aktionen sind per Tastatur erreichbar und besitzen sichtbare Fokusrahmen.
- Überschriftenstruktur, Dialogtitel und Dialogbeschreibung sind semantisch verknüpft.
- Dropzone und verstecktes Dateifeld besitzen eindeutige Beschriftungen.
- Text- und Statuskontraste werden in Light und Dark Theme geprüft.
- Seitenwechsel dürfen keine Information ausschließlich durch Animation vermitteln.

## Betroffene Bereiche

- `src/App.tsx`: neue globale Provider beziehungsweise Einbindung des Onboardings.
- `src/pages/UploadSnapshots.tsx`: Nutzung des gemeinsamen Import-Controllers.
- `src/pages/Impressum.tsx`: Button zum erneuten Starten.
- neue Onboarding-Komponenten unter einem fokussierten Verzeichnis in `src/components/`.
- neuer appweiter Import- und Onboarding-Status unter `src/hooks/` oder einem passenden Context-Verzeichnis.
- `src/index.css` beziehungsweise `tailwind.config.ts`: gezielte Keyframes und reduzierte Bewegung, soweit erforderlich.

Das Domain-Modell und das IndexedDB-Schema ändern sich nicht. Es ist keine Erhöhung von `DB_VERSION` erforderlich.

## Qualitätssicherung

Komponententests prüfen:

- automatisches Öffnen ohne Persistenzeintrag,
- keine automatische Anzeige nach Überspringen oder Abschluss,
- manuellen Wiederaufruf aus dem Impressum,
- Navigation, Schließen und Tastaturbedienung,
- Mehrfachauswahl und ungültige Dateien,
- Fortschritt über Seitenwechsel hinweg,
- Schließen während eines Imports,
- Erfolg, Warnungen und Fehler,
- reduzierte Bewegung und grundlegende Theme-Reaktion.

Nach der Implementierung werden mindestens `npm run test`, `npm run lint` und `npm run build` ausgeführt. Für die responsive und visuelle Qualität werden Light und Dark Theme auf Desktop- und kleinen Viewports geprüft.
