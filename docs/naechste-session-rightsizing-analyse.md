# Übergabe: Analyse des CPU-Rightsizings

Prompt für die nächste Session. Stand 01.08.2026.

---

## Aufgabe

Analysiere den Analyse-Export unter
`C:\Users\asi\Documents\GitHub\rvtools-analyzer\rvtools-analyse_2026-08-01\`
und leite daraus Verbesserungen für VM-Profiling und CPU-Rightsizing ab.
Ziel ist Rightsizing in **beide** Richtungen — Verkleinerung und Vergrößerung.
Andere Ressourcen (RAM, Storage, Netzwerk) sind ausdrücklich nicht Teil des Ziels.

**Arbeite in zwei Schritten.** Erst analysieren und mir die Befunde mit Zahlen
vorlegen, dann Code ändern. Keine Schwellwerte aus Plausibilität ableiten —
alles muss an der Verteilung in den echten Daten belegt sein.

## Die Daten

31 Tage Stundenwerte (1.–31. Juli 2026, Europe/Vienna, 744 Slots je VM),
4.018 VMs mit Messreihe, pseudonymisiert. Alle acht Metriken vorhanden.

- `meta.json` — Zeitraum, Rasterlänge, Kodierung je Metrik. **Zuerst lesen.**
- `README.md` — beschreibt das Format der Reihen.
- `vms.csv` — Inventar plus die von der App berechneten Profil- und
  Rightsizing-Kennzahlen.
- `hosts.csv` — `mhzPerCore` ist die bisherige Umrechnungsbasis MHz → vCPU.
- `series/*.csv` — je Zeile `vmId;values`, 744 Werte im Stundenraster ab
  `timeSeries.rangeStartUtc`.

Die Reihen sind delta-kodiert und quantisiert: leeres Feld = Messlücke (bricht
die Delta-Kette nicht), `wert*anzahl` = Wiederholung, Rückrechnung über
`laufende_summe / encoding.scale`. Ein fertiger Decoder liegt in
`src/lib/export/analysisSeriesCodec.ts` (`decodeAnalysisSeries`).

### Zwei Fallstricke

1. **`vms.csv` hat 19.320 Zeilen, aber nur 4.018 mit `hasSeries=1`.** Der Export
   umfasst drei vCenter, die vROps-Reihen decken nur einen Teil ab. Ohne Filter
   auf `hasSeries=1` ist jede Verteilungsstatistik falsch.
2. **4,8 % der Messwerte fehlen** (143.782 von 3,0 Mio). Lücken sind echte
   Lücken, keine Nullen — beim Rechnen ausschließen, nicht als 0 behandeln.

## Ausgangslage im Code

Diese Stellen sind bekannt verbesserungsbedürftig und der eigentliche Auftrag:

- **`src/domain/services/vmRightsizingService.ts:77-84`** — `Math.min(profile.vcpu, …)`
  deckelt die bedarfsgerechte Größe hart auf die konfigurierte Anzahl.
  Unterdimensionierte VMs sind dadurch strukturell nicht erkennbar. Der Deckel
  muss weg, und die Gegenrichtung braucht eigene Kriterien — Vergrößerung hat ein
  anderes Risikoprofil als Verkleinerung.
- **`vmRightsizingService.ts:38`** — `SHAPES_WITHOUT_RECOMMENDATION` schließt
  `bursty` und `irregular` aus, weil sieben Tage deren Spitzen nicht erfassten.
  Mit 31 Tagen ist zu prüfen, ob das noch nötig ist. Betrifft 510 VMs (12,7 %).
- **`vmRightsizingService.ts:72-73`** — rechnet MHz über `mhzPerCore` aus
  Hostdaten in vCPU um. Jetzt liegt `vmCpuTotalCapacityLastMHz` je VM vor;
  vergleiche beide und stelle um, wenn die gemessene Kapazität systematisch abweicht.
- **`vmRightsizingService.ts:73`** — der Peak-Pfad nutzt `demand.maximum`, also das
  Maximum stündlicher **Mittelwerte**. Jetzt liegt `vmCpuDemandMaxMHz` vor.
- **`src/domain/services/vmWorkloadProfileService.ts:104-120`** —
  `VM_BEHAVIOR_THRESHOLDS`. **51 % aller Profile fallen auf `constant`**, was auf
  eine zu großzügige `constantLoadCvMax = 0.5` hindeutet. Verteilung des
  Variationskoeffizienten prüfen und die Schwelle daran ausrichten.
  Ist-Verteilung: constant 2.062, variable 619, business-hours 397, bursty 297,
  irregular 213, night-batch 176, constant-with-peak 151, weekend 71,
  unclassified 32.
- Die neuen Metriken (Disparity, Peak Ready, Peak Co-Stop, Total Capacity,
  konfigurierte vCPU) werden **importiert und exportiert, aber noch nirgends
  ausgewertet**. Sie sind der Hebel für die Verbesserung.

## Analysefragen

1. **Ist die vCPU-Umrechnung korrekt?** `vmCpuTotalCapacityLastMHz / configured_vcpu`
   gegen `mhzPerCore` aus `hosts.csv`. Wie groß ist die Abweichung, und in welche
   Richtung?
2. **Wie viel unterschätzt der Mittelwert die Spitze?** Verteilung von
   `demand_max / demand_avg` je Stunde und je VM. Für welche Lastmuster ist der
   Faktor am größten?
3. **Wie verteilt sich der Konzentrationsindex?**
   `(Disparity / Auslastung) / vCPU`, Wertebereich 0…1. Wo liegt die Grenze
   zwischen „skaliert über die vCPU" und „ein Kern trägt alles"? Erwartung: eine
   zweigipflige Verteilung. Nur Stunden mit nennenswerter Last gewichten —
   bei Leerlauf ist die Disparity Rauschen.
4. **Gibt es überhaupt Vergrößerungskandidaten?** Der reguläre Ready-Wert lag im
   7-Tage-Datensatz bei einem Median von 0,2 % und war als Signal praktisch tot.
   Prüfe `cpu_peak_vcpu_ready_max` und `cpu_peak_vcpu_costop_max` — zeigen die
   Peak-Varianten mehr? Wie viele VMs erreichen stundenweise eine Auslastung nahe
   der Kapazität?
5. **Trennt die Wochen-Wiederholbarkeit `bursty` von planbar?** Vier volle Wochen
   liegen vor. Vergleiche die Wochen einer VM untereinander. Bei hoher
   Wiederholbarkeit ist die Spitze planbar und eine Empfehlung vertretbar.
6. **Ist Co-Stop in dieser Umgebung ein Thema?** Anteil der VMs mit Co-Stop > 0,
   aufgeschlüsselt nach vCPU-Anzahl. Wenn breite VMs auffällig sind, ist das das
   stärkste Argument für Verkleinerung.

Für die Auswertung eignen sich Skripte unter `scripts/` (Muster:
`analyze-behavior-classes.ts`, `measure-analysis-export.ts`), ausgeführt mit
`npx vite-node --options.transformMode.ssr='.*' scripts/…`.

## Randbedingungen

- Alle VMs sind dauerhaft eingeschaltet. Keine CPU-/Memory-Reservierungen,
  -Limits oder -Shares. Kein Hot-Add.
- Im Juli 2026 liegt kein österreichischer Feiertag; `holidays` ist deshalb leer.
  Die Berechnung (`src/lib/holidays.ts`) ist vorhanden und getestet, greift für
  diesen Zeitraum aber nicht.
- Empfehlungen sind immer prüfpflichtige Vorschläge, nie automatische Änderungen.
  vCPU werden paarweise geändert (gerade Zahlen).

## Weiteres Vorgehen

1. Analysieren, Befunde mit Zahlen vorlegen.
2. Nach meiner Freigabe Code ändern, Tests ergänzen, committen, deployen.
3. Ich importiere neue Daten und ziehe einen neuen Analyse-Export.
4. Vorher/Nachher vergleichen — die Pseudonyme sind über Exporte hinweg stabil,
   dieselbe VM behält ihr Kürzel.
5. Wenn die Vorgehensweise steht, daraus einen Agent-Skill (`SKILL.md`) machen.
   Vorher nicht: Es gäbe nur Vermutungen zu kodifizieren.
