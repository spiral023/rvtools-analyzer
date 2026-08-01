# vROps 8.18.x Metrik-Referenz

## Zweck

Dieses Dokument ist eine maschinenlesbare Referenz aller in VMware Aria
Operations (vRealize Operations Manager) 8.18 verfügbaren Metriken und deren
Beschreibung. Es dient Agenten als Quelle, um Metriken zu identifizieren, deren
Zweck zu verstehen und die richtigen Metriken für Analysen, Views, Reports oder
Alerts auszuwählen.

**Produkt:** VMware Aria Operations 8.18 (vROps 8.18.x)
**Eingesetzte Version:** 8.18.7
**Quelle:** Broadcom TechDocs – VMware Aria Operations 8.18 User Guide, Metric
Definitions

## Inhaltsverzeichnis

1. [Virtual Machine Metrics](#1-virtual-machine-metrics)
2. [Host System Metrics](#2-host-system-metrics)
3. [Cluster Compute Resource Metrics](#3-cluster-compute-resource-metrics)
4. [vCenter Server Metrics](#4-vcenter-server-metrics)
5. [Resource Pool Metrics](#5-resource-pool-metrics)
6. [Data Center Metrics](#6-data-center-metrics)
7. [Custom Datacenter Metrics](#7-custom-datacenter-metrics)
8. [Datastore Metrics](#8-datastore-metrics)
9. [Datastore Cluster Metrics](#9-datastore-cluster-metrics)
10. [Storage Pod Metrics](#10-storage-pod-metrics)
11. [vSphere World Metrics](#11-vsphere-world-metrics)
12. [VMware Distributed Virtual Switch Metrics](#12-vmware-distributed-virtual-switch-metrics)
13. [Distributed Virtual Port Group Metrics](#13-distributed-virtual-port-group-metrics)
14. [Calculated Metrics – Capacity Analytics](#14-calculated-metrics--capacity-analytics)
15. [Badge Metrics](#15-badge-metrics)
16. [System Metrics](#16-system-metrics)
17. [Sustainability Metrics](#17-sustainability-metrics)
18. [Allocation Model – Cost Metrics](#18-allocation-model--cost-metrics)
19. [vSAN Cluster Metrics](#19-vsan-cluster-metrics)
20. [Quellen und Referenzen](#quellen-und-referenzen)

---

## 1. Virtual Machine Metrics

VMware Aria Operations sammelt Konfigurations-, CPU-Auslastungs-, Speicher-,
Datastore-, Festplatten-, virtuelle Festplatten-, Guest-Dateisystem-, Netzwerk-,
Power-, Speicherplatz- und Zusammenfassungs-Metriken für virtuelle Maschinen.

**Gesamtanzahl:** ca. 351 Metriken in 19 Kategorien

### 1.1 CPU Usage Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| CPU\|Demand (MHz) | MHz | CPU-Auslastung basierend auf der VM-Nutzung, inklusive Reservierungen, Limits und Overhead |
| CPU\|Demand (%) | % | CPU-Demand als Prozentsatz |
| CPU\|Usage (MHz) | MHz | Tatsächliche CPU-Nutzung der VM |
| CPU\|Usage (%) | % | CPU-Nutzung als Prozentsatz |
| CPU\|Contention (%) | % | CPU-Contention als Prozentsatz |
| CPU\|Ready (%) | % | Prozentsatz der Zeit, in der die VM bereit war, aber nicht ausgeführt wurde |
| CPU\|Wait (%) | % | Prozentsatz der Zeit, in der die VM auf I/O oder andere Ressourcen gewartet hat |
| CPU\|Idle (%) | % | Prozentsatz der Leerlaufzeit |
| CPU\|Co-Stop (%) | % | Co-Scheduling-Verzögerung bei vSMP-VMs |
| CPU\|Overlap (%) | % | Overlap-Zeit bei vSMP-VMs |
| CPU\|IOWait (%) | % | I/O-Wartezeit als Prozentsatz |
| CPU\|Swap Wait (%) | % | Swap-Wartezeit als Prozentsatz |
| CPU\|Total Capacity (MHz) | MHz | Gesamte CPU-Kapazität der VM |
| CPU\|Total Capacity (GHz) | GHz | Gesamte CPU-Kapazität der VM in GHz |
| CPU\|Peak vCPU Ready within collection cycle (%) | % | Höchster Ready-Wert einer einzelnen vCPU im Sammlungsintervall |
| CPU\|Peak vCPU Co-Stop within collection cycle (%) | % | Höchster Co-Stop-Wert einer einzelnen vCPU im Sammlungsintervall |
| CPU\|Peak vCPU Overlap within collection cycle (%) | % | Höchster Overlap-Wert einer einzelnen vCPU im Sammlungsintervall |
| CPU\|Peak vCPU Usage within collection cycle (%) | % | Höchste Auslastung einer einzelnen vCPU im Sammlungsintervall |
| CPU\|vCPU Usage Disparity (%) | % | Abstand zwischen höchster und niedrigster vCPU-Auslastung |
| CPU\|Capacity Remaining | – | Verbleibende CPU-Kapazität |
| CPU\|Time Remaining | Tage | Verbleibende Zeit bis zur CPU-Kapazitätsgrenze |
| CPU\|Stress | – | CPU-Stress-Indikator |
| CPU\|Capacity | MHz | CPU-Kapazität |

### 1.2 Memory Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Memory\|Active (KB) | KB | Aktuell genutzter Speicher der VM |
| Memory\|Consumed (KB) | KB | Verbrauchter Host-Speicher durch die VM |
| Memory\|Granted (KB) | KB | Zugewiesener Speicher |
| Memory\|Swap Used (KB) | KB | Genutzter Swap-Speicher |
| Memory\|Swap In (KB) | KB | Swap-In-Rate |
| Memory\|Swap Out (KB) | KB | Swap-Out-Rate |
| Memory\|Ballooned (KB) | KB | Durch Ballooning freigegebener Speicher |
| Memory\|Compressed (KB) | KB | Komprimierter Speicher |
| Memory\|Compression Rate (KB/s) | KB/s | Speicher-Kompressionsrate |
| Memory\|Decompression Rate (KB/s) | KB/s | Speicher-Dekompressionsrate |
| Memory\|Overhead (KB) | KB | VMkernel-Overhead für die VM |
| Memory\|Overhead Touched (KB) | KB | Berührter Overhead-Speicher |
| Memory\|Shared (KB) | KB | Geteilter Speicher (TPS) |
| Memory\|Shared Common (KB) | KB | Gemeinsamer geteilter Speicher |
| Memory\|Zeroed (KB) | KB | Null-initialisierter Speicher |
| Memory\|Swapped (KB) | KB | Ausgelagerter Speicher |
| Memory\|Swap In Rate (KB/s) | KB/s | Swap-In-Rate pro Sekunde |
| Memory\|Swap Out Rate (KB/s) | KB/s | Swap-Out-Rate pro Sekunde |
| Memory\|Utilization | – | Speicherauslastung |
| Memory\|Guest Needed (KB) | KB | Vom Guest OS benötigter Speicher |
| Memory\|Reservation (KB) | KB | Speicher-Reservierung |
| Memory\|Limit (KB) | KB | Speicher-Limit |
| Memory\|Capacity Remaining | – | Verbleibende Speicherkapazität |
| Memory\|Time Remaining | Tage | Verbleibende Zeit bis zur Speichergrenze |
| Memory\|Stress | – | Memory-Stress-Indikator |
| Memory\|Capacity | KB | Speicherkapazität |
| Memory\|Host Demand (KB) | KB | Speicherbedarf vom Host gesehen |
| Memory\|Host Usage (KB) | KB | Speichernutzung vom Host gesehen |
| Memory\|Workload | – | Memory-Workload |

### 1.3 Disk Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Disk\|Total Read IOPS | IOPS | Gesamte Lese-IOPS |
| Disk\|Total Write IOPS | IOPS | Gesamte Schreib-IOPS |
| Disk\|Total IOPS | IOPS | Gesamte IOPS (Read + Write) |
| Disk\|Read Latency (ms) | ms | Lese-Latenz |
| Disk\|Write Latency (ms) | ms | Schreib-Latenz |
| Disk\|Total Latency (ms) | ms | Gesamte Latenz |
| Disk\|Read Throughput (KBps) | KBps | Lese-Durchsatz |
| Disk\|Write Throughput (KBps) | KBps | Schreib-Durchsatz |
| Disk\|Total Throughput (KBps) | KBps | Gesamtdurchsatz |
| Disk\|Commands Averaged | – | Durchschnittliche Kommandos |
| Disk\|Queue Latency (ms) | ms | Warteschlangen-Latenz |
| Disk\|Kernel Latency (ms) | ms | Kernel-Latenz |
| Disk\|Device Latency (ms) | ms | Geräte-Latenz |
| Disk\|Suspend Latency (ms) | ms | Suspend-Latenz |
| Disk\|VSCSI Latency (ms) | ms | Virtual SCSI-Latenz |

### 1.4 Virtual Disk Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Virtual Disk\|Read IOPS | IOPS | Lese-IOPS pro virtuellem Disk |
| Virtual Disk\|Write IOPS | IOPS | Schreib-IOPS pro virtuellem Disk |
| Virtual Disk\|Total IOPS | IOPS | Gesamte IOPS pro virtuellem Disk |
| Virtual Disk\|Read Throughput (KBps) | KBps | Lese-Durchsatz pro virtuellem Disk |
| Virtual Disk\|Write Throughput (KBps) | KBps | Schreib-Durchsatz pro virtuellem Disk |
| Virtual Disk\|Total Throughput (KBps) | KBps | Gesamtdurchsatz pro virtuellem Disk |
| Virtual Disk\|Read Latency (ms) | ms | Lese-Latenz pro virtuellem Disk |
| Virtual Disk\|Write Latency (ms) | ms | Schreib-Latenz pro virtuellem Disk |
| Virtual Disk\|Total Latency (ms) | ms | Gesamte Latenz pro virtuellem Disk |

### 1.5 Network Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Network\|Ingress Traffic (KBps) | KBps | Eingehender Netzwerkverkehr |
| Network\|Egress Traffic (KBps) | KBps | Ausgehender Netzwerkverkehr |
| Network\|Total Traffic (KBps) | KBps | Gesamter Netzwerkverkehr |
| Network\|Packets In | packets/s | Eingehende Pakete pro Sekunde |
| Network\|Packets Out | packets/s | Ausgehende Pakete pro Sekunde |
| Network\|Packets Dropped In | packets/s | Verworfene eingehende Pakete |
| Network\|Packets Dropped Out | packets/s | Verworfene ausgehende Pakete |
| Network\|Broadcast In | packets/s | Eingehende Broadcast-Pakete |
| Network\|Broadcast Out | packets/s | Ausgehende Broadcast-Pakete |
| Network\|Multicast In | packets/s | Eingehende Multicast-Pakete |
| Network\|Multicast Out | packets/s | Ausgehende Multicast-Pakete |
| Network\|Unicast In | packets/s | Eingehende Unicast-Pakete |
| Network\|Unicast Out | packets/s | Ausgehende Unicast-Pakete |
| Network\|Errors In | errors/s | Eingehende Fehler |
| Network\|Errors Out | errors/s | Ausgehende Fehler |

### 1.6 Configuration Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Configuration\|Hardware\|Number of CPUs (vCPUs) | vCPUs | Anzahl der konfigurierten vCPUs |
| Configuration\|Hardware\|Memory (MB) | MB | Konfigurierter Speicher |
| Configuration\|Hardware\|Disk Space (GB) | GB | Konfigurierter Festplattenplatz |
| Configuration\|Guest OS | – | Gastbetriebssystem |
| Configuration\|Power State | – | Power-Status (poweredOn, poweredOff, suspended) |
| Configuration\|Guest OS Full Name | – | Vollständiger Name des Gastbetriebssystems |
| Configuration\|Hardware\|CPU Reservation | MHz | CPU-Reservierung |
| Configuration\|Hardware\|CPU Limit | MHz | CPU-Limit |
| Configuration\|Hardware\|Memory Reservation | MB | Speicher-Reservierung |
| Configuration\|Hardware\|Memory Limit | MB | Speicher-Limit |
| Configuration\|CPU Shares | – | CPU-Shares |
| Configuration\|Memory Shares | – | Memory-Shares |
| Configuration\|Tools Status | – | VMware Tools-Status |
| Configuration\|Annotation | – | VM-Annotation |
| Configuration\|Is Template | – | VM-Template-Flag |
| Configuration\|UUID | – | VM-UUID |

### 1.7 Power Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Power\|Power State | – | Power-Status der VM |
| Power\|On Time | – | Einschaltdauer |

### 1.8 Guest File System Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Guest Filesystem\|Capacity (GB) | GB | Kapazität des Guest-Dateisystems |
| Guest Filesystem\|Free Space (GB) | GB | Freier Platz im Guest-Dateisystem |
| Guest Filesystem\|Used Space (GB) | GB | Belegter Platz im Guest-Dateisystem |
| Guest Filesystem\|Used (%) | % | Belegter Platz in Prozent |

### 1.9 Guest Operating System Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Guest\|Peak Guest OS Page-out/rate within collection cycle | rate | Höchste Memory Page-out-Rate des Guest OS, gemessen als Peak eines 20-Sekunden-Durchschnitts während des Sammlungsintervalls |

### 1.10 Datastore Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Datastore\|Total IOPS | IOPS | Gesamte IOPS auf dem Datastore |
| Datastore\|Read IOPS | IOPS | Lese-IOPS auf dem Datastore |
| Datastore\|Write IOPS | IOPS | Schreib-IOPS auf dem Datastore |
| Datastore\|Total Latency (ms) | ms | Gesamte Latenz auf dem Datastore |

### 1.11 Summary Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Summary\|Total Number of VMs | – | Gesamtzahl der VMs |
| Summary\|Total Number of Running VMs | – | Anzahl laufender VMs |
| Summary\|Total Number of Stopped VMs | – | Anzahl gestoppter VMs |
| Summary\|Total Number of Suspended VMs | – | Anzahl suspendierter VMs |

### 1.12 ROI Dashboard Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Potential Memory Consumed Reclaimable | GB | Summe des reclaimable consumed Memory für die VM |
| Potential CPU Cores Reclaimable | Count | Anzahl der reclaimable CPU-Cores |
| Potential Memory Reclaimable | GB | Summe des reclaimable Memory |
| Potential VM Reclaimable | Count | Anzahl der reclaimable VMs |
| Potential Snapshot Reclaimable | GB | Summe des reclaimable Snapshot-Speichers |

---

## 2. Host System Metrics

VMware Aria Operations sammelt CPU-, Disk-, Memory-, Network-, Power-,
Storage-, Summary- und GPU-Metriken für Host-Systeme.

**Gesamtanzahl:** ca. 250+ Metriken in 22 Kategorien

### 2.1 CPU Usage Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| CPU\|Demand (MHz) | MHz | CPU-Demand des Hosts |
| CPU\|Demand (%) | % | CPU-Demand als Prozentsatz |
| CPU\|Usage (MHz) | MHz | Tatsächliche CPU-Nutzung des Hosts |
| CPU\|Usage (%) | % | CPU-Nutzung als Prozentsatz |
| CPU\|Contention (%) | % | CPU-Contention als Prozentsatz |
| CPU\|Capacity (MHz) | MHz | Gesamte CPU-Kapazität des Hosts |
| CPU\|Capacity Available to VMs (MHz) | MHz | Für VMs verfügbare CPU-Kapazität |
| CPU\|Core Utilization (%) | % | Auslastung einzelner CPU-Cores |
| CPU\|Idle (%) | % | Leerlaufzeit |
| CPU\|Ready (%) | % | Ready-Zeit |
| CPU\|Used (MHz) | MHz | Genutzte CPU |
| CPU\|Reserved Capacity (MHz) | MHz | Reservierte CPU-Kapazität |
| CPU\|Total Demand (MHz) | MHz | Gesamter CPU-Bedarf |
| CPU\|Overhead (MHz) | MHz | CPU-Overhead |
| CPU\|Hyper Threading | – | Hyper-Threading-Status |
| CPU\|Number of Cores | Count | Anzahl physischer CPU-Cores |
| CPU\|Number of Threads | Count | Anzahl CPU-Threads |
| CPU\|Stress | – | CPU-Stress-Indikator |
| CPU\|Capacity Remaining | – | Verbleibende CPU-Kapazität |
| CPU\|Time Remaining | Tage | Verbleibende Zeit bis zur CPU-Kapazitätsgrenze |

### 2.2 Memory Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Memory\|Active (KB) | KB | Aktuell genutzter Speicher |
| Memory\|Consumed (KB) | KB | Verbrauchter Speicher |
| Memory\|Granted (KB) | KB | Zugewiesener Speicher |
| Memory\|Swap Used (KB) | KB | Genutzter Swap-Speicher |
| Memory\|Swapped (KB) | KB | Ausgelagerter Speicher |
| Memory\|Swap In Rate (KB/s) | KB/s | Swap-In-Rate |
| Memory\|Swap Out Rate (KB/s) | KB/s | Swap-Out-Rate |
| Memory\|Ballooned (KB) | KB | Durch Ballooning freigegebener Speicher |
| Memory\|Compressed (KB) | KB | Komprimierter Speicher |
| Memory\|Overhead (KB) | KB | VMkernel-Overhead |
| Memory\|Shared (KB) | KB | Geteilter Speicher (TPS) |
| Memory\|Shared Common (KB) | KB | Gemeinsamer geteilter Speicher |
| Memory\|Zeroed (KB) | KB | Null-initialisierter Speicher |
| Memory\|Total (KB) | KB | Gesamter physischer Speicher |
| Memory\|Capacity (KB) | KB | Speicherkapazität |
| Memory\|Capacity Available to VMs (KB) | KB | Für VMs verfügbare Speicherkapazität |
| Memory\|Reservation | KB | Speicher-Reservierung |
| Memory\|Utilization | – | Speicherauslastung |
| Memory\|Workload | – | Memory-Workload |
| Memory\|Stress | – | Memory-Stress-Indikator |
| Memory\|Capacity Remaining | – | Verbleibende Speicherkapazität |
| Memory\|Time Remaining | Tage | Verbleibende Zeit bis zur Speichergrenze |
| Memory\|Host Demand (KB) | KB | Speicherbedarf |
| Memory\|Host Usage (KB) | KB | Speichernutzung |

### 2.3 Disk Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Disk\|Total Read IOPS | IOPS | Gesamte Lese-IOPS |
| Disk\|Total Write IOPS | IOPS | Gesamte Schreib-IOPS |
| Disk\|Total IOPS | IOPS | Gesamte IOPS |
| Disk\|Read Latency (ms) | ms | Lese-Latenz |
| Disk\|Write Latency (ms) | ms | Schreib-Latenz |
| Disk\|Total Latency (ms) | ms | Gesamte Latenz |
| Disk\|Read Throughput (KBps) | KBps | Lese-Durchsatz |
| Disk\|Write Throughput (KBps) | KBps | Schreib-Durchsatz |
| Disk\|Total Throughput (KBps) | KBps | Gesamtdurchsatz |
| Disk\|Kernel Latency (ms) | ms | Kernel-Latenz |
| Disk\|Device Latency (ms) | ms | Geräte-Latenz |
| Disk\|Queue Latency (ms) | ms | Warteschlangen-Latenz |

### 2.4 Network Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Network\|Ingress Traffic (KBps) | KBps | Eingehender Netzwerkverkehr |
| Network\|Egress Traffic (KBps) | KBps | Ausgehender Netzwerkverkehr |
| Network\|Total Traffic (KBps) | KBps | Gesamter Netzwerkverkehr |
| Network\|Packets In | packets/s | Eingehende Pakete pro Sekunde |
| Network\|Packets Out | packets/s | Ausgehende Pakete pro Sekunde |
| Network\|Packets Dropped In | packets/s | Verworfene eingehende Pakete |
| Network\|Packets Dropped Out | packets/s | Verworfene ausgehende Pakete |
| Network\|Errors In | errors/s | Eingehende Fehler |
| Network\|Errors Out | errors/s | Ausgehende Fehler |

### 2.5 Storage Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Storage\|Total IOPS | IOPS | Gesamte Storage-IOPS |
| Storage\|Read IOPS | IOPS | Lese-IOPS |
| Storage\|Write IOPS | IOPS | Schreib-IOPS |
| Storage\|Total Throughput (KBps) | KBps | Gesamter Storage-Durchsatz |
| Storage\|Read Throughput (KBps) | KBps | Lese-Durchsatz |
| Storage\|Write Throughput (KBps) | KBps | Schreib-Durchsatz |

### 2.6 Power Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Power\|Power State | – | Power-Status des Hosts |
| Power\|Energy (Joule) | Joule | Energieverbrauch in Joule |

### 2.7 Runtime Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Runtime\|Maintenance State | – | Maintenance-Status (notInMaintenance, inMaintenance, enteringMaintenance) |
| Runtime\|Connection State | – | Verbindungsstatus (connected, disconnected, notResponding) |
| Runtime\|Power State | – | Power-Status (poweredOn, poweredOff, standby) |
| Runtime\|Status | – | Host-Status |

### 2.8 Configuration Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Configuration\|CPU\|Total MHz | MHz | Gesamte CPU-Frequenz |
| Configuration\|CPU\|Cores | Count | Anzahl CPU-Cores |
| Configuration\|CPU\|Threads | Count | Anzahl CPU-Threads |
| Configuration\|Memory\|Total (MB) | MB | Gesamter physischer Speicher |
| Configuration\|Hardware\|Model | – | Hardwaremodell |
| Configuration\|Hardware\|Vendor | – | Hardwarehersteller |
| Configuration\|Hardware\|CPU Model | – | CPU-Modell |
| Configuration\|Hypervisor\|Version | – | ESXi-Version |
| Configuration\|Hypervisor\|Build | – | ESXi-Build-Nummer |
| Configuration\|Network\|Number of NICs | Count | Anzahl Netzwerkkarten |
| Configuration\|Storage\|Number of HBAs | Count | Anzahl Host Bus Adapter |

### 2.9 GPU Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| GPU\|Compute Utilization (%) | % | GPU-Compute-Auslastung |
| GPU\|Memory Usage (%) | % | GPU-Speicherauslastung |
| GPU\|Memory Used (KB) | KB | Genutzter GPU-Speicher |
| GPU\|Number of GPUs | Count | Anzahl GPUs |
| GPU\|Total Memory (KB) | KB | Gesamter GPU-Speicher |
| GPU\|Memory Reserved (KB) | KB | Reservierter GPU-Speicher |

### 2.10 Summary Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Summary\|Total Number of VMs | – | Gesamtzahl der VMs auf dem Host |
| Summary\|Total Number of Running VMs | – | Anzahl laufender VMs |
| Summary\|Total Number of Stopped VMs | – | Anzahl gestoppter VMs |

### 2.11 ROI Dashboard Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Reclaimable Host Cost | Currency | Kosten für reclaimable Hosts |
| Reclaimable Host Count | Count | Anzahl reclaimable Hosts |

---

## 3. Cluster Compute Resource Metrics

VMware Aria Operations sammelt CPU-, Disk-, Memory-, Network-, Storage-,
Summary- und GPU-Metriken für Cluster Compute Resources.

**Gesamtanzahl:** ca. 226 Metriken in 17 Kategorien

### 3.1 CPU Usage Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| CPU\|Demand (MHz) | MHz | CPU-Demand des Clusters (Summe aller VM-Demands) |
| CPU\|Demand (%) | % | CPU-Demand als Prozentsatz |
| CPU\|Usage (MHz) | MHz | Tatsächliche CPU-Nutzung des Clusters |
| CPU\|Usage (%) | % | CPU-Nutzung als Prozentsatz |
| CPU\|Contention (%) | % | CPU-Contention als Prozentsatz |
| CPU\|Capacity (MHz) | MHz | Gesamte CPU-Kapazität des Clusters |
| CPU\|Capacity Available to VMs (MHz) | MHz | Für VMs verfügbare CPU-Kapazität |
| CPU\|Overhead (MHz) | MHz | CPU-Overhead |
| CPU\|Reserved Capacity (MHz) | MHz | Reservierte CPU-Kapazität |
| CPU\|Total Demand (MHz) | MHz | Gesamter CPU-Bedarf |
| CPU\|Stress | – | CPU-Stress-Indikator |
| CPU\|Capacity Remaining | – | Verbleibende CPU-Kapazität |
| CPU\|Time Remaining | Tage | Verbleibende Zeit bis zur CPU-Kapazitätsgrenze |
| CPU\|Workload | – | CPU-Workload |
| CPU\|Provisioned Capacity (MHz) | MHz | Bereitgestellte CPU-Kapazität |

### 3.2 Memory Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Memory\|Demand (KB) | KB | Speicherbedarf des Clusters |
| Memory\|Demand (%) | % | Speicherbedarf als Prozentsatz |
| Memory\|Usage (KB) | KB | Speichernutzung des Clusters |
| Memory\|Usage (%) | % | Speichernutzung als Prozentsatz |
| Memory\|Utilization (MB) | MB | Speicherauslastung (absolut) |
| Memory\|Capacity (KB) | KB | Gesamte Speicherkapazität |
| Memory\|Capacity Available to VMs (KB) | KB | Für VMs verfügbare Speicherkapazität |
| Memory\|Overhead (KB) | KB | Speicher-Overhead |
| Memory\|Granted (KB) | KB | Zugewiesener Speicher |
| Memory\|Active (KB) | KB | Aktuell genutzter Speicher |
| Memory\|Consumed (KB) | KB | Verbrauchter Speicher |
| Memory\|Ballooned (KB) | KB | Durch Ballooning freigegebener Speicher |
| Memory\|Swapped (KB) | KB | Ausgelagerter Speicher |
| Memory\|Compressed (KB) | KB | Komprimierter Speicher |
| Memory\|Shared (KB) | KB | Geteilter Speicher (TPS) |
| Memory\|Stress | – | Memory-Stress-Indikator |
| Memory\|Capacity Remaining | – | Verbleibende Speicherkapazität |
| Memory\|Time Remaining | Tage | Verbleibende Zeit bis zur Speichergrenze |
| Memory\|Workload | – | Memory-Workload |

### 3.3 Disk Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Disk\|Total Read IOPS | IOPS | Gesamte Lese-IOPS |
| Disk\|Total Write IOPS | IOPS | Gesamte Schreib-IOPS |
| Disk\|Total IOPS | IOPS | Gesamte IOPS |
| Disk\|Read Throughput (KBps) | KBps | Lese-Durchsatz |
| Disk\|Write Throughput (KBps) | KBps | Schreib-Durchsatz |
| Disk\|Total Throughput (KBps) | KBps | Gesamtdurchsatz |
| Disk\|Read Latency (ms) | ms | Lese-Latenz |
| Disk\|Write Latency (ms) | ms | Schreib-Latenz |
| Disk\|Total Latency (ms) | ms | Gesamte Latenz |

### 3.4 Network Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Network\|Ingress Traffic (KBps) | KBps | Eingehender Netzwerkverkehr |
| Network\|Egress Traffic (KBps) | KBps | Ausgehender Netzwerkverkehr |
| Network\|Total Traffic (KBps) | KBps | Gesamter Netzwerkverkehr |
| Network\|Packets In | packets/s | Eingehende Pakete pro Sekunde |
| Network\|Packets Out | packets/s | Ausgehende Pakete pro Sekunde |

### 3.5 Configuration Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Configuration\|Number of Hosts | Count | Anzahl Hosts im Cluster |
| Configuration\|Number of VMs | Count | Anzahl VMs im Cluster |
| Configuration\|DRS Enabled | – | DRS-Status |
| Configuration\|DRS Automation Level | – | DRS-Automatisierungslevel |
| Configuration\|HA Enabled | – | HA-Status |
| Configuration\|HA Failover Level | – | HA-Failover-Level |
| Configuration\|CPU\|Total MHz | MHz | Gesamte CPU-Kapazität |
| Configuration\|CPU\|Cores | Count | Anzahl CPU-Cores |
| Configuration\|Memory\|Total (MB) | MB | Gesamter Speicher |

### 3.6 GPU Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| GPU\|Compute Utilization | % | GPU-Compute-Auslastung |
| GPU\|Memory Usage | % | GPU-Speicherauslastung |
| GPU\|Memory Used | KB | Genutzter GPU-Speicher |
| GPU\|Number of GPUs | Count | Anzahl GPUs |
| GPU\|Total Memory | KB | Gesamter GPU-Speicher |

### 3.7 Summary Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Summary\|Total Number of VMs | – | Gesamtzahl der VMs im Cluster |
| Summary\|Total Number of Running VMs | – | Anzahl laufender VMs |
| Summary\|Total Number of Hosts | – | Anzahl Hosts im Cluster |
| Summary\|Total Number of Powered On Hosts | – | Anzahl eingeschalteter Hosts |

### 3.8 ROI Dashboard Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Total Number Of Reclaimable Hosts | Count | Anzahl reclaimable Hosts |
| Total Reclaimable Host Cost | Currency | Kosten für reclaimable Hosts |

---

## 4. vCenter Server Metrics

VMware Aria Operations sammelt CPU-, Disk-, Memory-, Network- und
Summary-Metriken für vCenter Server System-Objekte.

### 4.1 CPU Usage Metrics

| Metrikname | Einheit | Beschreibung | Key |
|---|---|---|---|
| Capacity Usage (%) | % | Percent capacity used | `cpu\|capacity_usagepct_average` |
| CPU Contention (%) | % | Percent CPU contention | `cpu\|capacity_contentionPct` |
| Demand (%) | % | Percent demand | `cpu\|demandPct` |
| Demand (MHz) | MHz | CPU utilization level based on descendant VMs utilization | `cpu\|demandmhz` |
| IO Wait (ms) | ms | IO wait time in milliseconds | `cpu\|iowait` |
| Usage (MHz) | MHz | CPU usage in MHz | `cpu\|usagemhz` |
| Usage (%) | % | CPU usage percentage | `cpu\|usage_average` |
| Used (MHz) | MHz | CPU used in MHz | `cpu\|usedmhz` |
| Wait (%) | % | CPU wait percentage | `cpu\|wait` |

### 4.2 Memory Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Memory\|Active (KB) | KB | Aktuell genutzter Speicher |
| Memory\|Consumed (KB) | KB | Verbrauchter Speicher |
| Memory\|Granted (KB) | KB | Zugewiesener Speicher |
| Memory\|Swap Used (KB) | KB | Genutzter Swap-Speicher |
| Memory\|Overhead (KB) | KB | VMkernel-Overhead |
| Memory\|Usage (%) | % | Speichernutzung als Prozentsatz |
| Memory\|Workload | – | Memory-Workload |

### 4.3 Disk Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Disk\|Total IOPS | IOPS | Gesamte IOPS |
| Disk\|Read IOPS | IOPS | Lese-IOPS |
| Disk\|Write IOPS | IOPS | Schreib-IOPS |
| Disk\|Total Throughput (KBps) | KBps | Gesamtdurchsatz |
| Disk\|Read Latency (ms) | ms | Lese-Latenz |
| Disk\|Write Latency (ms) | ms | Schreib-Latenz |

### 4.4 Network Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Network\|Ingress Traffic (KBps) | KBps | Eingehender Netzwerkverkehr |
| Network\|Egress Traffic (KBps) | KBps | Ausgehender Netzwerkverkehr |
| Network\|Total Traffic (KBps) | KBps | Gesamter Netzwerkverkehr |

### 4.5 Summary Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Summary\|Total Number of Hosts | Count | Anzahl verwalteter Hosts |
| Summary\|Total Number of VMs | Count | Anzahl verwalteter VMs |
| Summary\|Total Number of Clusters | Count | Anzahl verwalteter Cluster |
| Summary\|Total Number of Datastores | Count | Anzahl verwalteter Datastores |

---

## 5. Resource Pool Metrics

VMware Aria Operations sammelt Konfigurations-, CPU-Auslastungs-, Speicher- und
Zusammenfassungs-Metriken für Resource Pool-Objekte.

### 5.1 Configuration Metrics

| Metrikname | Einheit | Beschreibung | Key |
|---|---|---|---|
| Memory Allocation Reservation | – | Memory Allocation Reservation | `config\|mem_alloc_reservation` |

### 5.2 CPU Usage Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| CPU\|Demand (MHz) | MHz | CPU-Demand des Resource Pools |
| CPU\|Demand (%) | % | CPU-Demand als Prozentsatz |
| CPU\|Usage (MHz) | MHz | CPU-Nutzung des Resource Pools |
| CPU\|Usage (%) | % | CPU-Nutzung als Prozentsatz |
| CPU\|Contention (%) | % | CPU-Contention |
| CPU\|Capacity (MHz) | MHz | CPU-Kapazität |
| CPU\|Stress | – | CPU-Stress |
| CPU\|Capacity Remaining | – | Verbleibende CPU-Kapazität |
| CPU\|Time Remaining | Tage | Verbleibende Zeit |

### 5.3 Memory Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Memory\|Demand (KB) | KB | Speicherbedarf |
| Memory\|Usage (KB) | KB | Speichernutzung |
| Memory\|Utilization | – | Speicherauslastung |
| Memory\|Capacity (KB) | KB | Speicherkapazität |
| Memory\|Stress | – | Memory-Stress |
| Memory\|Capacity Remaining | – | Verbleibende Speicherkapazität |
| Memory\|Time Remaining | Tage | Verbleibende Zeit |

### 5.4 Summary Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Summary\|Total Number of VMs | Count | Anzahl VMs im Resource Pool |
| Summary\|Total Number of Running VMs | Count | Anzahl laufender VMs |
| Summary\|Total Number of Child Resource Pools | Count | Anzahl untergeordneter Resource Pools |

---

## 6. Data Center Metrics

VMware Aria Operations sammelt CPU-, Disk-, Memory-, Network- und
Summary-Metriken für Data Center-Objekte.

**Gesamtanzahl:** ca. 140 Metriken in 13 Kategorien

### 6.1 CPU Usage Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| CPU\|Demand (MHz) | MHz | CPU-Demand des Data Centers |
| CPU\|Demand (%) | % | CPU-Demand als Prozentsatz |
| CPU\|Usage (MHz) | MHz | CPU-Nutzung |
| CPU\|Usage (%) | % | CPU-Nutzung als Prozentsatz |
| CPU\|Contention (%) | % | CPU-Contention |
| CPU\|Capacity (MHz) | MHz | CPU-Kapazität |
| CPU\|Stress | – | CPU-Stress |
| CPU\|Capacity Remaining | – | Verbleibende CPU-Kapazität |
| CPU\|Time Remaining | Tage | Verbleibende Zeit |

### 6.2 Memory Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Memory\|Demand (KB) | KB | Speicherbedarf |
| Memory\|Usage (KB) | KB | Speichernutzung |
| Memory\|Utilization | – | Speicherauslastung |
| Memory\|Capacity (KB) | KB | Speicherkapazität |
| Memory\|Stress | – | Memory-Stress |
| Memory\|Capacity Remaining | – | Verbleibende Speicherkapazität |

### 6.3 ROI Dashboard Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Realized Savings Idle Cost | Currency | Realisierte Einsparungen durch Idle-VMs |
| Realized Savings Powered Off Cost | Currency | Realisierte Einsparungen durch ausgeschaltete VMs |
| Realized Savings Snapshot Space Cost | Currency | Realisierte Einsparungen durch Snapshot-Bereinigung |
| Realized Savings Oversized Cost | Currency | Realisierte Einsparungen durch Rightsizing |
| Potential Savings Idle Cost | Currency | Potenzielle Einsparungen durch Idle-VMs |
| Potential Savings Powered Off Cost | Currency | Potenzielle Einsparungen durch ausgeschaltete VMs |
| Potential Savings Snapshot Space Cost | Currency | Potenzielle Einsparungen durch Snapshot-Bereinigung |
| Potential Savings Oversized Cost | Currency | Potenzielle Einsparungen durch Rightsizing |

### 6.4 Summary Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Summary\|Total Number of Clusters | Count | Anzahl Cluster |
| Summary\|Total Number of Hosts | Count | Anzahl Hosts |
| Summary\|Total Number of VMs | Count | Anzahl VMs |
| Summary\|Total Number of Datastores | Count | Anzahl Datastores |

---

## 7. Custom Datacenter Metrics

VMware Aria Operations sammelt CPU-Auslastung-, Speicher-, Zusammenfassungs-,
Netzwerk- und Datastore-Metriken für Custom Data Center-Objekte.

### 7.1 CPU Usage Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| CPU\|Host Provisioned Capacity | MHz | Host-bereitgestellte CPU-Kapazität |
| CPU\|Provisioned vCPU(s) | vCPUs | Bereitgestellte vCPUs |
| CPU\|Demand without overhead | MHz | CPU-Demand ohne Overhead |
| CPU\|Number of hosts stressed | Count | Anzahl gestresster Hosts |
| CPU\|Stress Balance Factor | – | Stress-Balance-Faktor |
| CPU\|Capacity Remaining | – | Verbleibende CPU-Kapazität |
| CPU\|Time Remaining | Tage | Verbleibende Zeit |

### 7.2 Memory Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Memory\|Host Provisioned Capacity | KB | Host-bereitgestellte Speicherkapazität |
| Memory\|Provisioned Memory | KB | Bereitgestellter Speicher |
| Memory\|Demand without overhead | KB | Speicherbedarf ohne Overhead |
| Memory\|Number of hosts stressed | Count | Anzahl gestresster Hosts |
| Memory\|Stress Balance Factor | – | Stress-Balance-Faktor |
| Memory\|Capacity Remaining | – | Verbleibende Speicherkapazität |
| Memory\|Time Remaining | Tage | Verbleibende Zeit |

### 7.3 Summary Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Summary\|Total Number of VMs | Count | Anzahl VMs |
| Summary\|Total Number of Hosts | Count | Anzahl Hosts |
| Summary\|Total Number of Clusters | Count | Anzahl Cluster |

---

## 8. Datastore Metrics

VMware Aria Operations sammelt Capacity-, Device-, Disk-Space- und
Summary-Metriken für Datastore-Objekte.

### 8.1 Capacity Metrics

| Metrikname | Einheit | Beschreibung | Key |
|---|---|---|---|
| Capacity\|Available Space | GB | Freier Speicherplatz | `capacity\|available_space` |
| Capacity\|Provisioned | GB | Zugewiesener Speicherplatz | `capacity\|provisioned` |
| Capacity\|Total Capacity | GB | Gesamtgröße des Datastore | `capacity\|total_capacity` |
| Capacity\|Used Space | GB | Belegter Speicherplatz | `capacity\|used_space` |
| Capacity\|Workload | % | Capacity Workload | `capacity\|workload` |
| Capacity\|Uncommitted Space | GB | Uncommitted Speicherplatz | `capacity\|uncommitted` |
| Capacity\|Used Space (%) | % | Prozentsatz belegter Speicher | `capacity\|usedSpacePct` |

### 8.2 Device Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Device\|Read IOPS | IOPS | Lese-IOPS |
| Device\|Write IOPS | IOPS | Schreib-IOPS |
| Device\|Total IOPS | IOPS | Gesamte IOPS |
| Device\|Read Throughput (KBps) | KBps | Lese-Durchsatz |
| Device\|Write Throughput (KBps) | KBps | Schreib-Durchsatz |
| Device\|Total Throughput (KBps) | KBps | Gesamtdurchsatz |
| Device\|Read Latency (ms) | ms | Lese-Latenz |
| Device\|Write Latency (ms) | ms | Schreib-Latenz |
| Device\|Total Latency (ms) | ms | Gesamte Latenz |

### 8.3 Disk Space Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Disk Space\|Total (GB) | GB | Gesamter Speicherplatz |
| Disk Space\|Used (GB) | GB | Belegter Speicherplatz |
| Disk Space\|Free (GB) | GB | Freier Speicherplatz |
| Disk Space\|Used (%) | % | Belegter Speicherplatz in Prozent |
| Disk Space\|Provisioned (GB) | GB | Bereitgestellter Speicherplatz |
| Disk Space\|Uncommitted (GB) | GB | Uncommitted Speicherplatz |
| Disk Space\|Overcommitted (%) | % | Überbuchung in Prozent |

### 8.4 Summary Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Summary\|Total Number of VMs | Count | Anzahl VMs auf dem Datastore |
| Summary\|Total Number of Hosts | Count | Anzahl verbundener Hosts |

---

## 9. Datastore Cluster Metrics

VMware Aria Operations sammelt Profil-Metriken für Datastore Cluster-Ressourcen.

### 9.1 Profiles Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Profiles\|Capacity Remaining Profile (Average) | – | Verbleibende Kapazität basierend auf dem durchschnittlichen Consumer-Profil |
| Profiles\|Capacity Remaining Profile (Custom) | – | Verbleibende Kapazität basierend auf benutzerdefinierten Profilen |

---

## 10. Storage Pod Metrics

VMware Aria Operations sammelt Datastore- und Disk-Space-Metriken für Storage
Pod-Objekte.

### 10.1 Datastore Metrics

| Metrikname | Einheit | Beschreibung | Key |
|---|---|---|---|
| Read IOPS | IOPS | Average number of read commands per second | `datastore\|numberReadAveraged_average` |
| Writes per second | IOPS | Average number of write commands per second | `datastore\|numberWriteAveraged_average` |
| Read Throughput (KBps) | KBps | Amount of data read | `datastore\|read_average` |
| Write Throughput (KBps) | KBps | Amount of data written | `datastore\|write_average` |
| Total Throughput (KBps) | KBps | Usage Average | `datastore\|usage_average` |
| Total Latency (ms) | ms | Total latency | `datastore\|totalLatency_average` |
| Read Latency (ms) | ms | Read latency | `datastore\|readLatency_average` |
| Write Latency (ms) | ms | Write latency | `datastore\|writeLatency_average` |

### 10.2 Disk Space Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Disk Space\|Total (GB) | GB | Gesamter Speicherplatz |
| Disk Space\|Used (GB) | GB | Belegter Speicherplatz |
| Disk Space\|Free (GB) | GB | Freier Speicherplatz |
| Disk Space\|Used (%) | % | Belegter Speicherplatz in Prozent |

---

## 11. vSphere World Metrics

VMware Aria Operations sammelt CPU-, Disk-, Memory-, Network- und
Summary-Metriken für Objekte in der vSphere World.

### 11.1 CPU Usage Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| CPU\|Demand (MHz) | MHz | CPU-Demand |
| CPU\|Usage (MHz) | MHz | CPU-Nutzung |
| CPU\|Usage (%) | % | CPU-Nutzung als Prozentsatz |
| CPU\|Contention (%) | % | CPU-Contention |
| CPU\|Capacity (MHz) | MHz | CPU-Kapazität |
| CPU\|Capacity Remaining | – | Verbleibende CPU-Kapazität |
| CPU\|Time Remaining | Tage | Verbleibende Zeit |

### 11.2 Memory Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Memory\|Demand (KB) | KB | Speicherbedarf |
| Memory\|Usage (KB) | KB | Speichernutzung |
| Memory\|Capacity (KB) | KB | Speicherkapazität |
| Memory\|Capacity Remaining | – | Verbleibende Speicherkapazität |
| Memory\|Time Remaining | Tage | Verbleibende Zeit |

### 11.3 ROI Dashboard Super Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Cost\|Total Cost of Ownership | Currency | Gesamtkosten mit potenziellen Einsparungen |
| Online Capacity Analytics Capacity Remaining Profiles | Count | Verbleibende VMs basierend auf durchschnittlichem VM-Profil |
| Cost\|Server Hardware(Owned) Cost | Currency | Abgeschriebene Server-Hardware-Kosten |

### 11.4 Summary Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Summary\|Total Number of vCenters | Count | Anzahl vCenter Server |
| Summary\|Total Number of Clusters | Count | Anzahl Cluster |
| Summary\|Total Number of Hosts | Count | Anzahl Hosts |
| Summary\|Total Number of VMs | Count | Anzahl VMs |
| Summary\|Total Number of Datastores | Count | Anzahl Datastores |

---

## 12. VMware Distributed Virtual Switch Metrics

VMware Aria Operations sammelt Network-, Summary- und Host-Metriken für
Distributed Virtual Switch-Objekte.

### 12.1 Network Metrics

| Metrikname | Einheit | Beschreibung | Key |
|---|---|---|---|
| Total Ingress Traffic | KBps | Total ingress traffic | `network\|port_statistics\|rx_bytes` |
| Total Egress Traffic | KBps | Total egress traffic | `network\|port_statistics\|tx_bytes` |
| Egress Unicast Packets per second | packets/s | Egress unicast packets | `network\|port_statistics\|ucast_tx_pkts` |
| Egress Multicast Packets per second | packets/s | Egress multicast packets | `network\|port_statistics\|mcast_tx_pkts` |
| Egress Broadcast Packets per second | packets/s | Egress broadcast packets | `network\|port_statistics\|bcast_tx_pkts` |
| Ingress Unicast Packets per second | packets/s | Ingress unicast packets | `network\|port_statistics\|ucast_rx_pkts` |
| Ingress Multicast Packets per second | packets/s | Ingress multicast packets | `network\|port_statistics\|mcast_rx_pkts` |
| Ingress Broadcast Packets per second | packets/s | Ingress broadcast packets | `network\|port_statistics\|bcast_rx_pkts` |
| Egress Packets Dropped per second | packets/s | Egress packets dropped | `network\|port_statistics\|tx_dropped` |
| Ingress Packets Dropped per second | packets/s | Ingress packets dropped | `network\|port_statistics\|rx_dropped` |

### 12.2 Summary Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Summary\|Number of Hosts | Count | Anzahl verbundener Hosts |
| Summary\|Number of Port Groups | Count | Anzahl Port Groups |

---

## 13. Distributed Virtual Port Group Metrics

VMware Aria Operations sammelt Netzwerk- und Zusammenfassungs-Metriken für
Distributed Virtual Port Groups.

### 13.1 Network Metrics

| Metrikname | Einheit | Beschreibung | Key |
|---|---|---|---|
| Ingress Traffic | KBps | Ingress traffic | `network\|port_statistics\|rx_bytes` |
| Egress Traffic | KBps | Egress traffic | `network\|port_statistics\|tx_bytes` |
| Egress Unicast Packets per second | Packets/s | Egress unicast packets | `network\|port_statistics\|ucast_tx_pkts` |
| Egress Multicast Packets per second | Packets/s | Egress multicast packets | `network\|port_statistics\|mcast_tx_pkts` |
| Egress Broadcast Packets per second | Packets/s | Egress broadcast packets | `network\|port_statistics\|bcast_tx_pkts` |
| Ingress Unicast Packets per second | Packets/s | Ingress unicast packets | `network\|port_statistics\|ucast_rx_pkts` |
| Ingress Multicast Packets per second | Packets/s | Ingress multicast packets | `network\|port_statistics\|mcast_rx_pkts` |
| Ingress Broadcast Packets per second | Packets/s | Ingress broadcast packets | `network\|port_statistics\|bcast_rx_pkts` |

### 13.2 Summary Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Summary\|Number of VMs | Count | Anzahl verbundener VMs |
| Summary\|Number of Hosts | Count | Anzahl verbundener Hosts |

---

## 14. Calculated Metrics – Capacity Analytics

Diese Metriken werden von der Capacity Analytics-Engine in VMware Aria
Operations berechnet und sind für alle Objekte mit Capacity-Modellierung
verfügbar.

### 14.1 Capacity Analytics Generated Metrics

| Metrikname | Einheit | Beschreibung | Key |
|---|---|---|---|
| Time Remaining | Day(s) | Anzahl verbleibender Tage bis zur Kapazitätsgrenze | `timeRemaining` |
| Capacity Remaining | – | Maximaler Punkt zwischen nutzbarer Kapazität und projizierter Nutzung (3 Tage) | `capacityRemaining` |
| Capacity Remaining Percentage | % | Prozentsatz der verbleibenden Kapazität der am stärksten eingeschränkten Ressource | `capacityRemainingPct` |
| Stress | – | Stress-Metrik basierend auf dynamischen Schwellwerten | `stress` |
| Usable Capacity | – | Nutzkapazität basierend auf Policy-Einstellungen | `usableCapacity` |
| Workload | – | Workload-Metrik | `workload` |
| Capacity Remaining Profile (Average) | – | Verbleibende Kapazität basierend auf durchschnittlichem Consumer-Profil | `capacityRemainingProfile` |
| Capacity Remaining Profile (Small) | – | Verbleibende Kapazität basierend auf Small-VM-Profil | – |
| Capacity Remaining Profile (Large) | – | Verbleibende Kapazität basierend auf Large-VM-Profil | – |
| CPU\|Capacity Remaining | – | Verbleibende CPU-Kapazität | – |
| CPU\|Time Remaining | Tage | Verbleibende Zeit für CPU | – |
| Memory\|Capacity Remaining | – | Verbleibende Speicherkapazität | – |
| Memory\|Time Remaining | Tage | Verbleibende Zeit für Memory | – |
| Disk Space\|Capacity Remaining | – | Verbleibende Disk-Space-Kapazität | – |
| Disk Space\|Time Remaining | Tage | Verbleibende Zeit für Disk Space | – |

---

## 15. Badge Metrics

Badge-Metriken bewerten Health, Risk, Efficiency und Compliance eines Objekts.

| Metrikname | Einheit | Beschreibung | Key |
|---|---|---|---|
| Badge\|Compliance | % | Compliance-Score basierend auf verletzten Symptomen. Formel: `Math.round(100 - ((triggeredSymptoms/totalSymptoms)*100))` | `Badge\|compliance` |
| Badge\|Efficiency | Score (1–100) | Gesamt-Effizienz-Score. Green=100, Yellow=75, Orange=50, Red=25 | `Badge\|efficiency` |
| Badge\|Health | Score (0–100) | Health-Score basierend auf Anomalien und Alarmen | `Badge\|health` |
| Badge\|Risk | Score (0–100) | Risk-Score basierend auf Kapazitäts- und Zeit-Remaining-Warnungen | `Badge\|risk` |
| Badge\|Anomalies | Score (0–100) | Anomalie-Score basierend auf dynamischen Schwellwerten | `Badge\|anomalies` |
| Badge\|Stress | Score (0–100) | Stress-Score basierend auf Ressourcen-Stress | `Badge\|stress` |
| Badge\|Faults | Score (0–100) | Faults-Score basierend auf aktiven Fehlern | `Badge\|faults` |
| Badge\|Capacity Remaining | Score (0–100) | Capacity-Remaining-Badge | `Badge\|capacityRemaining` |
| Badge\|Time Remaining | Score (0–100) | Time-Remaining-Badge | `Badge\|timeRemaining` |
| Badge\|Reclaimable Waste | Score (0–100) | Reclaimable-Waste-Badge | `Badge\|reclaimableWaste` |
| Badge\|Workload | Score (0–100) | Workload-Badge | `Badge\|workload` |

---

## 16. System Metrics

System-Metriken liefern Informationen zur Überwachung der Systemgesundheit.

| Metrikname | Einheit | Beschreibung | Key |
|---|---|---|---|
| Self – Health Score | Score (0–100) | System-Health-Score. Wert 0–100 abhängig von Noise und Alarmen | `System Attributes\|health` |
| Self – Metric Count | Count | Anzahl der Metriken, die der Adapter für das Objekt generiert | – |
| Self – Property Count | Count | Anzahl der Properties, die der Adapter für das Objekt generiert | – |
| Self – Group Count | Count | Anzahl der Gruppen, in denen das Objekt Mitglied ist | – |
| Self – Alert Count | Count | Anzahl der aktiven Alerts für das Objekt | – |
| Self – Descendant Alert Count | Count | Anzahl der aktiven Alerts für untergeordnete Objekte | – |
| Self – Descendant Count | Count | Anzahl der untergeordneten Objekte | – |
| Self – Collection Status | – | Datensammlungs-Status | – |
| Self – Adapter Kind | – | Adapter-Typ | – |
| Self – Resource Kind | – | Ressourcen-Typ | – |
| Self – Status | – | Objekt-Status | – |

---

## 17. Sustainability Metrics

Sustainability-Metriken werden für Virtual Machine, Host System, Cluster Compute
Resource, vSphere World und Organization-Objekte gesammelt.

### 17.1 Virtual Machine

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Power\|Total Energy | Wh | Total energy used. Formel: `Total Energy (Wh) = Sum(Power\|Energy (Joule))/3600` |

### 17.2 Host System

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Power\|Total Energy | Wh | Total energy used. Formel: `Total Energy (Wh) = Sum(Power\|Energy (Joule))/3600` |

### 17.3 Cluster Compute Resource

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Power\|Total Energy | Wh | Total energy used. Formel: `Total Energy (Wh) = Sum(Power\|Energy (Joule))/3600` |

### 17.4 vSphere World

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Power\|Total Energy | Wh | Total energy used. Formel: `Total Energy (Wh) = Sum(Power\|Energy (Joule))/3600` |

### 17.5 Organization

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Power\|Total Energy | Wh | Total energy used. Formel: `Total Energy (Wh) = Sum(Power\|Energy (Joule))/3600` |

---

## 18. Allocation Model – Cost Metrics

Diese Metriken sind spezifisch für das Allocation-Modell in vROps und berechnen
Kosten basierend auf zugewiesenen Ressourcen.

### 18.1 Cluster Compute Resource – Cost Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| Cluster CPU Base Rate | Currency | Base Rate für Cluster-CPU, berechnet als monatliche Gesamt-CPU-Kosten geteilt durch CPU-Overcommit-Ratio |
| Cluster Memory Base Rate | Currency | Base Rate für Cluster-Memory, berechnet als monatliche Gesamt-Memory-Kosten geteilt durch Memory-Overcommit-Ratio |
| Cluster Storage Base Rate | Currency | Base Rate für Cluster-Storage |
| MTD Cluster CPU Cost | Currency | Month-to-date Cluster-CPU-Kosten |
| MTD Cluster Memory Cost | Currency | Month-to-date Cluster-Memory-Kosten |

### 18.2 Virtual Machine – Cost Metrics

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| MTD VM CPU Cost | Currency | Month-to-date VM-CPU-Kosten |
| MTD VM Memory Cost | Currency | Month-to-date VM-Memory-Kosten |
| MTD VM Storage Cost | Currency | Month-to-date VM-Storage-Kosten |
| MTD VM Total Cost | Currency | Month-to-date VM-Gesamtkosten |

---

## 19. vSAN Cluster Metrics

VMware Aria Operations sammelt vSAN-spezifische Metriken für vSAN-Cluster.

### 19.1 Component Limit

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| vSAN\|Component Limit\|Component Limit Used | % | Prozentsatz der genutzten Komponenten-Limite |
| vSAN\|Component Limit\|Total Component Limit | – | Gesamtes Komponenten-Limit des vSAN-Clusters |
| vSAN\|Component Limit\|Used Component Limit | – | Verbrauchtes Komponenten-Limit |

### 19.2 Disk Space

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| vSAN\|Disk Space\|Disk Space Used | % | Prozentsatz des genutzten Speicherplatzes |
| vSAN\|Disk Space\|Total Disk Space | GB | Gesamter Speicherplatz des vSAN-Clusters |
| vSAN\|Disk Space\|Used Disk Space | GB | Genutzter Speicherplatz |
| vSAN\|Disk Space\|Usable Capacity | GB | Nutzbare Kapazität |
| vSAN\|Disk Space\|Oversubscription | % | Oversubscription-Ratio |

### 19.3 Performance

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| vSAN\|Performance\|Read IOPS | IOPS | Lese-IOPS des vSAN-Clusters |
| vSAN\|Performance\|Write IOPS | IOPS | Schreib-IOPS des vSAN-Clusters |
| vSAN\|Performance\|Total IOPS | IOPS | Gesamte IOPS des vSAN-Clusters |
| vSAN\|Performance\|Read Throughput | KBps | Lese-Durchsatz |
| vSAN\|Performance\|Write Throughput | KBps | Schreib-Durchsatz |
| vSAN\|Performance\|Total Throughput | KBps | Gesamtdurchsatz |
| vSAN\|Performance\|Read Latency | ms | Lese-Latenz |
| vSAN\|Performance\|Write Latency | ms | Schreib-Latenz |
| vSAN\|Performance\|Total Latency | ms | Gesamte Latenz |

### 19.4 Resync

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| vSAN\|Resync\|Resyncing Objects | Count | Anzahl der resynchronisierenden Objekte |
| vSAN\|Resync\|Bytes To Resync | GB | Zu resynchronisierende Bytes |
| vSAN\|Resync\|Resync Throughput | KBps | Resync-Durchsatz |

### 19.5 Health

| Metrikname | Einheit | Beschreibung |
|---|---|---|
| vSAN\|Health\|Cluster Health | – | vSAN-Cluster-Gesundheitsstatus |
| vSAN\|Health\|Disk Group Health | – | Disk-Group-Gesundheitsstatus |
| vSAN\|Health\|Host Health | – | Host-Gesundheitsstatus im vSAN-Kontext |

---

## Quellen und Referenzen

### Primärquellen (Broadcom TechDocs)

- [VMware Aria Operations 8.18 – TechDocs Übersicht](https://techdocs.broadcom.com/us/en/vmware-cis/aria/aria-operations/8-18.html)
- [VMware Aria Operations 8.18.7 Release Notes](https://techdocs.broadcom.com/us/en/vmware-cis/aria/aria-operations/8-18/vmware-aria-operations-8187-release-notes.html)
- [Metric Definitions in VMware Aria Operations](https://techdocs.broadcom.com/us/en/vmware-cis/aria/aria-operations/8-18/vmware-aria-operations-user-guide-8-18/metric-property-and-alert-definitions/metrics-definitions-in-vrealize-operations-manager.html)
- [Virtual Machine Metrics](https://techdocs.broadcom.com/us/en/vmware-cis/aria/aria-operations/8-18/vmware-aria-operations-user-guide-8-18/metric-property-and-alert-definitions/metrics-definitions-in-vrealize-operations-manager/metrics-for-vcenter-server-components/virtual-machine-metrics.html)
- [Host System Metrics](https://techdocs.broadcom.com/us/en/vmware-cis/aria/aria-operations/8-18/vmware-aria-operations-user-guide-8-18/metric-property-and-alert-definitions/metrics-definitions-in-vrealize-operations-manager/metrics-for-vcenter-server-components/host-system-metrics.html)
- [Cluster Compute Resource Metrics](https://techdocs.broadcom.com/us/en/vmware-cis/aria/aria-operations/8-18/vmware-aria-operations-user-guide-8-18/metric-property-and-alert-definitions/metrics-definitions-in-vrealize-operations-manager/metrics-for-vcenter-server-components/cluster-compute-resource-metrics.html)
- [vCenter Server Metrics](https://techdocs.broadcom.com/us/en/vmware-cis/aria/aria-operations/8-18/vmware-aria-operations-user-guide-8-18/metric-property-and-alert-definitions/metrics-definitions-in-vrealize-operations-manager/metrics-for-vcenter-server-components/vcenter-server-metrics.html)
- [Resource Pool Metrics](https://techdocs.broadcom.com/us/en/vmware-cis/aria/aria-operations/8-18/vmware-aria-operations-user-guide-8-18/metric-property-and-alert-definitions/metrics-definitions-in-vrealize-operations-manager/metrics-for-vcenter-server-components/resource-pool-metrics.html)
- [Data Center Metrics](https://techdocs.broadcom.com/us/en/vmware-cis/aria/aria-operations/8-18/vmware-aria-operations-user-guide-8-18/metric-property-and-alert-definitions/metrics-definitions-in-vrealize-operations-manager/metrics-for-vcenter-server-components/datacenter-metrics.html)
- [Custom Datacenter Metrics](https://techdocs.broadcom.com/us/en/vmware-cis/aria/aria-operations/8-18/vmware-aria-operations-user-guide-8-18/metric-property-and-alert-definitions/metrics-definitions-in-vrealize-operations-manager/metrics-for-vcenter-server-components/custom-datacenter-metrics.html)
- [Datastore Metrics](https://techdocs.broadcom.com/us/en/vmware-cis/aria/aria-operations/8-18/vmware-aria-operations-user-guide-8-18/metric-property-and-alert-definitions/metrics-definitions-in-vrealize-operations-manager/metrics-for-vcenter-server-components/datastore-metrics.html)
- [Datastore Cluster Metrics](https://techdocs.broadcom.com/us/en/vmware-cis/aria/aria-operations/8-18/vmware-aria-operations-user-guide-8-18/metric-property-and-alert-definitions/metrics-definitions-in-vrealize-operations-manager/metrics-for-vcenter-server-components/datastore-cluster-metrics.html)
- [Storage Pod Metrics](https://techdocs.broadcom.com/us/en/vmware-cis/aria/aria-operations/8-18/vmware-aria-operations-user-guide-8-18/metric-property-and-alert-definitions/metrics-definitions-in-vrealize-operations-manager/metrics-for-vcenter-server-components/storage-pod-metrics.html)
- [vSphere World Metrics](https://techdocs.broadcom.com/us/en/vmware-cis/aria/aria-operations/8-18/vmware-aria-operations-user-guide-8-18/metric-property-and-alert-definitions/metrics-definitions-in-vrealize-operations-manager/metrics-for-vcenter-server-components/vsphere-world-metrics.html)
- [VMware Distributed Virtual Switch Metrics](https://techdocs.broadcom.com/us/en/vmware-cis/aria/aria-operations/8-18/vmware-aria-operations-user-guide-8-18/metric-property-and-alert-definitions/metrics-definitions-in-vrealize-operations-manager/metrics-for-vcenter-server-components/vmware-distributed-virtual-switch-metrics.html)
- [Distributed Virtual Port Group Metrics](https://techdocs.broadcom.com/us/en/vmware-cis/aria/aria-operations/8-18/vmware-aria-operations-user-guide-8-18/metric-property-and-alert-definitions/metrics-definitions-in-vrealize-operations-manager/metrics-for-vcenter-server-components/distributed-virtual-portgroup-metrics.html)
- [Capacity Analytics Generated Metrics](https://techdocs.broadcom.com/us/en/vmware-cis/aria/aria-operations/8-18/vmware-aria-operations-user-guide-8-18/metric-property-and-alert-definitions/metrics-definitions-in-vrealize-operations-manager/calculated-metrics/capacity-metrics.html)
- [Badge Metrics](https://techdocs.broadcom.com/us/en/vmware-cis/aria/aria-operations/8-18/vmware-aria-operations-user-guide-8-18/metric-property-and-alert-definitions/metrics-definitions-in-vrealize-operations-manager/calculated-metrics/badge-metrics.html)
- [System Metrics](https://techdocs.broadcom.com/us/en/vmware-cis/aria/aria-operations/8-18/vmware-aria-operations-user-guide-8-18/metric-property-and-alert-definitions/metrics-definitions-in-vrealize-operations-manager/calculated-metrics/system-metrics.html)
- [Sustainability Metrics](https://techdocs.broadcom.com/us/en/vmware-cis/aria/aria-operations/8-18/vmware-aria-operations-user-guide-8-18/metric-property-and-alert-definitions/metrics-definitions-in-vrealize-operations-manager/sustainability-metrics.html)
- [Cluster Compute Metrics for Allocation Model](https://techdocs.broadcom.com/us/en/vmware-cis/aria/aria-operations/8-18/vmware-aria-operations-user-guide-8-18/metric-property-and-alert-definitions/metrics-definitions-in-vrealize-operations-manager/metrics-for-vcenter-server-components/cluster-compute-metrics-for-allocation-model.html)
- [Virtual Machine Metrics for Allocation Model](https://techdocs.broadcom.com/us/en/vmware-cis/aria/aria-operations/8-18/vmware-aria-operations-user-guide-8-18/metric-property-and-alert-definitions/metrics-definitions-in-vrealize-operations-manager/metrics-for-vcenter-server-components/virtual-machine-metrics-for-allocation-model.html)
- [Metrics for vSAN Cluster](https://techdocs.broadcom.com/us/en/vmware-cis/aria/aria-operations/8-18/vmware-aria-operations-user-guide-8-18/metric-property-and-alert-definitions/metrics-definitions-in-vrealize-operations-manager/vsan-metrics/metrics-for-vsan-cluster.html)

### Weiterführende Dokumentation

- [VMware Aria Operations 8.18 PDF (gesamtes Dokument)](https://techdocs.broadcom.com/content/dam/broadcom/techdocs/us/en/pdf/vmware/aria/aria-operations/vmware-aria-operations-8-18.pdf)
- [Broadcom KB 315941 – Aria Operations Data Collection](https://knowledge.broadcom.com/external/article?articleNumber=315941)
- [Broadcom KB 385173 – Reports mit mehreren Objektarten](https://knowledge.broadcom.com/external/article/385173)
- [Broadcom vRealize Operations API – Stat Query](https://developer.broadcom.com/xapis/vmware-vrealize-operations-api/latest/data-structures/stat-query/)

### Projektinterne Referenz

- [VROPS_METRICS.md – Exportkonfiguration für den RVTools Analyzer](../VROPS_METRICS.md)

---

## Hinweise für Agenten

### Metrik-Identifikation

- Metriknamen in vROps folgen dem Schema `Objekt|Kategorie|Metrikname (Einheit)`.
- In Views und Reports werden Transformationen als Suffix angehängt, z.B.
  `VM|CPU|Demand (MHz)|Avg` oder `Cluster|CPU|Contention (%)|Max`.
- Interne Metric Keys (z.B. `cpu|demandmhz`) sind in der API und in Super-Metric-Formeln relevant, nicht aber für den Header-basierten CSV-Import.

### Verfügbare Transformationen

| Transformation | Beschreibung |
|---|---|
| `avg` | Durchschnitt der gespeicherten Messpunkte im Intervall |
| `max` | Höchster gespeicherter Messpunkt im Intervall |
| `min` | Niedrigster gespeicherter Messpunkt im Intervall |
| `last` | Letzter vorhandener Messpunkt im Intervall |
| `sum` | Summe aller Messpunkte im Intervall |
| `first` | Erster Messpunkt im Intervall |
| `current` | Aktueller Wert (nicht für Historie) |
| `standard deviation` | Standardabweichung |
| `percentile` | Perzentil (z.B. P95) |
| `forecast` | Prognosewert |

### Collection-Intervall

vROps speichert vCenter-Daten normalerweise in einem 5-Minuten-Zyklus.
View-Transformationen arbeiten auf diesen gespeicherten Punkten und nicht auf
den ursprünglichen 20-Sekunden-Samples.

### Instanced Metrics

Instanzierte Metriken (z.B. pro vCPU, pro virtuellem Disk, pro Netzwerkkarte)
sind nach dem Deployment oder Upgrade auf vRealize Operations 8.2 oder später
standardmäßig deaktiviert und müssen explizit aktiviert werden.