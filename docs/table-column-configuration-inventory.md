# Inventur: konfigurierbare VirtualTables

Stand: 2026-08-01

Diese Inventur ist die stabile Zuordnung der produktiven `VirtualTable`-Einbindungen zu ihren persönlichen Tabellenansichten. Die `tableId` wird nicht aus Route, Überschrift, Array-Index oder Dateiname abgeleitet. Die Spalten-IDs und Header bleiben an der jeweils genannten `ColumnDef`-Quelle die einzige fachliche Quelle; dadurch entsteht keine zweite, veraltbare Header-Kopie in dieser Dokumentation.

Alle Einträge haben `columnPicker` aktiviert. Die erste fachliche Spalte bleibt sichtbar. Technische Spalten werden von `VirtualTable` bzw. über `ColumnMeta.configurable/exportable` aus Konfiguration und Export ausgeschlossen.

| Nr. | `tableId` | Einbindung | Spaltenquelle / Kontext | technische Ausnahme |
| ---: | --- | --- | --- | --- |
| 1 | `network/cdp-switch-ports` | `pages/CdpSwitchPorts.tsx` | `columns` – Switch-Port/CDP | — |
| 2 | `clusters/capacity-health` | `components/cluster/ClusterCapacityPanel.tsx` | `capacityColumns` – Capacity Health | — |
| 3 | `clusters/capacity-overcommit` | `components/cluster/ClusterCapacityPanel.tsx` | `overcommitColumns` – Overcommit | — |
| 4 | `clusters/density` | `components/cluster/ClusterCapacityPanel.tsx` | `densityColumns` – Cluster-Density | — |
| 5 | `clusters/resource-pools` | `components/cluster/ResourcePoolPressurePanel.tsx` | `columns` – Resource Pools | — |
| 6 | `planning/vm-selection` | `components/cluster/ClusterPlanningPanel.tsx` | `vmColumns` – VM-Auswahl | `__selection` bleibt fix und wird nicht exportiert |
| 7 | `maintenance/cluster-assignments` | `components/cluster/ClusterMaintenancePanel.tsx` | `columns` – Cluster/Wartungszuordnung | `select` bleibt fix und wird nicht exportiert |
| 8 | `compliance/vcenter-versions` | `components/vmware-versions/VmwareReleaseTables.tsx` | `columns` – vCenter-Releases | — |
| 9 | `compliance/esxi-versions` | `components/vmware-versions/VmwareReleaseTables.tsx` | `columns` – ESXi-Releases | — |
| 10 | `clusters/infrastructure-drivers` | `components/cluster/ClusterInfrastructurePanel.tsx` | `driverColumns` – Infrastruktur/Treiber | — |
| 11 | `clusters/overview` | `components/cluster/ClusterOverviewPanel.tsx` | `clusterOverviewColumns` – Cluster-Übersicht | — |
| 12 | `clusters/os-distribution` | `components/cluster/ClusterOverviewPanel.tsx` | `osColumns(...)` – OS je Cluster | — |
| 13 | `maintenance/system-assignments` | `components/maintenance-windows/MaintenanceAssignmentsPanel.tsx` | `columns` – Systeme/Wartungsfenster | — |
| 14 | `maintenance/window-systems` | `components/maintenance-windows/MaintenanceAssignmentsPanel.tsx` | `systemColumns` – Systeme eines Fensters | — |
| 15 | `dashboard/health-events` | `components/dashboard/HealthEventsPanel.tsx` | `healthColumns` – Health Events | — |
| 16 | `licensing/details` | `components/licensing/LicenseDetailsTable.tsx` | `licenseColumns` – Lizenzdetails | — |
| 17 | `fleet/current-vcenter` | `pages/FleetCompare.tsx` | `fleetColumns` – einzelnes vCenter | — |
| 18 | `fleet/vcenter-overview` | `pages/FleetCompare.tsx` | `fleetColumns` – vCenter-Vergleich | — |
| 19 | `overview/vcenter-summaries` | `components/fleet/VCenterOverviewTable.tsx` | `columns` – vCenter-Kurzüberblick | — |
| 20 | `network/vlan-usage` | `pages/VlanUsage.tsx` | `columns` – VLAN-Nutzung | — |
| 21 | `network/ipam` | `pages/IpamPanel.tsx` | `columns` – IPAM | — |
| 22 | `imports/upload-inventory` | `pages/UploadSnapshots.tsx` | `uploadColumns` – Uploads | `actions` bleibt fix und wird nicht exportiert |
| 23 | `network/eramon-l2` | `pages/EramonL2Panel.tsx` | `columns` – Eramon L2 | — |
| 24 | `tech-info/servers` | `pages/TechInfo.tsx` | `columns` – Tech-Info Server | — |
| 25 | `tech-info/clients` | `pages/TechInfo.tsx` | `clientColumns` – Tech-Info Clients | — |
| 26 | `tech-info/unassigned-vms` | `pages/TechInfo.tsx` | `unassignedColumns` – nicht zugeordnete VMs | — |
| 27 | `network/eramon-iface` | `pages/EramonIfacePanel.tsx` | `columns` – Eramon Interfaces | — |
| 28 | `storage/guest-partitions` | `pages/StorageBackup.tsx` | `partColumns` – Gast-Partitionen | — |
| 29 | `storage/datastore-efficiency` | `pages/StorageBackup.tsx` | `dsEffColumns` – Datastore-Effizienz | — |
| 30 | `storage/sioc` | `pages/StorageBackup.tsx` | `siocColumns` – SIOC | — |
| 31 | `storage/datastore-lifecycle` | `pages/StorageBackup.tsx` | `dsLifeColumns` – Datastore-Lifecycle | — |
| 32 | `storage/dead-path-hosts` | `pages/StorageBackup.tsx` | `deadPathHostColumns` – Dead Paths | — |
| 33 | `storage/multipath` | `pages/StorageBackup.tsx` | `mpColumns` – Multipath | — |
| 34 | `storage/virtual-disks` | `pages/StorageBackup.tsx` | `diskColumns` – virtuelle Disks | — |
| 35 | `storage/scsi-mapping` | `pages/StorageBackup.tsx` | `scsiColumns` – SCSI/Controller | — |
| 36 | `storage/backup-coverage` | `pages/StorageBackup.tsx` | `backupColumns` – Backup-Frische | — |
| 37 | `storage/backup-conflicts` | `pages/StorageBackup.tsx` | `backupColumns` – Snapshot/Backup-Konflikte | — |
| 38 | `vms/workload-profile` | `components/vm/VmWorkloadProfilePanel.tsx` | `columns` – berechenbare Workload-Profile | `sparkline` ist reine Visualisierung und wird nicht angeboten/exportiert |
| 39 | `vms/workload-profile-uncomputable` | `components/vm/VmWorkloadProfilePanel.tsx` | `uncomputableColumns` – nicht berechenbare Profile | — |
| 40 | `vms/tools-wave-plan` | `components/vm/VmToolsWavePlan.tsx` | `toolsWaveColumns` – Tools-Wellenplan | — |
| 41 | `network/host-drift` | `pages/HostNetwork.tsx` | `driftColumns` – Host-Drift | — |
| 42 | `network/host-variants` | `pages/HostNetwork.tsx` | `variantColumns` – Konfigurationsvarianten | — |
| 43 | `network/vds-membership` | `pages/HostNetwork.tsx` | `dvsColumns` – vDS-Membership | — |
| 44 | `network/uplink-detail` | `pages/HostNetwork.tsx` | `nicColumns` – Uplink-Belegung | — |
| 45 | `hardware/variants` | `pages/Hardware.tsx` | `columns` – Hardware-Varianten | — |
| 46 | `overview/cluster-overview` | `pages/Overview.tsx` | `clusterOverviewColumns` – Overview-Cluster | — |
| 47 | `network/security-policies` | `pages/NetworkSecurity.tsx` | `policyColumns` – Security Policies | — |
| 48 | `network/uplink-redundancy` | `pages/NetworkSecurity.tsx` | `uplinkColumns` – Uplink-Risiken | — |
| 49 | `network/nic-teaming` | `pages/NetworkSecurity.tsx` | `teamingColumns` – NIC Teaming | — |
| 50 | `network/vmk-adapters` | `pages/NetworkSecurity.tsx` | `vmkColumns` – VMkernel Adapter | — |
| 51 | `network/physical-nics` | `pages/NetworkSecurity.tsx` | `nicColumns` – physische NICs | — |
| 52 | `vms/rightsizing-growth-groups` | `components/vm/VmRightsizingPanel.tsx` | `growthGroupColumns` – Grow-Gruppen | — |
| 53 | `vms/rightsizing-candidates` | `components/vm/VmRightsizingPanel.tsx` | `candidateColumns` – Rightsizing-Kandidaten | — |
| 54 | `vms/rightsizing-cluster-summary` | `components/vm/VmRightsizingPanel.tsx` | `summaryColumns` – Cluster-Summary | — |
| 55 | `vms/rightsizing-shape-summary` | `components/vm/VmRightsizingPanel.tsx` | `summaryColumns` – Lastmuster-Summary | — |
| 56 | `hosts/hygiene` | `components/hosts/HostHygienePanel.tsx` | `columns` – NTP/DNS-Hygiene | — |
| 57 | `vms/rightsizing-density-details` | `components/vm/VmRightsizingDensityDialog.tsx` | `columns` – VMs einer Density-Kachel | — |
| 58 | `vms/performance-cpu-ready` | `components/vm/VmPerformancePanel.tsx` | `perfColumns` – CPU Ready | — |
| 59 | `vms/performance-memory-pressure` | `components/vm/VmPerformancePanel.tsx` | `memColumns` – Memory Pressure | — |
| 60 | `vms/performance-entitlement-gaps` | `components/vm/VmPerformancePanel.tsx` | `entitlementColumns` – Entitlements | — |
| 61 | `vms/performance-ft-latency` | `components/vm/VmPerformancePanel.tsx` | `ftColumns` – FT/Latenz | — |
| 62 | `vms/performance-vm-network` | `components/vm/VmPerformancePanel.tsx` | `vmNetColumns` – VM-Netzwerk | — |
| 63 | `vms/performance-latency-sensitivity` | `components/vm/VmPerformancePanel.tsx` | `latencyColumns` – Latency Sensitivity | — |
| 64 | `vms/compliance` | `components/vm/VmComplianceLifecyclePanel.tsx` | `compColumns` – VM-Compliance | — |
| 65 | `vms/compliance-hardware-upgrade` | `components/vm/VmComplianceLifecyclePanel.tsx` | `hwUpgradeColumns` – Hardware-Upgrade | — |
| 66 | `vms/operations-config` | `components/vm/VmOperationsPanel.tsx` | `issueColumns` – Konfigurationsprobleme | — |
| 67 | `vms/operations-snapshots` | `components/vm/VmOperationsPanel.tsx` | `snapshotColumns` – Snapshots | — |
| 68 | `storage/datastore-details` | `components/storage/DatastoreCapacityDetails.tsx` | `datastoreColumns` – Datastore-Details | — |
| 69 | `storage/thin-risk` | `components/storage/DatastoreCapacityDetails.tsx` | `thinRiskColumns` – Thin-Provisioning | — |
| 70 | `storage/thin-disk-details` | `components/storage/DatastoreCapacityDetails.tsx` | `thinDiskColumns` – Thin Disks | — |
| 71 | `vms/inventory` | `components/vm/VmInventoryTable.tsx` | `vmColumns` – VM-Inventar | — |
| 72 | `tech-info/organisation-vm-drilldown` | `components/tech-info/TechInfoOrganisationPanel.tsx` | `drilldownColumns` – Organisation/VM-Drill-down | alte `tech-info-organisation`-Präferenz wird migriert |
| 73 | `planning/what-if-clusters` | `components/planning/WhatIfComparisonTable.tsx` | `columns` – What-If-Clustervergleich | — |
| 74 | `network-audit/port-mappings` | `components/network/NetworkAuditDetails.tsx` | `portColumns` – Switch-Port-Zuordnungen | — |
| 75 | `network-audit/host-rvtools` | `components/network/NetworkAuditDetails.tsx` | `rvtoolsHostColumns` – Hostqualität RVTools | — |
| 76 | `network-audit/host-tech-info` | `components/network/NetworkAuditDetails.tsx` | `techInfoHostColumns` – Hostqualität Tech-Info | — |
| 77 | `network-audit/mac-cdp` | `components/network/NetworkAuditDetails.tsx` | `cdpMacColumns` – MAC/CDP | — |
| 78 | `network-audit/mac-discovery` | `components/network/NetworkAuditDetails.tsx` | `l2DiscoveryColumns` – MAC-Discovery | — |
| 79 | `planning/policy-cluster-assignment` | `components/planning/policies/PolicyClusterAssignmentTable.tsx` | `columns` – Policy-Zuweisung | — |
| 80 | `planning/fill-up-clusters` | `components/planning/fill-up/FillUpClusterTable.tsx` | `columns` – Fill-Up-Cluster | — |
| 81 | `planning/fill-up-observed-vm-profiles` | `components/planning/fill-up/FillUpObservedVmProfileTable.tsx` | `columns` – beobachtete VM-Profile | — |
| 82 | `hosts/inventory` | `components/hosts/HostInventoryPanel.tsx` | `hostColumns` – Host-Inventar | — |

## Technische Prüfpunkte

- `VirtualTable` filtert technische IDs (`__selection`, `select`, `actions`, `expand`, `collapse`, `sparkline`) sowie `meta.configurable === false` aus dem Picker.
- `meta.exportable === false` und technische IDs werden aus Datei- und Zwischenablage-Exporten entfernt.
- Sortierbare Spalten werden über `column.getCanSort()` ermittelt; nicht sortierbare Spalten erscheinen im Dialog deaktiviert.
- Die erste fachliche Leaf-Spalte bleibt sichtbar. Präferenzen pro `tableId` liegen gemeinsam im `UiState` `table-display-preferences`.
