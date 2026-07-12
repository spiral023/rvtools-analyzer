# Uplink-Namen im Netzwerkdiagramm

## Ziel

Im Netzwerkdiagramm der Detailansicht einer Konfigurationsvariante soll pro vmnic der Name des zugeordneten Uplinks angezeigt werden, nicht die Link-Geschwindigkeit.

## Verhalten

- Die sichtbare zweite Zeile im vmnic-Port-Kästchen zeigt den bestehenden Uplink-Namen, zum Beispiel `Uplink 1`.
- Wenn kein Uplink zugeordnet ist, zeigt die Zeile `nicht zugewiesen`.
- Die Link-Geschwindigkeit bleibt im vorhandenen SVG-Tooltip und in der Legende verfügbar.
- Switch-Zuordnung, Switch-Typ und alle übrigen Dialoginhalte bleiben unverändert.

## Tests

Die Anzeige wird als kleine reine Formatierungsfunktion umgesetzt und mit Unit-Tests für einen vorhandenen sowie einen fehlenden Uplink abgesichert.
