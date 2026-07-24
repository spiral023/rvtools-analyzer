# Cluster-Risiko-Score: vROps-Ausfallskonzept-Faktoren integrieren

## Problem

Der Cluster-Risiko-Score (`ClusterMetrics.riskScore`/`risk` in
[clusterCapacityEngine.ts](../../../src/domain/services/clusterCapacityEngine.ts))
berücksichtigt ausschließlich vHost-Rohdaten: CPU-/RAM-Auslastung, vCPU/Core,
RAM-Commit, Swap/Balloon, Hot-Hosts, DRS-Spread, HT-Status und Cluster-Deltas.

Die vROps-Ausfallskonzept-Werte (HIGH-RP RAM/CPU-Nutzung, CPU-Overcommit,
`VropsLatest` in [types.ts](../../../src/domain/models/types.ts)) werden zwar
importiert und als eigene Spalten angezeigt (`vropsRamAssignedHighPct`,
`siteFailoverRisk`, `vropsCpuOvercommitRatio` in
[clusterCapacityWorkspace.ts](../../../src/lib/clusterCapacityWorkspace.ts)),
fließen aber **nicht** in den `riskScore` ein. Ein Cluster mit kritischem
Site-Failover-Risiko (HIGH-RP-VMs passen im Standortausfall nicht in die
halbierte Kapazität) kann trotzdem als „niedrig“ eingestuft werden und landet
in der standardmäßig nach `riskScore` sortierten Tabelle weit unten.

## Ziel

Der Risiko-Score soll die vROps-Ausfallskonzept-Faktoren gewichtet
einbeziehen — mit dem höchsten Gewicht auf der HIGH-RP-RAM-Zuweisung
(Standortausfall-Tragfähigkeit), gefolgt von CPU-Überbuchung und HIGH-RP-CPU-
Nutzung, plus den übrigen vROps-Panels mit geringerem Gewicht. Cluster ohne
vROps-Import bleiben wie bisher bewertbar (nur ohne diese Faktoren), sollen
im UI aber klar als „nicht vollständig bewertet“ erkennbar sein.

## Score-Modell

Neue Faktoren, additiv zum bestehenden Score (Warn-/Danger-Punkte wie beim
bestehenden Modell):

| Faktor (vROps-Panel) | Warn | Danger | Punkte (warn/danger) | Begründung |
|---|---|---|---|---|
| HIGH-RP RAM % (Panel 2, `ramAssignedHighPct`) | 45% | 50% | 18 / **35** | Wichtigster Faktor: reicht die Kapazität beim Standortausfall nicht, können HIGH-RP-VMs nicht starten. Schwellen identisch zu `SITE_FAILOVER_THRESHOLDS`. |
| CPU-Overcommit Ist (Panel 7, `cpuOvercommitRatio`) | 4:1 | 5:1 | 10 / 20 | Überbuchung — 2. Priorität. Schwellen identisch zur bestehenden UI-Farbgebung (`coloredRatio(v, 4, 5)`). |
| HIGH-RP CPU % (Panel 4, `cpuUsageHighPct`) | 40% | 50% | 9 / 18 | Analog zu HIGH-RP RAM (Anteil an Gesamt-Cluster-Kapazität), aber CPU ist elastischer → etwas niedrigere Schwelle/Gewicht. |
| HIGH-RP RAM-Nutzung im eigenen RP (Panel 1, `ramUsageHighPct`) | 80% | 90% | 5 / 10 | Druck *innerhalb* des HIGH-Pools, unabhängig vom Standort-Szenario. |
| Cluster-RAM-Zuweisung gesamt (Panel 3, `clusterRamAssignedPct`) | 80% | 90% | 4 / 8 | Ist-Cross-Check zum bereits vorhandenen `ramCommitPct`. |
| Cluster-CPU-Nutzung gesamt (Panel 5, `clusterCpuUsagePct`) | 75% | 85% | 4 / 8 | Ist-Cross-Check zur bereits vorhandenen `cpuUsagePct`. |
| Ø VMs/Host Ist (Panel 6, `avgVmsPerHost`) | 25 | 40 | 2 / 5 | Konsolidierungsgrad/Blast-Radius, niedrigstes Gewicht. |

Maximal zusätzliche Punkte: 35+20+18+10+8+8+5 = 104. Die bestehenden
Gesamtschwellen (`riskScore >= 60` → „hoch“, `>= 30` → „mittel“) bleiben
**unverändert** — mehr gewichtete Faktoren bedeuten mehr Wege, diese
Schwellen zu erreichen, was hier beabsichtigt ist.

**Hard-Override-Regel:** Ist `computeSiteFailoverRisk(ramAssignedHighPct)`
gleich `"crit"`, wird `risk` immer auf `"hoch"` gesetzt — unabhängig vom
Summen-Score. Das bildet den binären Charakter des Risikos ab: reicht die
HIGH-RP-Kapazität im Standortausfall nicht, ist das kein graduelles Risiko,
sondern ein Ausfall.

Cluster ohne vROps-Import (`vrops == null`) erhalten für alle sieben Faktoren
0 Punkte (nicht bewertbar); die Hard-Override-Regel greift dann nicht.

## Integration

- `metricsFromAggregate` (clusterCapacityEngine.ts) bekommt ein neues
  optionales Feld `opts.vrops: VropsRiskInput | null` mit den sieben Werten.
  Ruft ein Aufrufer die Funktion ohne dieses Feld auf, verhält sich der Score
  exakt wie bisher (reine vHost-Bewertung) — kein Breaking Change für
  bestehende Aufrufer/Tests, die das Feld nicht setzen.
- `buildClusterCapacityWorkspace` (clusterCapacityWorkspace.ts): Der
  vROps-Lookup (`vropsByClusterNorm.get(...)`) wird vor den Aufruf von
  `metricsFromAggregate` vorgezogen (aktuell danach) und die sieben Werte
  werden übergeben.
- `computeWhatIf` (planningHelpers.ts): Die HIGH-RP-RAM-Projektion
  (Vorher-/Nachher-Delta durch VM-Verschiebungen) existiert bereits
  (`baselineHighPct`/`afterHighPct`). Diese wird jetzt zusätzlich in
  `metricsFromAggregate` für `before`/`after` durchgereicht. Die übrigen
  sechs vROps-Faktoren haben kein Projektionsmodell (eine VM-Verschiebung
  lässt sich nicht auf den vROps-Ist-CPU-Overcommit umrechnen) — sie fließen
  mit demselben statischen Wert in `before`- **und** `after`-Score ein. Das
  ist eine bewusste Vereinfachung und wird als Kommentar im Code
  dokumentiert.

## UI-Änderungen

- Neue Tabellenspalten in der Cluster-Capacity-Tabelle
  ([ClusterCapacityPanel.tsx](../../../src/components/cluster/ClusterCapacityPanel.tsx))
  für die bisher berechneten, aber nie angezeigten Werte
  `vropsCpuUsageHighPct` und `vropsRamUsageHighPct`, damit nachvollziehbar
  ist, wodurch sich ein Score-Anstieg erklärt.
- Kleines Hinweis-Badge „vROps fehlt“ neben dem Risiko-Badge (Capacity-
  Tabelle + `WhatIfCompareDialog.tsx`), wenn `vrops == null` für den
  Cluster — verhindert, dass ein niedriger Score als „Standortausfall
  sicher“ missverstanden wird, obwohl er nur unbewertet ist.
- Glossar-Texte in `src/lib/glossaries/capacity.ts` für `risk` und die neuen
  Spalten aktualisieren (Erwähnung der vROps-Gewichtung).

## Out of Scope (YAGNI)

- Keine Score-Breakdown-Anzeige (Tooltip mit Punkten je Faktor).
- Keine Änderung der bestehenden Gesamtschwellen (60/30) oder der
  bestehenden vHost-basierten Faktoren/Gewichte.
- Keine Änderung an `FleetCompare.tsx`s unabhängigem `riskScore` (andere
  Kennzahl, anderer Zweck: Fleet-weite Health-Bewertung, nicht
  Cluster-Kapazität).
- Keine Projektion der sechs statischen vROps-Faktoren im What-If (siehe
  oben) — nur HIGH-RP-RAM wird vorher/nachher projiziert.

## Testing

- Bestehende Tests in `clusterCapacityEngine.test.ts` bleiben unverändert
  gültig (kein `vrops`-Feld übergeben → altes Verhalten).
- Neue Testfälle: `metricsFromAggregate` mit `vrops`-Werten in Warn-/Danger-
  Bereichen (Punktevergabe pro Faktor, Summe, Hard-Override-Regel), sowie
  `vrops: null` (0 Zusatzpunkte, keine Override).
- `planningHelpers.test.ts`: Vorher-/Nachher-Score mit HIGH-RP-RAM-Delta
  über die kritische Schwelle prüft, dass `after.risk === "hoch"` durch die
  Hard-Override-Regel greift.
- `clusterCapacityWorkspace.ts`-Integrationstest: vROps-Werte werden korrekt
  vor `metricsFromAggregate` aufgelöst und fließen in `riskScore` ein.
