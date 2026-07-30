import { useMemo } from "react";
import {
  Activity,
  Cpu,
  Gauge,
  Monitor,
  Recycle,
  ServerCog,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import type {
  NormalizedVm,
  SheetRow,
  TechInfoClientLatest,
  TechInfoLatest,
  VmRightsizingCandidate,
  VmWorkloadProfile,
} from "@/domain/models/types";
import { formatRvtoolsDate, matchRowsForVm, summarizeSnapshots, summarizeStorage } from "@/lib/vmDetail";
import { compactValue, str, toNumber } from "@/lib/vmDetailFormat";
import { formatBytes } from "@/lib/xlsx/parseHelpers";
import { VM_WORKLOAD_INTENSITY_LABEL, VM_WORKLOAD_SHAPE_LABEL } from "@/domain/services/vmWorkloadProfileService";
import {
  DetailFieldGrid,
  DetailKpiGrid,
  DetailNarrative,
  DetailSection,
  DetailUnavailable,
  SystemDetailContent,
} from "@/components/detail/SystemDetailLayout";
import type { DetailDossier, DetailField, DetailKpi } from "@/lib/detailExport";
import { VropsTrendChart } from "@/components/vrops/VropsTrendChart";
import { VmTechnicalSections } from "@/components/vm/VmTechnicalSections";

interface VmDetailDialogProps {
  vm: NormalizedVm | null;
  techInfo?: TechInfoLatest | null;
  client?: TechInfoClientLatest | null;
  workloadProfile?: VmWorkloadProfile | null;
  rightsizing?: VmRightsizingCandidate | null;
  vropsImportedAt?: string | null;
  optionalDataLoading?: boolean;
  open: boolean;
  onClose: () => void;
  rawCpuRows: SheetRow[];
  rawMemoryRows: SheetRow[];
  rawDiskRows: SheetRow[];
  rawPartitionRows: SheetRow[];
  rawNetworkRows: SheetRow[];
  rawSnapshotRows: SheetRow[];
  rawToolsRows: SheetRow[];
}

function percent(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : `${value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

function decimal(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function bool(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value ? "Ja" : "Nein";
}

function vmTone(value: string | null): DetailKpi["tone"] {
  const normalized = (value || "").replace(/\s+/g, "").toLowerCase();
  if (normalized === "poweredon" || normalized === "on" || normalized === "green") return "good";
  if (!value) return "neutral";
  return "warning";
}

export function VmDetailDialog({
  vm,
  techInfo = null,
  client = null,
  workloadProfile = null,
  rightsizing = null,
  vropsImportedAt = null,
  optionalDataLoading = false,
  open,
  onClose,
  rawCpuRows,
  rawMemoryRows,
  rawDiskRows,
  rawPartitionRows,
  rawNetworkRows,
  rawSnapshotRows,
  rawToolsRows,
}: VmDetailDialogProps) {
  const cpuRows = useMemo(() => matchRowsForVm(rawCpuRows, vm), [rawCpuRows, vm]);
  const memoryRows = useMemo(() => matchRowsForVm(rawMemoryRows, vm), [rawMemoryRows, vm]);
  const diskRows = useMemo(() => matchRowsForVm(rawDiskRows, vm), [rawDiskRows, vm]);
  const partitionRows = useMemo(() => matchRowsForVm(rawPartitionRows, vm), [rawPartitionRows, vm]);
  const networkRows = useMemo(() => matchRowsForVm(rawNetworkRows, vm), [rawNetworkRows, vm]);
  const snapshotRows = useMemo(() => matchRowsForVm(rawSnapshotRows, vm), [rawSnapshotRows, vm]);
  const toolsRows = useMemo(() => matchRowsForVm(rawToolsRows, vm), [rawToolsRows, vm]);

  if (!vm) return null;

  const storage = summarizeStorage(diskRows);
  const snapshots = summarizeSnapshots(snapshotRows);
  const cpu = cpuRows[0]?.data ?? {};
  const memory = memoryRows[0]?.data ?? {};
  const tools = toolsRows[0]?.data ?? {};
  const p95Pct = workloadProfile?.signals.utilizationP95Pct ?? null;
  const reclaimable = rightsizing?.reclaimableVcpu ?? 0;

  const kpis: DetailKpi[] = [
    { label: "Betriebszustand", value: compactValue(vm.powerState), hint: compactValue(vm.connectionState), tone: vmTone(vm.powerState) },
    { label: "vCPU", value: compactValue(vm.cpuCount === null ? null : String(vm.cpuCount)), hint: `${toNumber(cpu["Sockets"]) ?? "—"} Sockel`, tone: "neutral" },
    { label: "Arbeitsspeicher", value: formatBytes(vm.memoryMiB), hint: `aktiv ${formatBytes(toNumber(memory["Active"]))}`, tone: "neutral" },
    { label: "CPU Demand P95", value: percent(p95Pct), hint: workloadProfile ? `${decimal(workloadProfile.demand.p95, 0)} MHz` : "Keine Zeitreihe", tone: p95Pct !== null && p95Pct >= 80 ? "critical" : p95Pct !== null && p95Pct >= 60 ? "warning" : "neutral" },
    { label: "CPU Ready P95", value: percent(workloadProfile?.ready.p95), hint: workloadProfile ? `${workloadProfile.demand.sampleCount} Messpunkte` : "Keine Zeitreihe", tone: (workloadProfile?.ready.p95 ?? 0) > 5 ? "warning" : workloadProfile ? "good" : "neutral" },
    { label: "Rightsizing", value: rightsizing?.recommendedVcpu ? `${rightsizing.recommendedVcpu} vCPU` : "Keine Änderung", hint: reclaimable > 0 ? `${reclaimable} vCPU rückgewinnbar` : rightsizing?.recommendationWithheldReason ? "Empfehlung zurückgehalten" : "Kein Kandidat", tone: reclaimable > 0 ? "warning" : "neutral" },
  ];

  const identityFields: DetailField[] = [
    { label: "vCenter", value: compactValue(vm.vcenterId), sensitivity: "identifier" },
    { label: "Datacenter", value: compactValue(vm.datacenter), sensitivity: "identifier" },
    { label: "Cluster", value: compactValue(vm.cluster), sensitivity: "identifier" },
    { label: "ESXi Host", value: compactValue(vm.host), sensitivity: "identifier" },
    { label: "Folder", value: compactValue(vm.folder), sensitivity: "identifier" },
    { label: "Resource Pool", value: compactValue(vm.resourcePool), sensitivity: "identifier" },
    { label: "VM UUID", value: compactValue(vm.vmUuid), sensitivity: "identifier" },
    { label: "Annotation", value: compactValue(vm.annotation), sensitivity: "text" },
  ];

  const techInfoFields: DetailField[] = techInfo ? [
    { label: "Systemverantwortliche:r", value: compactValue(techInfo.sysv), sensitivity: "person" },
    { label: "Abteilung", value: compactValue(techInfo.sysvDepartment), sensitivity: "department" },
    { label: "Stellvertretung", value: compactValue(techInfo.sysvDeputy), sensitivity: "person" },
    { label: "Abteilung Stellvertretung", value: compactValue(techInfo.sysvDeputyDepartment), sensitivity: "department" },
    { label: "Servertyp", value: compactValue(techInfo.serverType) },
    { label: "Wartungsfenster", value: compactValue(techInfo.maintenanceWindow) },
    { label: "Betriebssystem (Tech-Info)", value: compactValue(techInfo.operatingSystem) },
    { label: "CV-Backup", value: bool(techInfo.cvBackup) },
    { label: "BZ / AZ", value: [techInfo.bz, techInfo.az].filter(Boolean).join(" · ") || "—" },
    { label: "Kommentar", value: compactValue(techInfo.comment), sensitivity: "text" },
  ] : [];

  const workloadFields: DetailField[] = workloadProfile ? [
    { label: "Lastmuster", value: VM_WORKLOAD_SHAPE_LABEL[workloadProfile.shape] },
    { label: "Auslastungsniveau", value: VM_WORKLOAD_INTENSITY_LABEL[workloadProfile.intensity] },
    { label: "Vertrauen", value: workloadProfile.confidence },
    { label: "Datenabdeckung", value: percent(workloadProfile.demand.coverageRatio * 100) },
    { label: "Variationskoeffizient", value: decimal(workloadProfile.signals.coefficientOfVariation) },
    { label: "Aktive Stunden", value: percent(workloadProfile.signals.dutyCyclePct) },
    { label: "Grundlastanteil", value: percent(workloadProfile.signals.baselineRatio === null ? null : workloadProfile.signals.baselineRatio * 100) },
    { label: "Tages-Wiederholbarkeit", value: decimal(workloadProfile.signals.dailyRepeatability) },
    { label: "Business-Hours-Konzentration", value: decimal(workloadProfile.signals.businessHoursConcentration) },
    { label: "Nacht-Konzentration", value: decimal(workloadProfile.signals.nightConcentration) },
    { label: "Wochenend-Konzentration", value: decimal(workloadProfile.signals.weekendConcentration) },
    { label: "Konfigurierte CPU-Kapazität", value: workloadProfile.configuredCpuCapacityMHz ? `${decimal(workloadProfile.configuredCpuCapacityMHz, 0)} MHz` : "—" },
  ] : [];

  const rightsizingFields: DetailField[] = rightsizing ? [
    { label: "Konfiguriert", value: rightsizing.vcpu === null ? "—" : `${rightsizing.vcpu} vCPU` },
    { label: "Genutzt P95", value: rightsizing.usedVcpuEquivalentP95 === null ? "—" : `${decimal(rightsizing.usedVcpuEquivalentP95)} vCPU` },
    { label: "Genutzt Maximum", value: rightsizing.usedVcpuEquivalentPeak === null ? "—" : `${decimal(rightsizing.usedVcpuEquivalentPeak)} vCPU` },
    { label: "Bedarfsgerecht", value: rightsizing.demandBasedVcpu === null ? "—" : `${rightsizing.demandBasedVcpu} vCPU` },
    { label: "Empfohlen", value: rightsizing.recommendedVcpu === null ? "Keine Empfehlung" : `${rightsizing.recommendedVcpu} vCPU` },
    { label: "Rückgewinnbar", value: rightsizing.reclaimableVcpu === null ? "—" : `${rightsizing.reclaimableVcpu} vCPU` },
    { label: "Viele vCPU, geringer Bedarf", value: bool(rightsizing.flags.manyVcpuLowDemand) },
    { label: "Auffälliges CPU Ready", value: bool(rightsizing.flags.highCpuReady) },
  ] : [];
  const clientFields: DetailField[] = client ? [
    { label: "Standort", value: compactValue(client.standort), sensitivity: "identifier" },
    { label: "Site", value: compactValue(client.site), sensitivity: "identifier" },
    { label: "Pool", value: compactValue(client.poolName), sensitivity: "identifier" },
    { label: "Benutzer", value: compactValue(client.user), sensitivity: "person" },
    { label: "IP-Adresse", value: compactValue(client.ip), sensitivity: "network" },
    { label: "MAC-Adresse", value: compactValue(client.macAddress), sensitivity: "network" },
    { label: "Domäne", value: compactValue(client.domain), sensitivity: "identifier" },
    { label: "Monitoring", value: compactValue(client.monitoring) },
    { label: "Hardware", value: compactValue(client.hardware) },
    { label: "Client-OS", value: compactValue(client.os) },
  ] : [];

  const narrative = workloadProfile
    ? `Die VM ist mit ${vm.cpuCount ?? "unbekannt vielen"} vCPU und ${formatBytes(vm.memoryMiB)} RAM konfiguriert. Das beobachtete Muster ist „${VM_WORKLOAD_SHAPE_LABEL[workloadProfile.shape]}“ bei ${VM_WORKLOAD_INTENSITY_LABEL[workloadProfile.intensity].toLocaleLowerCase("de-DE")}er Auslastung. ${reclaimable > 0 ? `Nach Prüfung könnten schrittweise ${reclaimable} vCPU zurückgewonnen werden.` : "Aktuell ergibt sich kein unmittelbar umsetzbarer CPU-Rightsizing-Schritt."}`
    : `Die VM ist mit ${vm.cpuCount ?? "unbekannt vielen"} vCPU und ${formatBytes(vm.memoryMiB)} RAM konfiguriert. Für eine belastbare Auslastungs- und Rightsizing-Einschätzung ist derzeit keine zugeordnete vROps-Zeitreihe verfügbar.`;

  const dossier: DetailDossier = {
    kind: "VM",
    title: vm.vmName,
    titleSensitivity: "identifier",
    subtitle: [vm.cluster, vm.host, vm.datacenter].filter(Boolean).join(" · "),
    summary: narrative,
    kpis,
    sourceDate: vropsImportedAt || techInfo?.importedAt
      ? new Date(vropsImportedAt || techInfo!.importedAt).toLocaleString("de-DE")
      : null,
    trend: workloadProfile ? {
      title: "CPU-Auslastung · sieben Tage",
      points: workloadProfile.hourly.map((point) => ({
        timestampUtc: point.timestampUtc,
        cpuDemandMHz: point.cpuDemandMHz,
        secondaryValue: point.cpuReadyPct,
      })),
      cpuCapacityMHz: workloadProfile.configuredCpuCapacityMHz,
      importedAt: vropsImportedAt,
    } : undefined,
    sections: [
      { title: "Identität & Platzierung", fields: identityFields },
      {
        title: "Verantwortung & Betrieb",
        fields: techInfoFields,
        note: techInfo ? undefined : "Keine verknüpften Tech-Info-Daten vorhanden.",
      },
      { title: "Auslastungsprofil", fields: workloadFields, note: workloadProfile ? undefined : "Keine zugeordnete vROps-Zeitreihe vorhanden." },
      { title: "CPU-Rightsizing", fields: rightsizingFields, note: rightsizing ? "Empfehlungen sind prüfpflichtig und werden nicht automatisch umgesetzt." : "Keine Rightsizing-Auswertung vorhanden." },
      ...(client ? [{ title: "Ergänzende Client-Informationen", fields: clientFields }] : []),
      {
        title: "Plattform & Ressourcen",
        fields: [
          { label: "OS (Config)", value: compactValue(vm.osConfig) },
          { label: "OS (Tools)", value: compactValue(vm.osTools) },
          { label: "HW-Version", value: compactValue(vm.hwVersion) },
          { label: "Firmware", value: compactValue(vm.firmware) },
          { label: "EFI Secure Boot", value: bool(vm.efiSecureBoot) },
          { label: "CBT", value: bool(vm.cbt) },
          { label: "Provisioniert", value: formatBytes(vm.provisionedMiB) },
          { label: "In Use", value: formatBytes(vm.inUseMiB) },
          { label: "Disks", value: String(storage.diskCount) },
          { label: "Snapshots", value: String(snapshots.snapshotCount) },
          { label: "Tools Status", value: compactValue(String(tools["Tools"] || vm.toolsStatus || "")) },
          { label: "Tools Version", value: compactValue(String(tools["Tools Version"] || vm.toolsVersion || "")) },
        ],
      },
      {
        title: "Virtuelle Disks",
        table: {
          headers: ["Disk", "Kapazität", "Modus", "Thin", "Controller", "Pfad"],
          rows: diskRows.map((row) => [
            str(row.data["Disk"]) || "—",
            formatBytes(toNumber(row.data["Capacity MiB"])),
            str(row.data["Disk Mode"]) || "—",
            compactValue(String(row.data["Thin"] ?? "")),
            str(row.data["Controller"]) || "—",
            str(row.data["Disk Path"]) || "—",
          ]),
          sensitiveColumns: { 5: "identifier" },
        },
      },
      {
        title: "Netzwerkadapter",
        table: {
          headers: ["NIC", "Adapter", "Netzwerk", "Switch", "Connected", "MAC", "IPv4"],
          rows: networkRows.map((row) => [
            str(row.data["NIC label"]) || "—",
            str(row.data["Adapter"]) || "—",
            str(row.data["Network"]) || "—",
            str(row.data["Switch"]) || "—",
            compactValue(String(row.data["Connected"] ?? "")),
            str(row.data["Mac Address"]) || "—",
            str(row.data["IPv4 Address"]) || "—",
          ]),
          sensitiveColumns: { 2: "identifier", 3: "identifier", 5: "network", 6: "network" },
        },
      },
      {
        title: "Partitionen",
        table: {
          headers: ["Disk", "Kapazität", "Belegt", "Frei", "Frei %"],
          rows: partitionRows.map((row) => [
            str(row.data["Disk"]) || "—",
            formatBytes(toNumber(row.data["Capacity MiB"])),
            formatBytes(toNumber(row.data["Consumed MiB"])),
            formatBytes(toNumber(row.data["Free MiB"])),
            toNumber(row.data["Free %"]) === null ? "—" : `${decimal(toNumber(row.data["Free %"]), 1)} %`,
          ]),
          sensitiveColumns: { 0: "identifier" },
        },
      },
      {
        title: "VM-Snapshots",
        table: {
          headers: ["Name", "Datum", "Größe", "Status", "Quiesced"],
          rows: snapshotRows.map((row) => [
            str(row.data["Name"]) || "—",
            formatRvtoolsDate(row.data["Date / time"]),
            formatBytes(toNumber(row.data["Size MiB (total)"])),
            str(row.data["State"]) || "—",
            compactValue(String(row.data["Quiesced"] ?? "")),
          ]),
          sensitiveColumns: { 0: "text" },
        },
      },
    ],
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <SystemDetailContent
        icon={<Monitor className="size-6" />}
        eyebrow="VM-Systemakte"
        title={vm.vmName}
        subtitle={[vm.vcenterId, vm.datacenter, vm.cluster, vm.host].filter(Boolean).join(" · ")}
        badges={
          <>
            <Badge variant="secondary" className="rounded-full text-[10px]">{compactValue(vm.powerState)}</Badge>
            <Badge variant="outline" className="rounded-full text-[10px]">Config {compactValue(vm.configStatus)}</Badge>
            {techInfo?.maintenanceWindow && <Badge variant="outline" className="rounded-full text-[10px]">Wartung {techInfo.maintenanceWindow}</Badge>}
            {optionalDataLoading && <Badge variant="outline" className="rounded-full text-[10px]">Zusatzdaten werden geladen…</Badge>}
          </>
        }
        dossier={dossier}
      >
        <DetailNarrative source={workloadProfile ? "RVTools · Tech-Info · vROps" : "RVTools · optionale Zusatzdaten"}>
          {narrative}
        </DetailNarrative>
        <DetailKpiGrid items={kpis} />

        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <DetailSection icon={<ServerCog className="size-4" />} title="Identität & Platzierung" description="Eindeutige Zuordnung der VM innerhalb der virtuellen Infrastruktur.">
            <DetailFieldGrid fields={identityFields} columns={2} />
          </DetailSection>
          <DetailSection icon={<UserRound className="size-4" />} title="Verantwortung & Betrieb" description="Tech-Info ergänzt Zuständigkeit, Wartung und Backup-Kontext.">
            {techInfo ? <DetailFieldGrid fields={techInfoFields} columns={2} /> : <DetailUnavailable title="Keine Tech-Info-Zuordnung" description="Die RVTools-Daten bleiben vollständig sichtbar. Zuständigkeit, Wartungsfenster und Backup-Angaben werden ergänzt, sobald ein passender Tech-Info-Datensatz vorhanden ist." />}
          </DetailSection>
        </div>

        <DetailSection icon={<Activity className="size-4" />} title="Auslastung · sieben Tage" description="Stündliche CPU-Demand- und CPU-Ready-Werte; Wochenende und höchster Peak sind hervorgehoben.">
          {workloadProfile ? (
            <VropsTrendChart
              hourly={workloadProfile.hourly.map((point) => ({
                timestampUtc: point.timestampUtc,
                cpuDemandMHz: point.cpuDemandMHz,
                secondaryValue: point.cpuReadyPct,
              }))}
              cpuCapacityMHz={workloadProfile.configuredCpuCapacityMHz}
              secondaryCapacity={null}
              secondaryUnit="pct"
              secondaryLabel="CPU Ready"
              hasImport
              isMatched
              isLoading={false}
              importedAt={vropsImportedAt}
            />
          ) : (
            <DetailUnavailable title="Keine vROps-Zeitreihe zugeordnet" description="Die Ansicht bleibt ohne Zeitreihe nutzbar. Nach einem passenden vROps-Import erscheint hier automatisch der siebentägige Verlauf." />
          )}
        </DetailSection>

        <div className="grid gap-5 xl:grid-cols-2">
          <DetailSection icon={<Gauge className="size-4" />} title="Lastprofil" description="Muster, Niveau und Qualität der beobachteten Auslastung.">
            {workloadProfile ? <DetailFieldGrid fields={workloadFields} columns={2} /> : <DetailUnavailable title="Profil nicht verfügbar" description="Ohne vROps-Zeitreihe wird keine Verhaltensklasse abgeleitet." />}
          </DetailSection>
          <DetailSection
            icon={<Recycle className="size-4" />}
            title="CPU-Rightsizing"
            description="Konservative, prüfpflichtige Empfehlung auf Basis von Demand und CPU Ready."
            aside={rightsizing && <Badge variant={reclaimable > 0 ? "secondary" : "outline"} className="rounded-full">{reclaimable > 0 ? `${reclaimable} vCPU Potenzial` : "Kein Schritt"}</Badge>}
          >
            {rightsizing ? <DetailFieldGrid fields={rightsizingFields} columns={2} /> : <DetailUnavailable title="Keine Rightsizing-Auswertung" description="Ohne passendes Profil oder bei fehlenden Kapazitätsdaten wird keine Empfehlung angezeigt." />}
          </DetailSection>
        </div>

        {client && (
          <DetailSection icon={<ShieldCheck className="size-4" />} title="Ergänzende Client-Informationen" description="Zusätzliche Daten aus dem verknüpften Tech-Info-Clientbestand.">
            <DetailFieldGrid fields={clientFields} />
          </DetailSection>
        )}

        <DetailSection icon={<Cpu className="size-4" />} title="Technische Detaildaten" description="Ressourcen, Storage, Netzwerk, VMware Tools und Snapshots aus den RVTools-Quellblättern.">
          <VmTechnicalSections
            vm={vm}
            cpuRows={cpuRows}
            memoryRows={memoryRows}
            diskRows={diskRows}
            partitionRows={partitionRows}
            networkRows={networkRows}
            snapshotRows={snapshotRows}
            toolsRows={toolsRows}
            showTrend={false}
          />
        </DetailSection>
      </SystemDetailContent>
    </Dialog>
  );
}
