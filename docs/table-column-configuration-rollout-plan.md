# Rollout-Plan: Spaltenkonfiguration für alle exportierbaren Tabellen

## Ziel

Die bereits in **Tech-Info → Organisation** vorhandene Spaltenkonfiguration soll für jede fachliche Tabelle verfügbar sein, die die gemeinsame Komponente `VirtualTable` verwendet. Sie soll pro Tabelle und Benutzerprofil speichern:

- sichtbare Spalten,
- Spaltenreihenfolge,
- Sortierspalte und -richtung.

Die Konfiguration enthält Suche, Tooltip-Erklärung, Beispielwert, Verschieben nach oben/unten und Zurücksetzen. Der Tabellenexport verwendet die aktuell sichtbaren Spalten und ihre Reihenfolge. Die Einstellungen werden in Benutzer-Backup-Exporten mitgesichert und beim Import wiederhergestellt.

## Wichtige Ausgangslage

- Die gemeinsame Komponente ist [VirtualTable.tsx](../src/components/tables/VirtualTable.tsx).
- Dort gibt es bereits die vollständige UI für `columnPicker`, `tablePreferences` und `onTablePreferencesChange`.
- Die einzige persistente Nutzung liegt aktuell in [TechInfoOrganisationPanel.tsx](../src/components/tech-info/TechInfoOrganisationPanel.tsx).
- Die zugehörigen Typen liegen in [types.ts](../src/domain/models/types.ts), Backup-Logik in [backupService.ts](../src/domain/services/backupService.ts).
- Stand der Bestandsaufnahme: Es gibt 82 `VirtualTable`-Einbindungen in 41 Dateien. Das Export-Symbol wird von `VirtualTable` selbst gerendert. `exportFileName` ist daher **kein** verlässliches Kriterium für den Umfang.

## Fachliche Regeln

1. Eine Einstellung gilt immer für genau eine Tabelle, nicht für eine ganze Seite. Beispiel: `vms/performance/cpu-ready` und `vms/performance/memory-pressure` haben getrennte Einstellungen.
2. Angebotene Spalten sind immer die Spalten, die diese Tabelle bereits fachlich darstellt. Es wird kein globaler, unpassender Spaltenkatalog erzeugt.
3. Technische Bedienungsspalten dürfen nicht konfigurierbar sein: Zeilenauswahl, Aktionen, Expand/Collapse, reine Diagramm-/Sparkline-Spalten ohne sinnvolle Textrepräsentation.
4. Die erste fachliche Identifikationsspalte (z. B. VM, Host, Cluster) bleibt sichtbar und wird nicht ausgeblendet. Sie darf bei Bedarf ebenfalls nicht verschoben werden. Das verhindert nicht mehr zuordenbare Tabellenzeilen.
5. Die Sortierung darf nur Spalten anbieten, die im aktuellen TanStack-Table-Modell sortierbar sind. Nicht sortierbare Spalten werden in der Sortierauswahl klar als nicht verfügbar behandelt.
6. Die Exportdialoge exportieren bzw. kopieren die im Moment sichtbaren und geordneten Spalten. Ausgeblendete Spalten erscheinen nicht im Ergebnis.
7. Bestehende Benutzerpräferenzen für Tech-Info dürfen weder verloren gehen noch inhaltlich verändert werden.

## Ziel-Datenmodell

### Neue generische Präferenz

In `src/domain/models/types.ts` eine wiederverwendbare Struktur definieren. Die vorhandene Form von `TechInfoOrganisationTablePreferences` soll dabei entweder wiederverwendet oder sauber auf eine generische Form migriert werden.

```ts
export interface TableDisplayPreferences {
  columnOrder: string[];
  columnVisibility: Record<string, boolean>;
  sorting: Array<{ id: string; desc: boolean }>;
}

export type TableDisplayPreferencesByTableId = Record<string, TableDisplayPreferences>;
```

Die genaue Reihenfolge beim Umbau:

1. Existierenden Typ auf Kompatibilität prüfen.
2. Falls die Struktur identisch ist, den generischen Typ einführen und den alten Typ als Alias beibehalten, damit keine unnötige Migration entsteht.
3. In `UiState` ein neues optionales Feld ergänzen, zum Beispiel `tableDisplayPreferences?: TableDisplayPreferencesByTableId`.
4. Die bereits vorhandene Tech-Info-Einstellung zunächst unverändert lesen. Beim nächsten Speichern zusätzlich in die neue Zuordnung übernehmen oder explizit migrieren.

`UiState.id` bleibt für diese Präferenzen ein einziger stabiler Wert, zum Beispiel `table-display-preferences`. Nicht für jede Tabelle einen eigenen IndexedDB-Datensatz anlegen.

## Stabile Tabellen-IDs

Jede `VirtualTable` erhält eine explizite, dauerhaft stabile `tableId`. Niemals Seitenüberschriften, lokalisierte Texte, Array-Indizes oder Dateinamen zur Laufzeit als ID verwenden.

Format:

```text
<bereich>/<tab>/<fachliche-tabelle>
```

Beispiele:

```text
fleet/vcenter-overview
clusters/capacity-health
clusters/capacity-overcommit
hosts/inventory
vms/operations-snapshots
vms/performance-cpu-ready
vms/compliance-hardware-upgrade
storage/datastore-overview
network/security-findings
```

Die ID wird einmal als Konstante nahe der jeweiligen Tabelle definiert und in einer zentralen Inventur dokumentiert. IDs sind Teil der dauerhaft gespeicherten Benutzeroberfläche; nach einem Release nicht umbenennen.

## Spaltenkatalog nach Bereich

Das Muster lautet: Die Konfiguration bietet genau die vorhandenen, fachlichen Spalten der jeweiligen Tabelle an. Die folgende Liste dient dem Implementierer als Referenz und als Abnahmekriterium für die zentralen Bereiche.

| Bereich / Tabelle | Konfigurierbare fachliche Spalten |
| --- | --- |
| Fleet / vCenter-Übersicht und Vergleich | vCenter, Version, VMs, Powered On, Hosts, Cluster, RAM, Ø Datastore frei, CPU OC, Snapshots, Security Drift, Health, Risiko-Score |
| Cluster / Capacity Health | Cluster, Risiko, Hosts, Ausfallskapazität, Cores, VMs, CPU %, RAM %, vCPU/Core, RAM Commit, Hot Hosts, Site-Failover, HIGH-RP CPU/RAM |
| Cluster / Overcommit | Cluster, vCPU/Core, RAM Overcommit, vCPUs, Cores, RAM Alloc, RAM Total, CPU Overcommit |
| Cluster / Density | Cluster, Hosts, VMs/Host, vCPU/Core, RAM Util % |
| Cluster / Infrastruktur | vCenter, Host, Cluster, Device, Typ, Treiber, Modell |
| Cluster / Wartung | vCenter, Name, Hosts, VMs, Typ, Basisprofil, Wartungsfenster, Verantwortliche |
| Cluster / Planning | VM, Cluster, Host, Power, vCPU, RAM GiB (Auswahl-Checkbox bleibt fix) |
| Cluster / Resource Pools | Resource Pool, Pfad, Status, VMs, CPU Limit, CPU Reservation, CPU Expand, Memory Limit, Memory Reservation, Memory Expand, Risiko |
| Hosts / Inventar | vCenter, Host, Cluster, ESXi-Version, Build, CPU-Modell, Vendor, Modell, Service Tag, Maintenance |
| Hosts / Hygiene | Host, NTP-Server, NTPD, DNS-Server, DHCP, Probleme |
| VMs / Inventar | VM, Systemverantwortlicher, Abteilung, Power, Cluster, Host, vCPU, RAM, Config, OS |
| VMs / Operations | VM, Config-Status, Verbindung, Power, Cluster, Host, OS; Snapshot, Beschreibung, erstellt, Alter, Größe, Quiesced |
| VMs / Performance | CPU Ready, vCPU, Cluster, Host, Power; RAM, Swapped, Ballooned, Active; Entitlements; FT-Status; NIC, Netzwerk, IPv4, Problem; Latency Sensitivity |
| VMs / Compliance | VM, Hardware-Version, Firmware, Secure Boot, CBT, OS Drift, UUID fehlt, Annotation leer, Cluster |
| VMs / Workload Profile | VM, Cluster, Systemverantwortlicher, Abteilung, Host, vCPU, Lastmuster, Niveau, Vertrauen, Abdeckung, 7-Tage-Profil, CPU Demand P95, CPU Demand P95 %, Ready P95 |
| VMs / Rightsizing | VM, Cluster, Systemverantwortlicher, Abteilung, Konfiguriert, Lastmuster, Niveau, CPU Demand P95, CPU Demand P95 %, Ready P95, Genutzt P95, Empfohlen, Rückgewinnbar, Nächster Schritt, Zusätzlich, Vertrauen, Auffällig |
| VMs / Tools | Cluster, Upgradeable, VMs gesamt, Anteil Upgradeable |

Für Storage, Netzwerk, Security, Hardware, Lizenzierung, Planung, Maintenance, Dashboard-Details und Import-/Rohdaten gilt dieselbe Regel. Vor der Umsetzung muss der Implementierer für **jede** `VirtualTable` den vorhandenen `columns`-Block erfassen und die sichtbaren Header in eine Inventur aufnehmen. Das verhindert, dass Tabellen oder Tabs versehentlich fehlen.

## Umsetzungsschritte

### 1. Vollständige Inventur erstellen

1. Nur lesend alle Vorkommen ermitteln:

   ```powershell
   rg -n "<VirtualTable" src --glob '!*.test.*'
   ```

2. Für jedes Vorkommen in einer Tabelle dokumentieren:
   - Datei und React-Komponente,
   - Seite und Tab,
   - vorgeschlagene `tableId`,
   - fachliche Spalten-IDs und Header,
   - nicht konfigurierbare technische Spalten,
   - ob eine Spalte nicht sortierbar ist.
3. Duplikate mit denselben Fachspalten dürfen dieselbe **Implementierungs-Logik**, aber nicht automatisch dieselbe `tableId` bekommen. Nutzer erwarten unterschiedliche Einstellungen je Kontext.
4. Die fertige Inventur als Markdown in `docs/` speichern und vom Auftraggeber bestätigen lassen, bevor alle 82 Einbindungen angepasst werden.

### 2. Generische Persistenz bauen

1. Typen zuerst in `src/domain/models/types.ts` ergänzen.
2. Einen kleinen Hook bauen, zum Beispiel `src/hooks/useTableDisplayPreferences.ts`:
   - lädt die Zuordnung einmal aus `getUiState`,
   - liefert für eine `tableId` die gespeicherten Werte oder Standardwerte,
   - speichert Änderungen per `putUiState`,
   - vermeidet parallele Schreibvorgänge und speichert nur bei tatsächlichen Änderungen.
3. Die ID des `UiState` als Konstante auslagern, damit Backup und Hook denselben Wert verwenden.
4. Bestehende Tech-Info-Konfiguration auf den Hook umstellen. Erst danach die übrigen Tabellen anschließen.
5. Prüfen, ob das IndexedDB-Schema selbst unverändert bleiben kann. Da nur ein vorhandener `UiState`-Datensatz um ein optionales Feld erweitert wird, ist voraussichtlich keine `DB_VERSION`-Erhöhung erforderlich. Falls die DB-Struktur doch geändert wird, `DB_VERSION` erhöhen und Migration ergänzen.

### 3. Backup und Import erweitern

1. `collectUserDataBackup()` um die neue Präferenzzuordnung ergänzen.
2. `importUserDataBackup()` um das sichere Einlesen ergänzen.
3. Für alte Backups ohne das neue Feld muss Import weiterhin erfolgreich sein.
4. Für neue Backups muss der Importstatus klar ausweisen, ob Tabellenpräferenzen importiert wurden.
5. Existierendes Tech-Info-Feld während mindestens einer kompatiblen Version weiterhin akzeptieren, damit bereits exportierte Backups funktionieren.

### 4. VirtualTable minimal erweitern

`VirtualTable` soll nicht wissen, wo Daten gespeichert werden. Sie bekommt ausschließlich:

```ts
tableId?: string; // nur für Diagnose/Tests, nicht zwingend für die UI nötig
columnPicker?: boolean;
tablePreferences?: TableDisplayPreferences;
onTablePreferencesChange?: (preferences: TableDisplayPreferences) => void;
```

Die existierende Konfigurations- und Export-UI wiederverwenden. Dabei verifizieren:

- Suchfeld findet Header, Begriff, Beschreibung und Quelle.
- Beispielwert kommt aus der aktuell gefilterten Tabelle und zeigt einen verständlichen Nicht-Leerwert.
- Scrollbereich hat eine echte Höhe und ist bei vielen Spalten scrollbar.
- Reihenfolge-Buttons funktionieren mit sichtbaren und ausgeblendeten Spalten zuverlässig.
- Das Zurücksetzen entfernt nur die Einstellung dieser einen Tabelle.
- Sortieren über den Konfigurationsdialog und Klick auf Tabellenheader bleiben konsistent.
- Exporte/Kopie lesen die sichtbaren Spalten in Anwenderreihenfolge.

Keine neue Export- oder Konfigurationsdialog-Implementierung pro Seite erstellen.

### 5. Tabellen schrittweise anschließen

In dieser Reihenfolge implementieren und nach jedem Paket manuell prüfen:

1. Fleet, Cluster, Hosts und VM-Übersichten.
2. VM-Untertabs: Operations, Performance, Compliance, Workload, Rightsizing, Tools.
3. Storage-Untertabs und Storage-Detailseiten.
4. Netzwerk, Security, IPAM, VLAN und Hardware.
5. Planung, Maintenance, Lizenzierung, Dashboard-Details und übrige Rohdaten-/Importtabellen.

Für jede Tabelle:

1. stabile `tableId` definieren;
2. Hook verwenden;
3. `columnPicker`, `tablePreferences` und Callback übergeben;
4. technische Spalten ausschließen bzw. erste Identitätsspalte sperren;
5. prüfen, dass die bisherigen Spalten-IDs stabil und eindeutig sind;
6. direkt nach dem Anschluss den Exportdialog testen.

## Testplan

### Unit-Tests

- `VirtualTable.test.tsx`
  - Reihenfolge, Sichtbarkeit und Sortierung werden an Callback gegeben.
  - Suche und Beispielwert funktionieren.
  - nicht konfigurierbare Spalten fehlen.
  - Reset stellt Standard wieder her.
  - bei vielen Spalten ist der Dialog scrollbar.
- Neuer Hook-Test
  - Laden von Defaults, Speichern pro `tableId`, getrennte Tabellenwerte, fehlerhafte/alte Daten robust behandeln.
- `backupService`-Tests
  - neues Backup enthält die Zuordnung;
  - neuer Import stellt sie wieder her;
  - altes Backup ohne Feld bleibt gültig;
  - bestehende Tech-Info-Backups bleiben kompatibel.

### Manuelle Abnahme

Für mindestens eine Tabelle je Bereich:

1. Drei Spalten ausblenden, zwei umsortieren und einen Sortierwert setzen.
2. Seite neu laden und Browser schließen/öffnen: Zustand bleibt erhalten.
3. Zu einer anderen Tabelle wechseln: deren Zustand ist unabhängig.
4. Dialog mit mehr als 20 Spalten öffnen: bis zur letzten Spalte scrollen.
5. Nach einer Spalte suchen, Erklärung und Beispielwert prüfen.
6. CSV, XLSX, JSON und Zwischenablage prüfen: Spaltenreihenfolge und Sichtbarkeit stimmen.
7. Benutzerbackup exportieren, Browserdaten für UI-State entfernen, Backup importieren und erneut prüfen.

## Qualitäts-Gates vor Commit

```powershell
npm run test
npm run lint
npm run build
```

Zusätzlich nach React-Änderungen `react-doctor` ausführen. Neue Warnungen, die durch diese Änderung entstehen, beheben oder im PR/Commit begründen.

## Nicht im Scope

- Keine neue Backend- oder Cloud-Synchronisation.
- Keine Änderung der fachlichen Tabellenberechnungen oder der importierten RVTools-Daten.
- Keine globale Spaltenauswahl über mehrere verschiedene Tabellen hinweg.
- Keine Änderung an bestehenden Exports, außer dass sie die aktuelle sichtbare Spaltenauswahl respektieren.

## Definition of Done

- Jede der inventarisierten `VirtualTable`-Einbindungen hat eine stabile `tableId` und aktivierte Konfiguration, außer dokumentiert ausgenommene technische Tabellen.
- Alle fachlichen vorhandenen Spalten sind je Tabelle auffindbar, erklärbar, als Beispiel sichtbar, ein-/ausblendbar und sortierbar, sofern technisch möglich.
- Technische Auswahl-/Aktionsspalten bleiben funktionsfähig und sind nicht konfigurierbar.
- Einstellungen überleben Reload und sind je Tabelle getrennt.
- Neue und alte Benutzerbackups können importiert werden.
- Export und Zwischenablage respektieren die Konfiguration.
- Tests, Lint und Production-Build laufen erfolgreich durch.
