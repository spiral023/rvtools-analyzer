# Varianten-Übersichtstabelle im Hardware-Tab

## Ziel

Im Hardware-Tab soll oberhalb der Sektion „Modelle und Varianten im Detail" eine kompakte, sortierbare Tabelle alle Hardware-Varianten vergleichbar machen: Anzahl Hosts, Cluster-Mitgliedschaften, Spezifikation je Host (Cores, GHz, RAM) und Gesamtwerte je Variante (Cores, GHz, RAM, VMs) sowie Hersteller. Ein Klick auf eine Zeile öffnet eine Detailansicht der Variante.

## Datenaggregation

Neue reine Funktion `buildVariantSummary(group: HardwareModelGroup)` in `src/lib/hardwareVariants.ts`:

- `clusterBreakdown`: pro Cluster der Gruppe die Anzahl Hosts, Cores, RAM (MiB) und VMs, abgeleitet aus `group.hosts`. Hosts ohne Cluster werden unter „Ohne Cluster" geführt.
- `totalCores` = `group.totalCores × group.count`
- `totalGhz` = `totalCores × group.speedMHz / 1000` (Rechenkapazität als Cores × Takt)
- `totalRamMiB` = Summe der tatsächlichen `memoryMiB`-Werte aller Hosts der Gruppe
- `totalVms` = Summe der `vmCount`-Werte aller Hosts der Gruppe
- `clusterNames`: sortierte Liste der distinkten Clusternamen

Keine Änderungen an der bestehenden Gruppierungslogik `buildHardwareModelGroups`.

## Tabelle „Varianten-Übersicht"

Neue Card-Sektion in `src/pages/Hardware.tsx`, platziert zwischen den Charts und „Modelle und Varianten im Detail".

- Spalten: Variante (Modell-Label + CPU-Modell als Zweitzeile) · Hersteller · Hosts · Cluster (Anzahl; die Clusternamen erscheinen als Tooltip auf der Zelle) · Cores/Host · GHz/Host · RAM/Host · Cores gesamt · GHz gesamt · RAM gesamt · VMs gesamt.
- Sortierbar per Klick auf den Spaltenkopf, Standard: Hosts absteigend (konsistent zur Kartensortierung). Erneuter Klick invertiert die Richtung.
- Summenzeile über alle angezeigten Varianten am Tabellenende.
- Horizontal scrollbar auf schmalen Viewports (`overflow-x-auto`).
- Zeilenklick öffnet den Varianten-Detail-Dialog.
- Die Tabelle nutzt dieselben `modelGroups` wie Chart und Karten; FilterBar, Suche und der Switch „RAM als Variante zählen" wirken damit automatisch konsistent.
- Neuer Glossar-Eintrag in `src/lib/glossaries/hardware.ts` mit InfoTooltip am Sektionstitel, analog zu den bestehenden Sektionen.

## Varianten-Detail-Dialog

Neue Komponente nach dem Muster von `HostDetailDialog`:

- Kopf: Modell-Label, Hersteller, CPU-Spezifikation (CPU-Modell, Sockel, Cores, Takt).
- KPI-Kacheln: Hosts, Cores gesamt, GHz gesamt, RAM gesamt, VMs gesamt.
- Cluster-Aufschlüsselung als Tabelle: Cluster · Hosts · Cores · RAM · VMs.
- Host-Liste: Hostname, Cluster, RAM, VM-Anzahl; Klick auf einen Host schließt den Varianten-Dialog und öffnet den bestehenden `HostDetailDialog` für diesen Host.

Die bestehenden Varianten-Karten unter „Modelle und Varianten im Detail" bleiben unverändert erhalten.

## State

Nur ein zusätzlicher State `selectedVariant: HardwareModelGroup | null` analog zu `selectedHost`. Keine neuen Abhängigkeiten.

## Tests

Unit-Tests für `buildVariantSummary` in `src/test/hardwareVariants.test.ts`:

- Gesamtwerte (Cores, GHz, RAM, VMs) für eine Gruppe mit mehreren Hosts und unterschiedlichen RAM-Werten.
- Cluster-Aufschlüsselung inklusive Hosts ohne Cluster.
- Einzelhost-Gruppe als Randfall.
