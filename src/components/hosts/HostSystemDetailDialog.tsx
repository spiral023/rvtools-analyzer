import { useMemo } from "react";
import { Activity, CircuitBoard, Cpu, Network, Server, ServerCog, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import type { NormalizedVm, SheetRow } from "@/domain/models/types";
import type { HostDetail } from "@/lib/conversion";
import { str } from "@/lib/conversion";
import { formatBytes, formatNum } from "@/lib/xlsx/parseHelpers";
import { useHosts } from "@/hooks/useActiveSnapshots";
import { useVropsObjectSeries } from "@/hooks/useVropsObjectSeries";
import { VropsTrendChart } from "@/components/vrops/VropsTrendChart";
import type { DetailDossier, DetailField, DetailKpi, DetailTable } from "@/lib/detailExport";
import {
  DetailCountBadge,
  DetailFieldGrid,
  DetailKpiGrid,
  DetailNarrative,
  DetailSection,
  DetailTableView,
  DetailUnavailable,
  SystemDetailContent,
} from "@/components/detail/SystemDetailLayout";

interface HbaEntry {
  device: string;
  type: string;
  status: string;
  driver: string;
  model: string;
  wwn: string;
  pci: string;
}

interface NicEntry {
  device: string;
  driver: string;
  speed: string;
  mac: string;
  switchName: string;
  uplinkPort: string;
  pci: string;
}

function hbasForHost(rows: SheetRow[], hostName: string): HbaEntry[] {
  return rows
    .flatMap((row) => str(row.data["Host"]) === hostName ? [{
        device: str(row.data["Device"]),
        type: str(row.data["Type"]),
        status: str(row.data["Status"]),
        driver: str(row.data["Driver"]),
        model: str(row.data["Model"]),
        wwn: str(row.data["WWN"]),
        pci: str(row.data["Pci"]),
      }] : [])
    .sort((a, b) => a.device.localeCompare(b.device, "de-DE", { numeric: true }));
}

function nicsForHost(rows: SheetRow[], hostName: string): NicEntry[] {
  return rows
    .flatMap((row) => str(row.data["Host"]) === hostName ? [{
        device: str(row.data["Network Device"]),
        driver: str(row.data["Driver"]),
        speed: str(row.data["Speed"]),
        mac: str(row.data["MAC"]),
        switchName: str(row.data["Switch"]),
        uplinkPort: str(row.data["Uplink port"]),
        pci: str(row.data["PCI"]),
      }] : [])
    .sort((a, b) => a.device.localeCompare(b.device, "de-DE", { numeric: true }));
}

function isOn(value: string | null): boolean {
  return ["poweredon", "on"].includes((value || "").replace(/\s+/g, "").toLowerCase());
}

export function HostSystemDetailDialog({
  host,
  hbaRows,
  nicRows,
  vmRows,
  open,
  onClose,
  onVmClick,
}: {
  host: HostDetail | null;
  hbaRows: SheetRow[];
  nicRows: SheetRow[];
  vmRows: NormalizedVm[];
  open: boolean;
  onClose: () => void;
  onVmClick?: (vm: NormalizedVm) => void;
}) {
  const { data: normalizedHosts = [] } = useHosts();
  const matchedHost = useMemo(
    () => normalizedHosts.find((entry) => entry.host === host?.host) ?? null,
    [host?.host, normalizedHosts],
  );
  const vrops = useVropsObjectSeries({
    objectType: "host",
    rvtoolsObjectKey: matchedHost?.hostKey ?? null,
    cpuCapacityMHz: matchedHost?.cpuTotalMHz ?? null,
    secondaryCapacity: matchedHost?.memoryTotalMiB ?? null,
  });
  if (!host) return null;

  const hbas = hbasForHost(hbaRows, host.host);
  const nics = nicsForHost(nicRows, host.host);
  const runningVms = vmRows
    .filter((vm) => vm.host?.toLocaleLowerCase("de-DE") === host.host.toLocaleLowerCase("de-DE") && isOn(vm.powerState))
    .sort((a, b) => a.vmName.localeCompare(b.vmName, "de-DE", { numeric: true }));
  const allocatedVcpu = runningVms.reduce((sum, vm) => sum + (vm.cpuCount ?? 0), 0);
  const allocatedMemory = runningVms.reduce((sum, vm) => sum + (vm.memoryMiB ?? 0), 0);
  const vcpuPerCore = host.totalCores ? allocatedVcpu / host.totalCores : null;
  const memoryCommit = host.memoryMiB ? allocatedMemory / host.memoryMiB * 100 : null;
  const hbaIssues = hbas.filter((hba) => hba.status && !/online|ok|active/i.test(hba.status)).length;

  const kpis: DetailKpi[] = [
    { label: "Betriebszustand", value: matchedHost?.powerState || "—", hint: matchedHost?.connectionState || "—", tone: matchedHost?.connectionState?.toLowerCase() === "connected" ? "good" : "warning" },
    { label: "CPU-Kerne", value: formatNum(host.totalCores), hint: `${formatNum(host.threads)} Threads` },
    { label: "Arbeitsspeicher", value: formatBytes(host.memoryMiB), hint: `${formatBytes(allocatedMemory)} VM-RAM` },
    { label: "Laufende VMs", value: formatNum(runningVms.length), hint: `${formatNum(allocatedVcpu)} vCPU` },
    { label: "vCPU / Core", value: vcpuPerCore === null ? "—" : vcpuPerCore.toLocaleString("de-DE", { maximumFractionDigits: 2 }), hint: "laufende VMs", tone: (vcpuPerCore ?? 0) > 6 ? "warning" : "neutral" },
    { label: "RAM Commit", value: memoryCommit === null ? "—" : `${memoryCommit.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`, hint: "konfigurierter VM-RAM", tone: (memoryCommit ?? 0) > 100 ? "warning" : "neutral" },
  ];
  const identityFields: DetailField[] = [
    { label: "vCenter", value: matchedHost?.vcenterId || "—", sensitivity: "identifier" },
    { label: "Datacenter", value: host.datacenter || "—", sensitivity: "identifier" },
    { label: "Cluster", value: host.cluster || "—", sensitivity: "identifier" },
    { label: "Hersteller", value: host.vendor || "—" },
    { label: "Modell", value: host.model || "—" },
    { label: "Seriennummer", value: host.serial || "—", sensitivity: "identifier" },
    { label: "Service Tag", value: host.serviceTag || "—", sensitivity: "identifier" },
    { label: "ESXi", value: host.esxVersion || matchedHost?.version || "—" },
    { label: "Build", value: matchedHost?.build || "—" },
    { label: "BIOS", value: [host.biosVendor, host.biosVersion].filter(Boolean).join(" ") || "—" },
    { label: "BIOS-Datum", value: host.biosDate || "—" },
    { label: "Maintenance Mode", value: host.maintenanceMode ? "Aktiv" : "Nein" },
  ];
  const resourceFields: DetailField[] = [
    { label: "CPU-Modell", value: host.cpuModel || "—" },
    { label: "Sockel", value: formatNum(host.cpuSockets) },
    { label: "Kerne je Sockel", value: formatNum(host.coresPerCpu) },
    { label: "Kerne gesamt", value: formatNum(host.totalCores) },
    { label: "Threads", value: formatNum(host.threads) },
    { label: "Takt", value: host.speedMHz ? `${formatNum(host.speedMHz)} MHz` : "—" },
    { label: "CPU-Kapazität", value: matchedHost?.cpuTotalMHz ? `${formatNum(matchedHost.cpuTotalMHz)} MHz` : "—" },
    { label: "Hyper-Threading", value: host.htActive ? "Aktiv" : "Aus" },
    { label: "RAM", value: formatBytes(host.memoryMiB) },
    { label: "NICs", value: formatNum(nics.length) },
    { label: "HBAs", value: formatNum(hbas.length) },
    { label: "HBA-Auffälligkeiten", value: formatNum(hbaIssues) },
  ];
  const hbaTable: DetailTable = {
    headers: ["Device", "Status", "Typ", "Treiber", "Modell", "PCI", "WWN"],
    rows: hbas.map((hba) => [hba.device, hba.status || "—", hba.type || "—", hba.driver || "—", hba.model || "—", hba.pci || "—", hba.wwn || "—"]),
    sensitiveColumns: { 6: "network" },
  };
  const nicTable: DetailTable = {
    headers: ["Device", "Speed", "MAC", "Switch", "Uplink", "Treiber", "PCI"],
    rows: nics.map((nic) => [
      nic.device,
      nic.speed ? `${Number(nic.speed.replace(/,/g, "")) / 1_000} Gbps` : "—",
      nic.mac || "—",
      nic.switchName || "—",
      nic.uplinkPort || "—",
      nic.driver || "—",
      nic.pci || "—",
    ]),
    sensitiveColumns: { 2: "network", 3: "identifier", 4: "identifier" },
  };
  const vmTable: DetailTable = {
    headers: ["VM", "vCPU", "RAM", "Power", "Resource Pool"],
    rows: runningVms.map((vm) => [vm.vmName, formatNum(vm.cpuCount), formatBytes(vm.memoryMiB), vm.powerState || "—", vm.resourcePool || "—"]),
    sensitiveColumns: { 0: "identifier", 4: "identifier" },
    maxRows: 40,
  };
  const narrative = `Der ESXi-Host stellt ${formatNum(host.totalCores)} CPU-Kerne und ${formatBytes(host.memoryMiB)} RAM bereit. ${formatNum(runningVms.length)} laufende VMs belegen zusammen ${formatNum(allocatedVcpu)} vCPU und ${formatBytes(allocatedMemory)} konfigurierten Arbeitsspeicher.${host.maintenanceMode ? " Der Host befindet sich im Maintenance Mode." : ""}`;
  const dossier: DetailDossier = {
    kind: "Host",
    title: host.host,
    titleSensitivity: "identifier",
    subtitle: [host.cluster, host.datacenter, host.model].filter(Boolean).join(" · "),
    summary: narrative,
    kpis,
    trend: vrops.isMatched ? { title: "Host-Auslastung · sieben Tage", points: vrops.hourly, cpuCapacityMHz: vrops.cpuCapacityMHz, importedAt: vrops.importedAt } : undefined,
    sections: [
      { title: "Identität & Lifecycle", fields: identityFields },
      { title: "CPU, RAM & Kapazität", fields: resourceFields },
      { title: "Host Bus Adapter", table: hbaTable },
      { title: "Netzwerkadapter", table: nicTable },
      { title: "Laufende virtuelle Maschinen", table: vmTable },
    ],
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <SystemDetailContent
        icon={<Server className="size-6" />}
        eyebrow="ESXi-Systemakte"
        title={host.host}
        subtitle={[host.vendor, host.model, host.cluster, host.datacenter].filter(Boolean).join(" · ")}
        badges={
          <>
            <Badge variant={host.maintenanceMode ? "destructive" : "secondary"} className="rounded-full text-[10px]">{host.maintenanceMode ? "Maintenance" : matchedHost?.connectionState || "Status unbekannt"}</Badge>
            <Badge variant="outline" className="rounded-full text-[10px]">{host.esxVersion || "ESXi unbekannt"}</Badge>
          </>
        }
        dossier={dossier}
      >
        <DetailNarrative source="RVTools · vROps optional">{narrative}</DetailNarrative>
        <DetailKpiGrid items={kpis} />
        <DetailSection icon={<Activity className="size-4" />} title="Auslastung · sieben Tage" description="CPU Demand und Speicherauslastung aus der optionalen vROps-Zeitreihe.">
          <VropsTrendChart {...vrops} />
          {!vrops.hasImport && <DetailUnavailable title="Keine vROps-Zeitreihe importiert" description="Inventar- und Kapazitätsdaten bleiben vollständig sichtbar. Nach einem passenden Import erscheint hier der Verlauf." />}
        </DetailSection>
        <div className="grid gap-5 xl:grid-cols-2">
          <DetailSection icon={<ServerCog className="size-4" />} title="Identität & Lifecycle" description="Standort, Hardwareplattform, ESXi- und BIOS-Stand.">
            <DetailFieldGrid fields={identityFields} columns={2} />
          </DetailSection>
          <DetailSection icon={<Cpu className="size-4" />} title="CPU, RAM & Kapazität" description="Physische Ressourcen und aktuelle Belegung durch laufende VMs.">
            <DetailFieldGrid fields={resourceFields} columns={2} />
          </DetailSection>
        </div>
        <DetailSection icon={<CircuitBoard className="size-4" />} title="Host Bus Adapter" description="Storage-Pfade, Treiber und Status der physischen Adapter." aside={<DetailCountBadge>{hbas.length}</DetailCountBadge>}>
          <DetailTableView table={hbaTable} />
        </DetailSection>
        <DetailSection icon={<Network className="size-4" />} title="Netzwerkadapter" description="Physische Uplinks, Switch-Zuordnung und Treiberstände." aside={<DetailCountBadge>{nics.length}</DetailCountBadge>}>
          <DetailTableView table={nicTable} />
        </DetailSection>
        <DetailSection icon={<Workflow className="size-4" />} title="Laufende virtuelle Maschinen" description="Aktuell eingeschaltete Workloads auf diesem Host." aside={<DetailCountBadge>{runningVms.length}</DetailCountBadge>}>
          <DetailTableView table={vmTable} onRowClick={onVmClick ? (index) => onVmClick(runningVms[index]) : undefined} />
        </DetailSection>
      </SystemDetailContent>
    </Dialog>
  );
}
