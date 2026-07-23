# Robuste globale Tabellensuche

## Ziel

Die globale Suche soll alle fachlichen Tabellenfelder zuverlässig durchsuchen, auch wenn der Wert in der ersten Datenzeile leer ist.

## Ursache

`VirtualTable` verwendet die Standarderkennung von TanStack Table. Diese entscheidet anhand des Werts der ersten Datenzeile, ob eine Spalte global durchsuchbar ist. Optionale Felder wie IPAM-Name und Kommentar können dort `null` sein und werden dann vollständig von der Suche ausgeschlossen.

## Design

Die gemeinsame `VirtualTable` aktiviert die globale Suche für jede Spalte, die einen Accessor besitzt. Der bestehende globale String-Filter bleibt erhalten: Er sucht teilstringbasiert und ohne Beachtung der Groß-/Kleinschreibung. Leere Werte liefern dabei keinen Treffer.

Dadurch werden IPAM-Felder wie `IP Address`, `Name` und `Comment` ebenso wie die optionalen Felder anderer Tabellen zuverlässig durchsucht. Sortierung, Virtualisierung, sichtbare Trefferanzahl und Export bleiben unverändert, weil weiterhin der vorhandene Tabellen-Filterpfad verwendet wird.

## Tests

Ein Komponententest für `VirtualTable` deckt ab, dass eine Zeichenfolge in einer optionalen Spalte gefunden wird, obwohl diese Spalte in der ersten Tabellenzeile leer ist. Ein IPAM-Seitentest prüft die Weitergabe des gemeinsamen Suchtexts nicht erneut, da die Seite bereits die gemeinsame Tabelle verwendet.

## Abgrenzung

Keine Änderung an Import, IndexedDB, Suchleiste oder einzelnen IPAM-Datensätzen. Keine neue Filter-Syntax.
