# Tech-Info auf aktive RVTools-VMs beschränken

## Ziel

Die Tech-Info-Seite soll die beiden Tech-Info-Exporte klar von der RVTools-VM-Inventarliste abgrenzen. Alle dargestellten Einträge müssen zu einer aktiven RVTools-VM gehören.

## Tabellen

Die Seite zeigt drei Tabellen, jeweils innerhalb des bereits bestehenden globalen VM-, Cluster-, Host- und Suchfilters:

1. **VM Tech-Info Server:** aktive RVTools-VMs mit einem passenden Eintrag aus einem Tech-Info-Server-Import.
2. **VM Tech-Info Clients:** aktive RVTools-VMs mit einem passenden Eintrag aus einem Tech-Info-Client-Import.
3. **VMs ohne Tech-Info:** aktive RVTools-VMs ohne passenden Eintrag in beiden Tech-Info-Quellen.

Eine VM mit Einträgen in beiden Exportarten ist in den Server- und Client-Tabellen sichtbar, aber nicht in der Tabelle ohne Tech-Info.

## Zuordnung und Datenfluss

- Der jeweilige Tech-Info-Name wird mit der vorhandenen Namensnormalisierung abgeglichen: Leerzeichen am Anfang/Ende werden entfernt, Groß- und Kleinschreibung wird ignoriert.
- RVTools ist die führende Quelle für die VM-Auswahl. Einträge, die nur im Tech-Info-Import vorkommen, werden in keiner der drei Tabellen angezeigt.
- Die Server-Tabelle nutzt nur die Server-Latest-Daten; die Client-Tabelle nur die Client-Latest-Daten. Die beiden Importtypen bleiben in IndexedDB und beim Import getrennt.
- Die neue Aufteilungslogik wird als kleine, reine Hilfsfunktion umgesetzt, damit die Regeln unabhängig von React getestet werden können.

## Kennzahlen und Interaktion

- Die vorhandenen Server-KPIs bleiben auf die gefilterte RVTools-Menge bezogen.
- Zeilenaktionen bleiben unverändert: Server-VMs öffnen die VM-Details, Client-Zeilen die Client-Details.
- Die zusätzliche Tabelle ohne Tech-Info öffnet VM-Details.

## Tests

Automatisierte Tests prüfen mindestens:

- die Groß-/Kleinschreibungs- und Leerzeichen-unabhängige Zuordnung,
- das Ausblenden von Tech-Info-Einträgen ohne aktive RVTools-VM,
- die Verteilung einer VM in Server, Client und ohne Tech-Info,
- den Sonderfall einer VM, die sowohl einen Server- als auch einen Client-Eintrag hat.
