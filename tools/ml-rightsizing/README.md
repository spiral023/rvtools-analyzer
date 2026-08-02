# Offline-ML-Toolkit für CPU-Rightsizing

Dieses Verzeichnis enthält ein **reines Entwicklungs- und Analysewerkzeug** für das RVTools Analyzer-Projekt. Es wird nicht von der Webapp importiert und verändert weder `src/` noch das Browser-Datenmodell.

Das Toolkit beantwortet drei Fragen:

1. Wie stabil ist die bestehende, deterministische Rightsizing-Policy auf einem zeitlich getrennten Holdout-Fenster?
2. Wie gut sind einfache saisonale Baselines wie „gleicher Wochentag, gleiche Stunde“?
3. Liefert ein lokales XGBoost-Modell zusätzliche Signale für die Entwicklung von Profil- und Parameterlogik?

## Voraussetzungen

- Python 3.10+
- `numpy`
- `xgboost` 3.x
- optional: NVIDIA-Treiber und CUDA-fähige XGBoost-Installation für `device=cuda`

Die Abhängigkeiten werden bewusst **nicht** in die App-Dependencies aufgenommen. Eine lokale Installation kann zum Beispiel in einer Entwicklungsumgebung erfolgen:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r tools/ml-rightsizing/requirements.txt
```

## Lauf mit einem RVTools-Export

```powershell
python tools/ml-rightsizing/ml_rightsizing.py `
  --export ".\rvtools-analyse_2026-08-01 (1)" `
  --output tools/ml-rightsizing/reports `
  --devices cpu,cuda `
  --quantiles 0.90,0.95
```

Das Skript erkennt den komprimierten Export anhand von `meta.json`, dekodiert die Zeitreihen, erstellt saisonale Baselines, trainiert die ausgewählten XGBoost-Varianten und schreibt:

- `rightsizing-ml-report.json` – maschinenlesbare Messwerte und Konfiguration
- `rightsizing-ml-report.md` – kompakter Entwicklungsreport für GitHub/Markdown

Berichte werden ignoriert und nicht committed. Es werden standardmäßig keine Modell-Dateien gespeichert.

## Methodik

Der zeitliche Split ist absichtlich strikt:

```text
historisches Fenster                         Holdout
|--------------------------------------------|----------------|
0                                            train_end       Ende
```

Die Rightsizing-Policy wird ausschließlich auf dem historischen Fenster berechnet. Das Holdout-Fenster dient nur zur Bewertung. Dadurch wird verhindert, dass die tatsächliche Zukunft versehentlich in die Zielgröße einfließt.

Die deterministische Referenz verwendet die im Projekt dokumentierten drei Zielgrößen:

- `peak`: Peak-Statistik (z. B. P95, P99, P995 oder Maximum)
- `p95`: P95 der CPU-Nachfrage
- `target_utilization`: Zielauslastung, mit der die Nachfrage in vCPU umgerechnet wird

Für die ML-Referenz werden zeitpunktbezogene Features aus Mittelwert-/Peak-Nachfrage, Lags, rollenden Fenstern, Uhrzeit, Wochentag, vCPU und MHz/vCPU gebildet. Das erste Modell sagt die nächste Stunde der normierten Peak-Nachfrage voraus; die Policy-Sweep-Auswertung bleibt der belastbarere Vergleich für die aktuelle Rightsizing-Logik. Ein späterer Ausbau sollte direkt das nächste 7-Tage-P99 als Zielgröße lernen.

## Interpretation

- `under_rate` ist der Anteil der VMs, bei denen das vorgeschlagene Ziel unter der Holdout-Zielgröße liegt. Für Rightsizing ist dieser Wert wichtiger als ein niedriger Durchschnittsfehler.
- `bias` ist Vorhersage minus Ziel. Positiv bedeutet Überprovisionierung, negativ Unterprovisionierung.
- `within_2_vcpu` zeigt, wie häufig die Abweichung höchstens zwei vCPU beträgt.
- Ein guter ML-Score allein ist kein Grund, die Webapp-Logik zu ändern. Parameter müssen zusätzlich auf Profilstabilität, Sicherheitsmarge, Datenabdeckung und Betriebsrisiko geprüft werden.

## Designentscheidung

Dieses Toolkit ist bewusst offline. Das Modell hilft bei der Entwicklung, bei Backtests und beim Tuning der deterministischen Regeln. Die Webapp bleibt statisch, lokal und nachvollziehbar; Nutzer sehen dort weiterhin eine reproduzierbare Berechnung statt einer nicht versionierten Laufzeit-Inferenz.
