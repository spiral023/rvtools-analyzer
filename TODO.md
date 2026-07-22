# TODO

- [ ] **Sheet-Builder Feature**: Eine selbst konfigurierbare Tabelle der gefilterten/ungefilterten Objekte als Excel oder Markdown exportieren können. Die Spalten sollen dabei aus den verfügbaren Daten gewählt werden können, ähnlich wie beim globalen Systemfilter.
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
