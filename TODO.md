# TODO

- [ ] **Sheet-Builder Feature**: Eine selbst konfigurierbare Tabelle der gefilterten/ungefilterten Objekte als Excel oder Markdown exportieren können. Die Spalten sollen dabei aus den verfügbaren Daten gewählt werden können, ähnlich wie beim globalen Systemfilter. Vor dem Export soll optional eine Anonymisierung/Pseudonymisierung konfigurierbar sein, etwa für vCenter-, Cluster- und Systemnamen sowie Namen von Systemverantwortlichen.
- [ ] **Zentrale Export-Seite**: Eine eigene Seite in der Sidebar schaffen, auf der alle Funktionen rund um den Export von Tabellen gebündelt werden. Die möglichen Funktionen und der genaue Umfang werden später gemeinsam gebrainstormt.
- [ ] **KI-Prompt-Builder**: Einen Baukasten für Analyse-Prompts bauen. Prompts sollen aus wiederverwendbaren Bausteinen erstellt, lokal gespeichert, bearbeitet und gelöscht werden können. Für eine Analyse wählt der Nutzer gezielt Daten und Kennzahlen aus der Webapp als Kontext aus; daraus entsteht ein vollständiger Prompt, der zum manuellen Einfügen in ChatGPT kopiert oder dort geöffnet werden kann. Vor der Übergabe soll optional eine Anonymisierung/Pseudonymisierung konfigurierbar sein, etwa für vCenter-, Cluster- und Systemnamen sowie Namen von Systemverantwortlichen. Der ausgewählte Datenumfang muss vor der Übergabe transparent sein; keine automatische Datenübertragung und keine Backend-Abhängigkeit.

## VM-IPAM-Kontrolle

### Ausgangslage

Im Netzwerk-Tab **Kontrolle** besteht bereits ein ESXi-Host-Datenabgleich:

- RVTools-Hosts werden per Hostname mit Tech-Info und IPAM abgeglichen.
- IPAM-Treffer zeigen IP-Adressen sowie daraus abgeleitete Netze.

Ein entsprechender Abgleich für virtuelle Maschinen existiert noch nicht.

### Datenquellen

- **RVTools:** Tabellenblatt `vNetwork`, Spalte `IPv4 Address`.
  - Eine VM kann mehrere Netzwerkadapter besitzen.
  - Pro Adapter können keine, eine oder mehrere IPv4-Adressen vorkommen.
  - Mehrere Adressen werden kommagetrennt geliefert, beispielsweise `10.1.1.1, 10.2.2.2`.
- **IPAM:** Importierte `ipam.csv`, insbesondere die Spalten `IP Address` und `Name`.
- **Tech-Info:** Soll zusätzlich zum RVTools- und IPAM-Abgleich berücksichtigt werden.

### Gewünschte Erweiterung

Den bisherigen Bereich „Host-Datenabgleich“ im Netzwerk-Tab **Kontrolle** in zwei getrennte Tabs aufteilen:

1. **VM Kontrolle**
   - Aggregiert alle Adapter und IPv4-Adressen je VM aus `vNetwork`.
   - Gleichen jede extrahierte IPv4-Adresse mit IPAM ab.
   - Zeigt auch VMs ohne IP-Adresse, ohne IPAM-Treffer oder mit mehreren Adressen/Adaptern nachvollziehbar an.
   - Gleicht die VM zusätzlich mit Tech-Info ab.
   - Enthält zusätzlich eine Tech-Info-Startansicht, analog zur heutigen Tabelle „Objekte aus Tech-Info“, aber mit VM-Bezug:
     - Spalte `VM (RVTools)` statt `ESXi-Host (RVTools)`.
     - Cluster der gefundenen VM aus RVTools anzeigen.
     - RVTools-IP-Adressen und IPAM-Treffer der primären IP darstellen.
   - Beim Namensabgleich aus Tech-Info nicht nur exakt suchen, sondern auch VM-Namen mit dem dokumentierten Namen als Präfix zulassen (`servername*`). Damit werden beispielsweise `servername_wirdabgebaut` und `servername_wird_aufgehoben` gefunden.
   - Mehrere passende VMs nicht stillschweigend auf einen Treffer reduzieren, sondern als Mehrdeutigkeit ausweisen.

2. **ESXi Kontrolle**
   - Übernimmt den bestehenden RVTools-Host-, Tech-Info- und IPAM-Abgleich unverändert in einen eigenen Tab.

### Noch zu entscheiden

- Welche Detailinformationen die VM-Tabelle pro Adapter ausweist (Adaptername, Portgruppe, MAC-Adresse usw.).
- Welche Abweichungen als „Auffälligkeit“ gelten sollen, etwa fehlende RVTools-IP, fehlender IPAM-Eintrag oder fehlender Tech-Info-Eintrag.
- Ob mehrere gleichlautende IPAM-Einträge oder mehrfach verwendete IP-Adressen explizit hervorgehoben werden sollen.
- Wie die „primäre IP“ einer VM verbindlich bestimmt wird, insbesondere wenn RVTools mehrere Adapter oder mehrere IPv4-Adressen pro Adapter liefert.

## Cluster-Review-Wizard

### Idee und Ziel

- [ ] Einen eigenen Menüpunkt **Cluster Review** ergänzen, der die ein- bis zweimal jährlich gemeinsam mit den jeweiligen Cluster-Ansprechpartnern durchgeführten Reviews unterstützt.
- [ ] Bestehende Daten und Analysen je Cluster zu einem geführten, wiederholbaren Review-Bericht zusammenführen.
- [ ] Im Review die aktuelle Konfiguration, Auslastung, Ausfallfähigkeit, Hardware, VM-Landschaft und Wartungsvorgaben auf Aktualität, Risiken und Verbesserungsmöglichkeiten prüfen.
- [ ] Reviews langfristig vergleichbar machen, damit sich die technische und organisatorische Entwicklung eines Clusters über mehrere Jahre messen lässt.

### Geführter Ablauf

Der Review soll als Wizard gemeinsam mit den Cluster-Ansprechpartnern
durchgearbeitet werden. Ein möglicher Ablauf:

1. **Review anlegen**
   - Cluster und Datenstand auswählen.
   - Review-Datum, Teilnehmer, Ansprechpartner und Moderator erfassen.
   - Optional einen früheren Review als Vergleichsbasis auswählen.
   - Status `Entwurf`, `in Bearbeitung` oder `abgeschlossen` führen.

2. **Stammdaten und Verantwortlichkeiten**
   - vCenter, Datacenter, Sites, Clusterprofil und Zweck des Clusters zeigen.
   - Ansprechpartner, Betriebsverantwortung und Wartungskontakte prüfen.
   - Aktuelle Wartungsfenster, Sonderregelungen und Freigabevorgaben bestätigen oder als Änderungsbedarf markieren.

3. **Konfiguration und Verfügbarkeit**
   - HA-/DRS-Konfiguration und auffällige Cluster- oder VM-Regeln zeigen.
   - Host- und Site-Verteilung prüfen.
   - N-1-, optional N-2- und Site-Ausfallkapazität präsentieren.
   - HIGH-/STD-Resource-Pool-Konfiguration, Shares und Zuordnungsqualität prüfen.
   - Große oder nach einem Ausfall schwer platzierbare VMs hervorheben.

4. **Kapazität und Auslastung**
   - CPU-, RAM-, vCPU/Core- und Fill-Up-Kennzahlen anzeigen.
   - Historische vROps-Auslastungsprofile einbeziehen, sobald verfügbar.
   - CPU Ready, CPU Contention, Memory Utilization und limitierende Metriken erläutern.
   - Aktuelle Kapazitätsrisiken und erwarteten Erweiterungsbedarf dokumentieren.

5. **Hardware und Lifecycle**
   - Hostanzahl, Modelle, CPU-Generationen, RAM-Ausbau und Hardwarevarianten zeigen.
   - Abweichungen innerhalb des Clusters, Firmware-/BIOS-Stand und ESXi-Versionen prüfen.
   - Support-, Release- und geplante Erneuerungsthemen festhalten.
   - Wartungs- und Patchfähigkeit des Clusters bewerten.

6. **VM-Landschaft**
   - Anzahl eingeschalteter und ausgeschalteter VMs sowie HIGH-/STD-Verteilung zeigen.
   - Große VMs, CPU-Ready-Hotspots, Memory Pressure, Snapshots, Tools-/Hardware-Versionen und Konfigurationsprobleme zusammenfassen.
   - Abbaukandidaten, unklare Zuordnungen und auffällige Sonderkonfigurationen prüfen.

7. **Health Events und weitere Analysen**
   - Aktuelle beziehungsweise relevante historische Health Events aggregieren.
   - Je nach Datenlage Storage-, Netzwerk-, Backup-, Compliance- und Maintenance-Auffälligkeiten des Clusters einbeziehen.
   - Analysen nicht nur als Ampel zeigen, sondern mit Datenquelle, Grenzwert und konkreter betroffener Objektliste nachvollziehbar machen.

8. **Maßnahmen und Entscheidungen**
   - Feststellungen, Entscheidungen und empfohlene Maßnahmen erfassen.
   - Maßnahme mit Priorität, Verantwortlichem, Zieltermin und Status versehen.
   - Abweichungen bewusst akzeptieren und mit Begründung dokumentieren können.
   - Offene Punkte aus dem vorherigen Review übernehmen und ihren Fortschritt bewerten.

9. **Bewertung und Abschluss**
   - Mehrere Review-Bereiche jeweils von 1 bis 10 bewerten.
   - Gesamtbewertung, Zusammenfassung, wichtigste Risiken und positive Entwicklungen festhalten.
   - Review abschließen, unveränderlich speichern und exportieren.

### Bewertungsmodell

Bewertungen von 1 bis 10 sollen mindestens für folgende Bereiche möglich
sein:

- Konfiguration und Standardkonformität
- Verfügbarkeit und Ausfallfähigkeit
- CPU-Kapazität und Performance
- RAM-Kapazität
- Hardware-Homogenität und Lifecycle
- VM-Hygiene und technische Schulden
- Wartungs- und Patchfähigkeit
- Monitoring und Health
- Dokumentation und Verantwortlichkeiten
- Gesamtzustand des Clusters

Für jede Bewertung sollen gespeichert werden:

- manuell vergebene Punktzahl,
- optional automatisch vorgeschlagene Punktzahl aus vorhandenen Analysen,
- Begründung und Kommentar,
- verwendete Daten und relevante Befunde,
- Abweichung zum vorherigen Review.

Automatische Vorschläge dürfen die gemeinsame fachliche Bewertung nicht
ersetzen. Der Reviewer kann sie anpassen, muss bei größeren Abweichungen aber
optional eine Begründung hinterlegen können.

### Historie und Vergleich

- [ ] Alle abgeschlossenen Reviews je Cluster chronologisch anzeigen.
- [ ] Bewertungen und zentrale Kennzahlen über mehrere Jahre als Verlauf darstellen.
- [ ] Unterschiede zum vorherigen Review hervorheben: verbessert, unverändert oder verschlechtert.
- [ ] Erledigte, offene und überfällige Maßnahmen vergleichen.
- [ ] Alte Reviews unverändert lassen, auch wenn Grenzwerte, Daten oder Bewertungslogik später geändert werden.
- [ ] Die damaligen Datenstände, Regeln und automatischen Bewertungsvorschläge als Snapshot im Review speichern.

### Speicherung und Export

- [ ] Reviews lokal in IndexedDB speichern und in Backup/Restore aufnehmen.
- [ ] Entwürfe fortsetzen, duplizieren und kontrolliert löschen können.
- [ ] Abgeschlossene Reviews vor nachträglichen unbeabsichtigten Änderungen schützen; Korrekturen als neue Revision dokumentieren.
- [ ] Einen vollständigen Markdown-Export bereitstellen, beispielsweise mit:
  - Metadaten und Teilnehmern,
  - Executive Summary,
  - Bewertungen und Vorjahresvergleich,
  - analysierten Kennzahlen und Auffälligkeiten,
  - Entscheidungen und akzeptierten Risiken,
  - Maßnahmenliste mit Verantwortlichen und Terminen,
  - Datenständen und verwendeten Bewertungsregeln.
- [ ] Später optional weitere Exportformate wie PDF oder DOCX prüfen.

### Noch zu entscheiden

- Welche Analysen verpflichtende Wizard-Schritte und welche optionale Vertiefungen sind.
- Ob ein Review mehrere Cluster gemeinsam abdecken darf oder immer genau einem Cluster zugeordnet ist.
- Welche Bewertungskategorien verpflichtend sind und ob sie unterschiedlich gewichtet werden.
- Wie automatische Bewertungsvorschläge aus Grenzwerten abgeleitet werden.
- Ob abgeschlossene Reviews technisch gesperrt oder über versionierte Revisionen korrigierbar sein sollen.
- Wie Maßnahmen zwischen Reviews weitergeführt werden und ob Erinnerungen oder Fälligkeitshinweise benötigt werden.
- Welche sensiblen Inhalte vor einem Export pseudonymisiert werden können.
