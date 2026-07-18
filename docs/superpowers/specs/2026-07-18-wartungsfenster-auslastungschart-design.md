# Wartungsfenster-Auslastungschart – Design

## Ziel

Unterhalb der Kennzahlen auf `/wartungsfenster` zeigt ein Chart, wie viele Systeme zu welcher Uhrzeit ihr Wartungsfenster haben. Anwender können zwischen Tag-, Wochen- und Monatsansicht umschalten; die aktuelle Uhrzeit ist im Chart markiert.

Dies ist die im ursprünglichen Wartungsfenster-Spec (`docs/superpowers/specs/2026-07-17-wartungsfenster-design.md`) vorgemerkte Graphfunktion: "Die spätere Graphfunktion kann je System die zugeordnete Definition auflösen und die 336 Slots summieren." Die dafür nötige Datenbasis (`weeklySlots`, `calendarRules`, `assignMaintenanceWindows`) existiert bereits unverändert und wird nur um eine Zeitachsen-Auswertung ergänzt.

## Umfang

- Neue reine Logikfunktionen zur Aggregation von Systemanzahl pro Zeit-Slot über einen Datumsbereich
- Neue Chart-Komponente mit Umschalter Tag/Woche/Monat, direkt unterhalb der bestehenden KPI-Grid in `MaintenanceWindows.tsx`
- Markierung der aktuellen Uhrzeit im Chart
- Aggregation berücksichtigt echte Kalenderdaten inkl. Monatsregeln (z. B. "1. und 3. Sonntag")
- Systeme mit Behandlungsart `approval-required` oder `external` fließen nicht in die Kurve ein (kein automatisch nutzbares Zeitfenster); ihre Anzahl wird als Fußzeilenhinweis angezeigt

## Abgrenzungen

- Keine Änderung an `assignMaintenanceWindows`, `weeklySlots`, `calendarRules` oder der Zuordnungslogik
- Keine neue IndexedDB-Migration, keine neuen Persistenzfelder – reine Ableitung aus bereits geladenen Daten
- Keine Drill-down-Interaktion (z. B. Klick auf einen Slot öffnet Systemliste) in dieser Version
- Kein Export des Charts als Bild/CSV in dieser Version

## Fachliches Modell

### Zeitbereich je Ansicht

| Ansicht | Start | Anzahl Tage |
|---|---|---|
| Tag | heutiger Tag, lokale Mitternacht | 1 |
| Woche | Montag der aktuellen Kalenderwoche, lokale Mitternacht | 7 |
| Monat | 1. Tag des aktuellen Kalendermonats, lokale Mitternacht | Tage im Monat (28–31) |

Jeder Tag wird in 48 Halbstunden-Slots aufgelöst (gleiche Auflösung wie `weeklySlots`).

### Aggregation pro Slot

Für jeden Tag im Zeitbereich und jeden der 48 Slots wird über alle `known`-Zuordnungsgruppen (aus `assignMaintenanceWindows`) summiert, wie viele Systeme ein offenes Wartungsfenster haben:

- `handling === "external"` oder `"approval-required"`: Gruppe wird **nicht** gezählt (kein automatisches Zeitfenster).
- `handling === "always"`: Gruppe zählt für **jeden** Tag und Slot im Bereich (alle 336 Slots offen).
- `handling === "regular"`: Gruppe zählt für einen Tag/Slot nur, wenn
  1. `isDateAllowedByCalendarRules(date, definition.calendarRules)` (bestehende Funktion aus `src/lib/maintenanceWindows.ts`) `true` liefert – bei leeren `calendarRules` ist das immer der Fall (reine Wochenmaske ohne Einschränkung), und
  2. `definition.weeklySlots[weekdayIndex(date)][slot] === true` ist.

`weekdayIndex(date)` folgt derselben Konvention wie `isDateAllowedByCalendarRules`: `(date.getDay() + 6) % 7` (Montag = 0).

Der Beitrag einer Gruppe zu einem Slot ist `group.systems.length` (nicht einzelne Systeme mit unterschiedlichen Zeiten – alle Systeme einer Gruppe teilen die Zeitdefinition ihres Wartungsfensters).

### Ausgeschlossene Systeme

`excludedSystemsCount(known)` summiert `systems.length` aller Gruppen mit `handling` in `("approval-required", "external")`. Wird nur als Hinweistext angezeigt, wenn > 0.

## Architektur

### `src/lib/maintenanceWindowCoverage.ts` (neu, reine Funktionen)

```ts
export type CoverageView = "day" | "week" | "month";

export interface CoverageRange {
  start: Date; // lokale Mitternacht
  days: number;
}

export interface CoverageSlot {
  date: Date;   // lokale Mitternacht des Tages dieses Slots
  slot: number; // 0..47
  count: number;
}

export function getCoverageRange(view: CoverageView, referenceDate: Date): CoverageRange;
export function buildMaintenanceCoverage(
  known: readonly KnownMaintenanceWindowAssignment[],
  range: CoverageRange,
): CoverageSlot[]; // Länge = range.days * 48, chronologisch sortiert
export function findCurrentCoverageIndex(
  slots: readonly CoverageSlot[],
  now: Date,
): number | null; // Index des Slots, der `now` enthält, oder null falls außerhalb
export function excludedSystemsCount(known: readonly KnownMaintenanceWindowAssignment[]): number;
```

`KnownMaintenanceWindowAssignment` wird aus `@/lib/maintenanceWindows` importiert (bereits vorhanden, keine Änderung an diesem Typ).

### `src/components/maintenance-windows/MaintenanceCoverageChart.tsx` (neu)

Props: `{ known: KnownMaintenanceWindowAssignment[] }`.

Verhalten:
- Lokaler State `view: CoverageView` (Default `"week"`).
- Lokaler State `now: Date`, aktualisiert per `setInterval` alle 60 Sekunden (`useEffect`, Cleanup via `clearInterval`).
- `range = useMemo(() => getCoverageRange(view, now), [view, now.toDateString()])` – Range wird nur neu berechnet, wenn sich Ansicht oder Kalendertag ändert, nicht bei jedem Minuten-Tick.
- `slots = useMemo(() => buildMaintenanceCoverage(known, range), [known, range])`.
- `currentIndex = useMemo(() => findCurrentCoverageIndex(slots, now), [slots, now])` – für die "Jetzt"-Markierung, wird bei jedem Tick neu berechnet (billige Berechnung, kein Neuaufbau von `slots`).
- `excludedCount = useMemo(() => excludedSystemsCount(known), [known])`.

Darstellung:
- Kopfzeile: Titel "Auslastung nach Uhrzeit" + `ToggleGroup`/`ToggleGroupItem` (`type="single"`) mit Optionen Tag/Woche/Monat, gleiches Muster wie in `src/pages/Overview.tsx`.
- Wenn `slots.every(s => s.count === 0)` (keine automatisch planbaren Systeme zugeordnet): dezenter Hinweistext anstelle des Charts: "Noch keine Systeme mit automatisch planbarem Wartungsfenster zugeordnet."
- **Tag/Woche:** `AreaChart` (recharts) über `ResponsiveContainer`, Höhe 260px.
  - `<Area type="stepAfter" dataKey="count" stroke={CHART_COLORS.primary} fill={CHART_COLORS.primary} fillOpacity={0.18} />`
  - `XAxis` mit custom `tickFormatter`: Tag-Ansicht → `HH:MM` (jede 4. Slot-Marke, analog zum Stundenraster in `MaintenanceWeekGrid`); Woche-Ansicht → `Mo`, `Di`, … an Tagesgrenzen.
  - `YAxis allowDecimals={false}` (ganzzahlige Systemanzahl).
  - `Tooltip` mit `contentStyle={CHART_TOOLTIP_STYLE}` etc. (bestehende Konstanten aus `src/lib/chartStyles.ts`), Label formatiert als `"<Wochentag/Datum> <Startzeit>–<Endzeit> · <Anzahl> Systeme"`.
  - `ReferenceLine x={currentIndex}` (wenn `currentIndex !== null`), `stroke={CHART_COLORS.primary}`, `strokeDasharray="4 4"`, Label `"Jetzt"`.
  - Einzelne Datenreihe → keine Legende nötig (Titel benennt die Reihe).
- **Monat:** Heatmap, eigenes Markup (kein recharts), angelehnt an `MaintenanceWeekGridCompact`:
  - Zeilen = Kalendertage des Monats (Zeilenbeschriftung: Tag + Wochentagskürzel, z. B. "01 Mo"), Spalten = 48 Halbstunden-Slots (Stundenbeschriftung nur an geraden Slots, wie im bestehenden Wochenraster).
  - Zellfarbe: sequenzielle Rampe auf Basis von `CHART_COLORS.primary`, Alpha-Stufen von `count / maxCountInView` (0 → transparent/Kartenfarbe, 1 → volle Deckkraft). `maxCountInView = Math.max(1, ...slots.map(s => s.count))`.
  - Jede Zelle: `title`/`aria-label` mit Datum, Zeitspanne und exakter Anzahl (Wert nie nur über Farbe vermittelt).
  - Zelle, die `now` enthält: zusätzlicher hervorgehobener Rahmen (`ring`/`border`) statt reiner Farbänderung.
  - Horizontal/vertikal scrollbarer Container (Muster wie `maintenance-grid__scroll`).
- Fußzeile (nur wenn `excludedCount > 0`): `"<N> Systeme mit „Freigabe erforderlich“ oder „Extern verwaltet“ sind nicht enthalten, da sie kein automatisches Zeitfenster haben."`

### Einbindung in `src/pages/MaintenanceWindows.tsx`

`<MaintenanceCoverageChart known={assignments.known} />` wird direkt nach der bestehenden KPI-Grid (nach der schließenden `</div>` der vier `KpiCard`s, vor dem Fehler-Alert-Block) eingefügt.

## Barrierefreiheit

- `ToggleGroup`-Items mit sichtbaren Labels (Tag/Woche/Monat) und korrektem `aria-label`.
- Heatmap-Zellen mit vollständigem `aria-label` (Datum, Zeitspanne, Anzahl) – kein Verlass auf Farbe allein.
- Aktuelle-Zeit-Markierung im Line-/Areachart zusätzlich mit Textlabel "Jetzt", nicht nur farbliche Linie.
- Chart-Container respektiert `prefers-reduced-motion` (keine Eintritts-/Übergangsanimation über die von recharts/Tailwind bereits vorhandene Basis hinaus).

## Teststrategie

TDD, Tests vor Implementierung.

### Reine Logik (`src/test/maintenanceWindowCoverage.test.ts`)

- `getCoverageRange("day", ref)`: Start = lokale Mitternacht von `ref`, `days = 1`.
- `getCoverageRange("week", ref)`: Start = Montag derselben Kalenderwoche (auch wenn `ref` ein Sonntag ist), `days = 7`.
- `getCoverageRange("month", ref)`: Start = 1. Tag des Monats, `days` = korrekte Anzahl Tage (inkl. Schaltjahr-Februar).
- `buildMaintenanceCoverage`: `always`-Gruppe zählt in jedem Slot des Bereichs.
- `buildMaintenanceCoverage`: `regular`-Gruppe ohne `calendarRules` folgt durchgehend der Wochenmaske.
- `buildMaintenanceCoverage`: `regular`-Gruppe mit Kalenderregel "nur 1. Sonntag" zählt nur an einem passenden Sonntag im Monatsbereich, nicht an anderen Sonntagen.
- `buildMaintenanceCoverage`: `approval-required`- und `external`-Gruppen tragen nicht zur Summe bei.
- `buildMaintenanceCoverage`: mehrere Gruppen zur selben Zeit summieren sich korrekt (`systems.length` je Gruppe).
- `findCurrentCoverageIndex`: findet den korrekten Index für einen Zeitpunkt innerhalb des Bereichs; liefert `null` außerhalb.
- `excludedSystemsCount`: summiert nur `approval-required`/`external`-Gruppen.

### Komponente (`src/components/maintenance-windows/MaintenanceCoverageChart.test.tsx`)

- Rendert Umschalter mit drei Optionen; Klick wechselt Ansicht.
- Zeigt Leerzustand-Text, wenn alle Slots `count === 0` sind.
- Zeigt Fußzeilenhinweis mit korrekter Anzahl, wenn ausgeschlossene Systeme vorhanden sind; kein Hinweis bei 0.
- Monatsansicht rendert die erwartete Anzahl Zeilen (Tage im aktuellen Testmonat).
- Zeitpunkt wird über `vi.setSystemTime` fixiert, um deterministische Assertions zu ermöglichen.

Nach der Implementierung: `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build`.

## Erfolgskriterien

Auf `/wartungsfenster` erscheint unterhalb der Kennzahlen ein Chart, das für die aktuelle Woche standardmäßig zeigt, wie viele Systeme je Halbstunden-Slot ihr Wartungsfenster haben, mit sichtbarer Markierung der aktuellen Uhrzeit. Umschalten auf Tag zeigt den heutigen Tagesverlauf, Umschalten auf Monat zeigt eine Heatmap des aktuellen Kalendermonats inkl. korrekt angewendeter Monatsregeln. Systeme ohne automatisches Zeitfenster sind sichtbar ausgeschlossen und werden gezählt.
