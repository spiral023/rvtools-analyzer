# RVTools Analyzer

<div align="center">

**Lokales Analyse-Dashboard für RVTools-Exporte aus VMware-Umgebungen**

Importiere RVTools-XLSX-Dateien, vergleiche Snapshots pro vCenter und finde operative Risiken, Kapazitätsengpässe, Lifecycle-Themen und Konfigurationsauffälligkeiten direkt im Browser.

![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite&logoColor=white)
![React](https://img.shields.io/badge/React-18.x-149ECA?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.x-06B6D4?logo=tailwindcss&logoColor=white)
![Vitest](https://img.shields.io/badge/Tests-Vitest-6E9F18?logo=vitest&logoColor=white)
![Storage](https://img.shields.io/badge/Daten-lokal%20in%20IndexedDB-2E7D32)

</div>

---

## Für VMware-Admins

RVTools Analyzer ist für den Alltag von VMware-Administratoren gebaut: Inventur prüfen, Health-Themen priorisieren, Kapazitätsrisiken sichtbar machen und mehrere vCenter- oder Zeitstände miteinander vergleichen.

Die Anwendung läuft vollständig clientseitig. Es gibt kein Backend, keinen Server-Upload und keine zentrale Datenbank. Importierte RVTools-Daten bleiben im Browser des jeweiligen Clients.

| Admin-Frage | Wo sie beantwortet wird |
|---|---|
| Welche VMs, Hosts, Cluster und Datastores sind im Scope? | **Overview** |
| Welche VM-Snapshots, Tools- oder Config-Themen brauchen Aufmerksamkeit? | **Daily Ops** |
| Wo werden Datastores knapp oder Cluster überbucht? | **Capacity** |
| Welche VMs zeigen CPU Ready, Memory Pressure oder Netzwerkauffälligkeiten? | **Performance** |
| Wo fehlen Backups, sind Pfade tot oder Partitionen voll? | **Storage / Backup** |
| Welche Portgroups, VLANs, dvSwitches und Security-Settings sind auffällig? | **Network / Security** |
| Welche Host-Uplinks, VMkernel-Adapter und pNICs sind relevant? | **Host-Netzwerk** |
| Welche ESXi-/vCenter-Versionen und Lifecycle-Themen sind sichtbar? | **Compliance / Lifecycle**, **VMware Versions** |
| Wie unterscheiden sich Umgebungen oder Snapshots? | **Fleet Compare** |

## Highlights

| Bereich | Nutzen |
|---|---|
| **RVTools-Import** | Upload von `.xlsx`/`.xls`, Fortschritt, Duplikaterkennung per SHA-256 und Snapshot-Verwaltung |
| **Local-first** | Analyse ohne Backend; Daten liegen lokal in IndexedDB pro Browser-Origin |
| **Mehrere vCenter** | Snapshots werden pro vCenter verwaltet, gefiltert und vergleichbar gemacht |
| **Admin-Dashboards** | Fokus auf Betrieb, Kapazität, Performance, Storage, Netzwerk, Security, Hardware, Lifecycle und Licensing |
| **Globale VM-Filter** | Feldbasierte Filter, Textsuche und automatische Auswahl des neuesten Snapshots je vCenter |
| **Große Exporte** | XLSX-Parsing im Web Worker und virtuelle Tabellen für große RVTools-Dateien |
| **Tech-Info-Erweiterung** | Optionale Zuordnung zusätzlicher CMDB-/Betriebsdaten wie Wartungsfenster, SysV, Standort und Backup-Flag |

## Typischer Workflow

```mermaid
flowchart LR
  A[RVTools Export ausführen] --> B[XLSX lokal importieren]
  B --> C[Snapshot pro vCenter speichern]
  C --> D[Filter setzen]
  D --> E[Dashboards prüfen]
  E --> F[Findings priorisieren]
  F --> G[Späteren Export vergleichen]
```

1. RVTools-Export aus der VMware-Umgebung erzeugen.
2. Datei unter **Uploads & Snapshots** importieren.
3. Optional mehrere vCenter oder wiederholte Exporte importieren.
4. Über globale Filter den Scope eingrenzen, z. B. Cluster, OS, Power-State oder VM-Name.
5. Dashboards für Betrieb, Kapazität, Performance und Lifecycle prüfen.
6. Bei Bedarf Snapshots im **Fleet Compare** gegenüberstellen.

## Schnellstart

### Voraussetzungen

- Node.js 18 oder neuer
- npm

### Lokal starten

```bash
npm install
npm run dev
```

Vite startet die Anwendung standardmäßig unter:

```text
http://localhost:5173
```

### Wichtige Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Lokaler Entwicklungsserver |
| `npm run build` | Production-Build nach `dist` |
| `npm run build:dev` | Development-Build |
| `npm run preview` | Gebauten Stand lokal prüfen |
| `npm run test` | Vitest-Tests ausführen |
| `npm run lint` | ESLint ausführen |
| `npm run cf:login` | Cloudflare-Login via Wrangler |
| `npm run cf:pages:create` | Cloudflare-Pages-Projekt `rvtools` anlegen |
| `npm run cf:pages:deploy` | Production-Deploy nach Cloudflare Pages |
| `npm run cf:pages:deploy:preview` | Preview-Deploy nach Cloudflare Pages |

## Dashboard-Bereiche

| Route | Bereich | Fokus |
|---|---|---|
| `/overview` | Overview | Gesamtüberblick über VMs, Hosts, Cluster, Datastores und Health |
| `/upload` | Uploads & Snapshots | RVTools-Import, Tech-Info-Import, Fortschritt und Snapshot-Verwaltung |
| `/daily-ops` | Daily Ops | Health Events, VM-Snapshots, VMware Tools, Config Issues, verbundene Medien |
| `/capacity` | Capacity | Datastore-Headroom, vCPU/Core, Overcommit, Resource Pools, Hot Hosts |
| `/performance` | Performance | CPU Ready, Memory Pressure, Entitlement Gaps, FT und VM-Netzwerkauffälligkeiten |
| `/storage-backup` | Storage / Backup | Partitionen, Multipath, Dead Paths, Backup-Frische, RDM/VMFS-Indikatoren |
| `/network-security` | Network / Security | VM-Netzwerk, Portgroups, VLANs, Security-Policies und verwaiste Netze |
| `/host-network` | Host-Netzwerk | pNICs, vSwitches, VMkernel, dvSwitch-/dvPort-Sicht |
| `/hardware` | Hardware | Host-Hardware, Modelle, CPU-/RAM-Profile und Standardisierung |
| `/compliance` | Compliance / Lifecycle | Secure Boot, CBT, OS Drift, Tools Upgrade, ESXi Build Drift, NTP/DNS |
| `/licensing` | Licensing | Lizenznutzung, Editionen und Effizienzsicht |
| `/tech-info` | Tech-Info | Betriebsdaten je VM, z. B. Servertyp, Wartungsfenster, SysV und Backup-Flag |
| `/vmware-versions` | VMware Versions | Erkannte vCenter-/ESXi-Builds und Abdeckung bekannter Releases |
| `/fleet-compare` | Fleet Compare | Vergleich mehrerer Snapshots oder Umgebungen |

## Unterstützte Daten

### RVTools-Sheets

Der Import normalisiert zentrale RVTools-Daten und speichert nur Rohdaten, die in den Dashboards tatsächlich verwendet werden.

| Kategorie | Sheets |
|---|---|
| VM-Inventar und Betrieb | `vInfo`, `vTools`, `vSnapshot`, `vCPU`, `vMemory`, `vDisk`, `vPartition`, `vCD`, `vUSB` |
| Hosts und Cluster | `vHost`, `vHBA`, `vNIC`, `vSwitch`, `vPort`, `vSC_VMK` |
| Netzwerk | `vNetwork`, `dvSwitch`, `dvPort` |
| Storage | `vDatastore`, `vMultiPath` |
| Ressourcen und Lizenzen | `vRP`, `vLicense` |
| Quelle und Versionen | `vSource` |

### Tech-Info-Import

Zusätzlich kann eine Tech-Info-XLSX importiert werden. Erforderliche Spalten sind:

```text
Name, Wartungsfenster, Betriebssystem
```

Optionale Felder wie `Servertyp`, `Kommentar`, `SysV`, `SysV Abteilung`, `BZ`, `Schrankreihe`, `CV-Backup` und `AZ` werden in der Tech-Info-Sicht genutzt, sofern sie vorhanden sind.

## Datenhaltung und Datenschutz

| Thema | Verhalten |
|---|---|
| Speicherung | Lokal im Browser über IndexedDB |
| Backend | Nicht vorhanden |
| Upload zu Servern | Nicht vorhanden |
| Datenumfang | Pro Browser-Origin getrennt |
| Löschung | Einzelne Snapshots oder alle importierten Daten im Browser löschbar |
| Duplikate | Wiederholte Dateien werden per SHA-256 erkannt |

Wichtig für den Betrieb: Wenn die App unter einer anderen Domain, Subdomain oder einem anderen Port geöffnet wird, sieht der Browser dies als getrennten Origin. Die dort gespeicherten Snapshots sind deshalb separat.

## Architektur

```mermaid
flowchart TB
  A[React App] --> B[Upload UI]
  B --> C[parser.worker.ts]
  C --> D[Normalisierung im Import-Service]
  D --> E[(IndexedDB)]
  E --> F[TanStack Query Hooks]
  F --> G[Dashboard-Seiten]
  G --> H[Virtual Tables und Charts]
```

| Ebene | Dateien / Technik |
|---|---|
| App und Routing | `src/App.tsx`, `react-router-dom` |
| Layout | `src/app/layout/*`, Sidebar, Theme |
| Domain-Modell | `src/domain/models/types.ts` |
| Import-Pipeline | `src/domain/services/importService.ts` |
| XLSX-Parsing | `src/workers/parser.worker.ts`, `@e965/xlsx` |
| Lokale Datenbank | `src/data/db/index.ts`, `idb` |
| Datenzugriff | `src/hooks/useActiveSnapshots.ts`, TanStack Query |
| Tabellen | `src/components/tables/VirtualTable.tsx`, TanStack Table/Virtual |
| UI | Tailwind CSS, shadcn/ui, Radix UI, lucide-react |
| Diagramme | Recharts |

## Projektstruktur

```text
src/
  app/layout/                 Layout, Sidebar, ThemeProvider
  components/
    dashboard/                KPI-Karten, Filterbar, Empty State
    global-filter/            GlobalFilterControl, Scope-Hinweise
    tables/                   VirtualTable
    ui/                       shadcn/ui-Komponenten
  data/db/                    IndexedDB-Schema und Zugriff
  domain/
    models/                   Zentrale Typen
    services/                 Import-Service und Normalisierung
  hooks/                      Daten- und Filter-Hooks
  lib/
    globalFilter/             Feldbasierter VM-Filter
    xlsx/                     Parse-Helfer
  pages/                      Analyse-Seiten
  workers/                    XLSX-Web-Worker
```

## Deployment

Das Projekt ist als statische Single-Page-App ausgelegt. Ein manueller Cloudflare-Pages-Workflow ist vorbereitet.

### Erstes Cloudflare-Setup

```bash
npm install
npm run cf:login
npm run cf:pages:create
```

`npm run cf:pages:create` legt ein Pages-Projekt namens `rvtools` mit `main` als Production-Branch an.

### Production-Deploy

```bash
npm run cf:pages:deploy
```

### Preview-Deploy

```bash
npm run cf:pages:deploy:preview
```

### Hosting-Hinweise

- Die App nutzt `BrowserRouter`. Das Hosting muss einen SPA-Fallback auf `index.html` unterstützen.
- Die Vite-Konfiguration ist aktuell für Deployment am Domain-Root ausgelegt.
- Bei Deployment unter einem Subpfad muss die Vite-Option `base` geprüft und angepasst werden.
- Importierte Daten bleiben immer lokal im Browser und werden nicht zwischen Domains oder Subdomains geteilt.

## Qualitätssicherung

| Check | Erwartung |
|---|---|
| `npm run test` | Tests mit Vitest ausführen |
| `npm run lint` | ESLint ausführen und neue Lint-Probleme vermeiden |
| `npm run build` | Production-Build prüfen, besonders bei Änderungen an Build, Routing oder Hosting |

Bekannte bestehende Lint-Themen können u. a. `no-explicit-any`, `no-empty-object-type` und `no-require-imports` betreffen. Neue Änderungen sollten keine zusätzlichen Probleme einführen.

## Entwicklungsregeln

- Neue Seiten in `src/App.tsx` routen und in `src/app/layout/AppSidebar.tsx` verlinken.
- Änderungen am Datenmodell in `src/domain/models/types.ts` beginnen und danach Import-Service, DB und Hooks synchron halten.
- Bei IndexedDB-Schemaänderungen `DB_VERSION` erhöhen und Migrationen in `src/data/db/index.ts` pflegen.
- Datenzugriff bevorzugt über bestehende Hooks in `src/hooks/useActiveSnapshots.ts` umsetzen.
- Für große Tabellen `VirtualTable` verwenden.
- Importlogik bleibt clientseitig: Web Worker plus IndexedDB, keine Serverpersistenz.
- `@/*`-Alias statt tiefer relativer Pfade verwenden.
- Dateien als UTF-8 pflegen und deutsche Umlaute normal schreiben.

## Grenzen

RVTools Analyzer ersetzt kein Monitoring, kein vROps/Aria Operations und keine zentrale CMDB. Die App analysiert importierte RVTools- und Tech-Info-Snapshots. Aussagen hängen deshalb vom Stand und Umfang der importierten Dateien ab.

## Lizenz

Aktuell ist keine Lizenzdatei im Repository hinterlegt.
