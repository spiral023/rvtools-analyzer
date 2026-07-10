# ANALYSIS: RVTools Auswertungen fuer VMware Betrieb, Planung und Troubleshooting

## Ziel
Diese Datei beschreibt einen praxistauglichen Analysekatalog fuer RVTools-Exporte einer VMware-Farm.
Annahme: Pro vCenter liegt ein RVTools-Export vor. Mehrere Exporte koennen zu einer Fleet-Sicht zusammengefuehrt werden.

## Datenbasis und Modell
Verwendete Hauptblaetter aus `Vorlage_Analyse.md`:
- `vInfo`, `vCPU`, `vMemory`, `vDisk`, `vPartition`, `vNetwork`, `vSnapshot`, `vTools`
- `vCluster`, `vHost`, `vRP`, `vDatastore`, `vMultiPath`
- `vSwitch`, `vPort`, `dvSwitch`, `dvPort`, `vSC_VMK`, `vNIC`, `vHBA`
- `vLicense`, `vHealth`, `vSource`, `vMetaData`

Empfohlene Schluessel fuer Zusammenfuehrung:
- `vcenter_id`: aus `vMetaData.Server` oder `vSource.Name/Fullname`
- `export_ts`: aus `vMetaData.xlsx creation datetime` (in Datum konvertieren)
- `vm_key`: `vInfo.VM UUID` plus `vcenter_id`
- `host_key`: `vHost.Host` plus `vcenter_id`
- `cluster_key`: `vCluster.Name` plus `vcenter_id`
- `ds_key`: `vDatastore.Name` plus `vcenter_id`

Mehrere vCenter zusammenführen:
- Je vCenter wird der aktuelle Export als Snapshot geladen; ein neuer Export ersetzt den bisherigen Stand desselben vCenters.
- Cross-vCenter-Analysen (Fleet-Sicht) laufen über `vcenter_id` auf identischen Keys.

## Kategorien und Analysen

## 1) Daily Operations und Health
| Analyse | Nutzen fuer Admin | Datenquellen | KPI/Regel | Visualisierung |
|---|---|---|---|---|
| Health Event Uebersicht | Schneller Tagesstatus | `vHealth` | Anzahl Messages nach `Message type`, Top Objekte nach Message-Anzahl | KPI-Kacheln, Balken Top 20 |
| Konfigurationsprobleme VMs | Sofortige Betriebsrisiken | `vInfo` | Anteil `Config status != green` | Donut + Detailtabelle |
| VM Verbindungsstatus | Erkennung verwaister/disconnected VMs | `vInfo` | `Connection state` ungleich `connected` | Statusmatrix je Cluster |
| Konsolidierungsbedarf | Snapshot/Delta-Probleme erkennen | `vInfo` | `Consolidation Needed = True` | Liste mit Prioritaet |
| VMware Tools Hygiene | Gastagent-Qualitaet | `vTools` | `Tools != toolsOk` oder `Upgradeable != No` | Heatmap Cluster x Status |
| Snapshot Hygiene | Risiko fuer Backup/Performance | `vSnapshot` | Snapshot-Anzahl, Snapshot-Alter, `Size MiB (total)` | Top-Liste nach Alter/Groesse |
| CD/USB Exposure | Versehentlich verbundene Devices finden | `vCD`, `vUSB` | Anzahl verbundener Devices je VM | Tabelle + Ampel |
| Powerstate Verteilung | Basisinventar fuer Betrieb | `vInfo` | Count `poweredOn/off/suspended` | Donut |

## 2) Kapazitaet und Sizing
| Analyse | Nutzen fuer Admin | Datenquellen | KPI/Regel | Visualisierung |
|---|---|---|---|---|
| Cluster CPU Overcommit | Fruehe Ueberlastungsindikatoren | `vCPU`, `vCluster` | `sum(vCPU.CPUs poweredOn) / vCluster.NumCpuThreads` | Cluster-Ranking |
| Cluster RAM Overcommit | Kapazitaetsplanung RAM | `vMemory`, `vCluster` | `sum(vMemory.Size MiB poweredOn) / vCluster.TotalMemory` | Balken + Schwellwerte |
| Datastore Headroom | Speicherrisiko minimieren | `vDatastore` | `Free %`, `Free MiB` | Ampel |
| Host Dichte | Konsolidierungsdruck erkennen | `vHost`, `vCPU` | VMs/Host, vCPU/Core | Scatter Plot |
| Resource Pool Pressure | Fehlkonfigurationen bei Limits/Reservations | `vRP` | Hohe Reservations, harte Limits, Expandable=False | Tabelle nach Risiko |
| Thin-Provisioning Risiko | Ueberbuchung kontrollieren | `vDisk`, `vDatastore` | Anteil `Thin=True` + geringer DS-Freespace | Bubble Chart |
| Unshared vs Provisioned | Einsparpotenzial und Speicherwirkgrad | `vInfo`, `vDatastore` | `Unshared MiB`, `Provisioned MiB`, `In Use MiB` | KPI-Kacheln |

## 3) Performance und Troubleshooting
| Analyse | Nutzen fuer Admin | Datenquellen | KPI/Regel | Visualisierung |
|---|---|---|---|---|
| CPU Ready Hotspots | Scheduling-Engpaesse finden | `vInfo` | `Overall Cpu Readiness` ueber Schwellwert | Top-N VM Tabelle |
| Memory Druck auf VM Ebene | Ballooning/Swapping sofort sehen | `vMemory` | `Swapped > 0` oder `Ballooned > 0` | Ampelliste |
| Entitlement Luecken | QoS/Ueberprovisionierung sichtbar | `vCPU`, `vMemory` | Unterschied zwischen `Entitlement`, `DRS Entitlement`, Usage | Delta-Balken |
| FT Latenz Monitoring | FT-Stabilitaet absichern | `vInfo` | `FT Sec. Latency` und `FT Latency` Status | FT-Risiko Dashboard |
| Host NIC Link Qualitaet | Netzwerk-Bottlenecks auf Host-Ebene | `vNIC` | niedrige `Speed`, Duplex-Probleme | Host NIC Matrix |
| Multipath Stabilitaet | Storage-Pfadprobleme erkennen | `vMultiPath` | Anzahl nicht-`active` Pfade, `Oper. State != ok` | Pfadstatus-Heatmap |
| Storage Congestion Kontext | I/O-Probleme mit SIOC kombinieren | `vDatastore` | `SIOC enabled`, `SIOC Threshold`, sinkende Free% | Kombi-Panel |
| VM Netzwerkanomalien | Falsch konfigurierte vNICs finden | `vNetwork` | disconnected Adapter, fehlende IPs, ungueltige Portgroup | Exception-Liste |

## 4) Storage, Backup und Recovery
| Analyse | Nutzen fuer Admin | Datenquellen | KPI/Regel | Visualisierung |
|---|---|---|---|---|
| Backup Frische (VM) | RPO-Risiko erkennen | `vInfo`, `vDisk`, `vPartition` | `Last Backup` Alter > SLA | SLA-Ampel |
| Backup Coverage | Fehlende Backup-Zuordnung finden | `vInfo`, `vDisk`, `vPartition` | Leere/ungueltige `Backup Status` | Coverage KPI |
| Gast-Filesystem Platzmangel | Ticketflut vermeiden | `vPartition` | `Free %` unter Schwellwert | Top-Liste je Applikation |
| Datastore Fragmentierung (indirekt) | Storage-Rebalancing priorisieren | `vDatastore`, `vDisk` | Hohe Belegung + viele grosse Thin-Disks | Priorisierungstabelle |
| Snapshot + Backup Konflikte | Restore-Risiko reduzieren | `vSnapshot`, `vInfo` | Alte Snapshots + schlechte Backup-Frische | Korrelationstabelle |
| Raw/RDM Uebersicht | Sonderfaelle fuer Betrieb dokumentieren | `vDisk` | `Raw=True`, `Raw LUN ID` vorhanden | Inventarliste |
| SCSI/Controller Mapping | Root-Cause bei I/O-Problemen | `vDisk` | Verteilung nach `Controller`, `SCSI Unit #`, `Disk Mode` | Technische Drilldown-Sicht |
| MHA/VMFS Upgradeability | Storage-Lifecycle planen | `vDatastore` | `VMFS Upgradeable`, `MHA` | Compliance-Panel |

## 5) Netzwerk und Security Posture
| Analyse | Nutzen fuer Admin | Datenquellen | KPI/Regel | Visualisierung |
|---|---|---|---|---|
| VLAN Inventar und Nutzung | Segmentierungsueberblick | `vPort`, `dvPort`, `vNetwork` | VLAN-Haeufigkeit, ungenutzte Portgroups | Balken + Detail |
| Security Policy Drift | Unsichere Policies sofort erkennen | `vSwitch`, `vPort`, `dvPort` | `Promiscuous`, `Mac Changes`, `Forged Transmits` = True | Compliance-Heatmap |
| Uplink Redundanz | SPOF im Netz vermeiden | `dvPort`, `dvSwitch`, `vNIC` | fehlende Standby/Active Uplinks | Risiko-Ranking |
| MTU Konsistenz | vMotion/vSAN Probleme vermeiden | `vSC_VMK`, `vSwitch`, `dvSwitch` | MTU-Mismatch je Host/Netz | Konsistenz-Report |
| VMkernel Service-Netze | Management/vMotion Absicherung | `vSC_VMK` | DHCP unerwuenscht, falsches Gateway/Subnet | Exception-Liste |
| Link Speed Baseline | Kapazitaetsabgleich Netzwerk | `vNIC` | Verteilung nach `Speed` und Host | Histogramm |
| dVSwitch Konfig Drift | Standardisierung sicherstellen | `dvSwitch`, `dvPort` | Unterschiedliche Policies pro Portgroup | Delta-Tabelle |
| NIC Teaming Richtlinien | Betriebsstabilitaet | `vSwitch`, `vPort`, `dvPort` | ungueltige/uneinheitliche `Policy` | Policy-Dashboard |

## 6) Compliance, Hardening und Standardisierung
| Analyse | Nutzen fuer Admin | Datenquellen | KPI/Regel | Visualisierung |
|---|---|---|---|---|
| Secure Boot/Firmware | Sicherheitsbaseline VM | `vInfo` | `EFI Secure boot` aus, altes `Firmware` | Compliance KPI |
| Hardware Version Drift | Upgrade-Priorisierung | `vInfo`, `vTools` | alte `HW version`, `HW upgrade status` | Upgrade Backlog |
| CBT Policy Check | Backup-Readiness | `vInfo` | `CBT` nicht wie Standard gesetzt | Abweichungsreport |
| UUID/Identity Vollstaendigkeit | CMDB-Qualitaet | `vInfo` | fehlende `SMBIOS UUID`/`VM UUID` | Datenqualitaetsreport |
| OS Discovery Konsistenz | Agent-/Inventarqualitaet | `vInfo` | Unterschied config-OS vs tools-OS | Driftliste |
| Annotation/Tag Governance | Betriebskontext absichern | `vInfo` | leere Pflichtfelder (`Annotation`, benutzerdef. Felder) | Data-Quality Panel |
| FT/HA Policy Konformitaet | Verfuegbarkeitsstandard pruefen | `vInfo` | FT/HA Felder ausserhalb Zielprofil | Regelverletzungsliste |
| Latency Sensitivity Sonderfaelle | Ressourcenkonflikte vermeiden | `vInfo` | unpassende `Latency Sensitivity` | Sonderfall-Report |

## 7) Lifecycle, Patch und Plattform-Management
| Analyse | Nutzen fuer Admin | Datenquellen | KPI/Regel | Visualisierung |
|---|---|---|---|---|
| vCenter Versionsstand | Plattform-Homogenitaet | `vSource` | Version/Build Drift ueber vCenter | Versionsmatrix |
| ESXi Build Drift | Patch-Planung | `vHost` | unterschiedliche Version/Build pro Cluster | Heatmap Cluster x Build |
| HBA/NIC Treiberstand | Hardware-Stabilitaet | `vHBA`, `vNIC` | Treibervarianten je Cluster/Host | Treiberinventar |
| CPU Generation Mix | EVC/Placement Risiko | `vHost`, `vCluster` | heterogene CPU-Modelle im Cluster | Cluster-Risiko Score |
| Host Wartungsmodus Tracking | Operative Wartungsplanung | `vHost` | Hosts in Maintenance/Quarantine | Tagesstatus |
| NTP/DNS Hygiene | Zeit-/Namensprobleme vermeiden | `vHost`, `vSC_VMK` | fehlende oder inkonsistente Settings | Compliance-Liste |
| VM Hardware Upgrade Backlog | Planbarer Upgrade-Fahrplan | `vInfo`, `vTools` | `HW upgrade status` offen | Backlog-Kanban |
| VMTools Upgrade Wellenplanung | Betriebsfenster optimieren | `vTools` | Upgrade-faeige VMs pro Cluster | Planungsboard |

## 8) Lizenz und Kostennaehe
| Analyse | Nutzen fuer Admin | Datenquellen | KPI/Regel | Visualisierung |
|---|---|---|---|---|
| Lizenzauslastung | Compliance und Budget | `vLicense` | `Used/Total` je Lizenz | KPI-Karten |
| Lizenzablauf Monitoring | Verlaengerungen planen | `vLicense` | `Expiration Date` nahe Stichtag | Timeline |
| Feature Mapping | Produktnutzung verstehen | `vLicense` | Features pro vCenter/Umgebung | Matrix |
| Kostennahe Clusterdichte | Effizienzkennzahl fuer Management | `vCluster`, `vHost`, `vInfo` | VMs/Host, vCPU/Core, RAM Auslastung | Executive Summary |
| Idle/Stilllegungskandidaten | Lizenz- und Betriebsoptimierung | `vInfo`, `vCPU`, `vMemory` | poweredOff lange Zeit, niedrige Nutzung | Candidate-Liste |
| Datastore Effizienz | Speicherkosten steuern | `vDatastore`, `vInfo` | Provisioned vs InUse vs Free | Wasserfallchart |

## 9) Multi-vCenter Fleet Analysen
Diese Analysen sind nur mit mehreren vCentern sinnvoll.

| Analyse | Zweck | Datenquellen | Ergebnis |
|---|---|---|---|
| Plattform-Benchmark | Vergleich zwischen vCentern | `vSource`, `vCluster`, `vHost` | Ranking nach Dichte, Version, Kapazitaet |
| Einheitlichkeit von Policies | Betriebsstandardisierung | `vSwitch`, `vPort`, `dvPort`, `vInfo` | Abweichungsbericht je vCenter |
| Konsolidierter Risikoindex | Priorisierung teamweit | `vHealth`, `vSnapshot`, `vDatastore`, `vMemory` | Gesamt-Risiko je vCenter/Cluster |
| Shared Services Impact | Abhaengigkeiten uebergreifend sehen | `vDatastore`, `vMultiPath`, `dvSwitch` | Kritische gemeinsame Komponenten |
| Betriebsqualitaet Score | SLA/OLA Vergleich | mehrere Kategorien | Vergleich pro vCenter |

## Dashboard-Vorschlaege (fertige Sichten)
## A) Daily Admin Cockpit
- Offene Health-Meldungen
- VMs mit `Consolidation Needed`
- Alte Snapshots
- Datastores mit `Free %` unter Schwellwert
- Hosts mit Netzwerk/Multipath Auffaelligkeiten

## B) Capacity Board (woche/monat)
- Cluster CPU/RAM Overcommit
- Datastore Headroom
- VM-Dichte pro Host und Cluster
- `Provisioned MiB` vs. `In Use MiB` je Datastore

## C) Security und Compliance Board
- Security Policy Drift (Promiscuous/MAC/Forged)
- Secure Boot/Firmware/HW Version Abweichungen
- Tools und Patch Drift
- Governance (Tags/Annotations/Backup Coverage)

## D) Troubleshooting Board (incident mode)
- Betroffene VM/Host/Datastore Korrelation
- CPU Ready + Memory Swapped/Ballooned
- Path State und NIC Link Status
- Relevante vHealth Meldungen im Zeitfenster

## E) Management Summary
- Top Risiken (10 Punkte)
- Aktuelle Kapazitaetslage (Overcommit, Headroom)
- Lizenzstatus und Ablauf
- Standardisierungsgrad ueber vCenter

## Empfohlene Schwellwerte (Startwerte)
Diese Werte sind als Startpunkt gedacht und sollten je Umgebung kalibriert werden.

| Kennzahl | Startwert Warnung | Startwert Kritisch |
|---|---:|---:|
| Datastore Free % | < 20% | < 10% |
| Gast-Partition Free % | < 20% | < 10% |
| CPU Ready (VM) | > 5% | > 10% |
| Memory Swapped (VM) | > 0 MiB | anhaltend > 0 MiB |
| Snapshot Alter | > 3 Tage | > 7 Tage |
| Snapshot Groesse | > 20 GiB | > 50 GiB |
| Lizenzauslastung | > 85% | > 95% |
| Nicht-aktive Multipath Pfade | > 0 | mehrere Pfade/Datastore |

## Betriebsprozesse und Frequenz
| Frequenz | Ziel | Typische Analysen |
|---|---|---|
| Taeglich | Stabilitaet und schnelle Reaktion | Daily Admin Cockpit, Health, Snapshots, Freespace |
| Woechentlich | Fehlerpraevention | Capacity Board, Policy Drift, Backup Frische |
| Monatlich | Planung und Governance | Lifecycle, Lizenz, Standardisierung |
| Vor Wartungsfenster | Risiko minimieren | Troubleshooting Board, Multipath/NIC/HA Checks |

## Nutzen fuer den VMware Administrator
- Schnellere Stoerungsanalyse durch korrelierte Sicht auf VM, Host, Netzwerk und Storage.
- Bessere Planbarkeit von Ressourcen durch Kapazitaets- und Overcommit-Analysen.
- Weniger Betriebsrisiko durch standardisierte Health-, Compliance- und Backup-Kontrollen.
- Hoehere Transparenz ueber mehrere vCenter fuer Team, Architektur und Management.

