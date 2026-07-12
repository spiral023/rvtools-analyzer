# RVTools Analyzer Favicon – Design

## Ziel

Das bisherige generische Favicon wird durch ein eigenständiges, gut erkennbares App-Symbol ersetzt, das die technische Ausrichtung des RVTools Analyzers vermittelt.

## Gestaltung

- Dunkles, abgerundetes Quadrat als kompakte Grundform
- Reduziertes cyanfarbenes Infrastruktur-Symbol aus drei verbundenen Daten- beziehungsweise Server-Knoten
- Flache, kontrastreiche Darstellung ohne Text, Schatten, Verläufe oder feine Details
- Farbwirkung passend zu den bestehenden Design-Tokens: Anthrazit und Cyan
- Ausreichender Innenabstand, damit das Motiv auch bei 16 × 16 und 32 × 32 Pixeln lesbar bleibt

## Umsetzung

Imagegen erzeugt eine quadratische Mastergrafik. Aus der ausgewählten Grafik werden browsergeeignete PNG-Größen und eine `favicon.ico` abgeleitet. Die Dateien werden unter `public/` gespeichert und in `index.html` explizit referenziert.

## Abnahmekriterien

- Das Motiv ist bei 16 × 16 Pixeln noch als technisches Netz beziehungsweise Infrastruktur-Symbol erkennbar.
- Das Favicon besitzt einen klaren Rand und ausreichenden Kontrast auf hellen und dunklen Browser-Oberflächen.
- Es enthält keinen Text, kein Wasserzeichen und keine unnötigen Mikrodetails.
- Production-Build, Tests und Lint laufen ohne neue Fehler durch.
