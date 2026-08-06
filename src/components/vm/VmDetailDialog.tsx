import { useMemo } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Check,
  Cpu,
  Gauge,
  MemoryStick,
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
  VmRamRightsizingCandidate,
  VmWorkloadProfile,
} from "@/domain/models/types";
import { formatRvtoolsDate, matchRowsForVm, summarizeSnapshots, summarizeStorage } from "@/lib/vmDetail";
import { compactValue, lastPathSegment, str, toNumber } from "@/lib/vmDetailFormat";
import { formatBytes } from "@/lib/xlsx/parseHelpers";
import { VM_WORKLOAD_INTENSITY_LABEL, VM_WORKLOAD_SHAPE_LABEL } from "@/domain/services/vmWorkloadProfileService";
import { DEFAULT_RAM_RIGHTSIZING_POLICY, RAM_RIGHTSIZING_POLICIES } from "@/domain/services/vmRamRightsizingService";
import { VM_RIGHTSIZING_WITHHELD_LABEL, VM_RIGHTSIZING_WITHHELD_NARRATIVE } from "@/domain/services/vmRightsizingService";
import { RIGHTSIZING_COLUMNS, RIGHTSIZING_SECTIONS, VM_PROFILE_COLUMNS, VM_PROFILE_SECTIONS, VM_PROFILE_UI } from "@/lib/glossaries/workloadIntelligence";
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
import type { VropsObjectTrendPoint } from "@/hooks/useVropsObjectSeries";
import { WorkloadIntensityBadge } from "@/components/vm/WorkloadBadges";
import { describeTrendRange } from "@/lib/trendDownsampling";
import { VmTechnicalSections } from "@/components/vm/VmTechnicalSections";

interface VmDetailDialogProps {
  vm: NormalizedVm | null;
  techInfo?: TechInfoLatest | null;
  client?: TechInfoClientLatest | null;
  workloadProfile?: VmWorkloadProfile | null;
  rightsizing?: VmRightsizingCandidate | null;
  ramRightsizing?: VmRamRightsizingCandidate | null;
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

function hours(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString("de-DE");
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

function rightsizingNarrative(rightsizing: VmRightsizingCandidate | null, reclaimable: number, additional: number): string {
  if (additional > 0) return `CPU vergrößern prüfen: voraussichtlich ${additional} vCPU zusätzlich nötig.`;
  if (reclaimable > 0) return `CPU verkleinern prüfen: ${reclaimable} vCPU könnten frei werden.`;
  if (rightsizing?.recommendationWithheldReason) return VM_RIGHTSIZING_WITHHELD_NARRATIVE[rightsizing.recommendationWithheldReason];
  return "Die aktuelle CPU-Größe wirkt passend.";
}

function VmCpuSummary({
  vm,
  workloadProfile,
  rightsizing,
  p95Pct,
  reclaimable,
  additional,
}: {
  vm: NormalizedVm;
  workloadProfile: VmWorkloadProfile | null;
  rightsizing: VmRightsizingCandidate | null;
  p95Pct: number | null;
  reclaimable: number;
  additional: number;
}) {
  if (!workloadProfile) {
    return <p>Keine zugeordnete vROps-Zeitreihe – CPU-Auslastung und Rightsizing sind derzeit nicht beurteilbar.</p>;
  }

  const hasUpsizingNeed = additional > 0;
  const hasDownsizingPotential = reclaimable > 0;
  const actionText = rightsizingNarrative(rightsizing, reclaimable, additional);
  const actionClass = hasUpsizingNeed
    ? "border-destructive/30 bg-destructive/10 text-destructive"
    : hasDownsizingPotential
      ? "border-warning/30 bg-warning/10 text-warning"
      : "border-success/30 bg-success/10 text-success";
  const ActionIcon = hasUpsizingNeed ? ArrowUp : hasDownsizingPotential ? ArrowDown : Check;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="font-medium">CPU-Auslastung P95 {percent(p95Pct)}</span>
      <WorkloadIntensityBadge intensity={workloadProfile.intensity} />
      <span className="text-muted-foreground">Muster: {VM_WORKLOAD_SHAPE_LABEL[workloadProfile.shape]}</span>
      <span className="text-muted-foreground">Konfiguriert: {vm.cpuCount ?? "—"} vCPU</span>
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${actionClass}`}>
        <ActionIcon className="size-3.5" aria-hidden="true" />
        {actionText}
      </span>
    </div>
  );
}

export function VmDetailDialog({
  vm,
  techInfo = null,
  client = null,
  workloadProfile = null,
  rightsizing = null,
  ramRightsizing = null,
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
  const additional = rightsizing?.additionalVcpu ?? 0;
  const demandP95Example = workloadProfile
    ? `Hier: ${decimal(workloadProfile.demand.p95, 0)} MHz entsprechen ${percent(p95Pct)} der konfigurierten Kapazität von ${workloadProfile.configuredCpuCapacityMHz ? `${decimal(workloadProfile.configuredCpuCapacityMHz, 0)} MHz` : "—"}. In 95 % der verwertbaren Stunden lag der Demand höchstens auf diesem Niveau.`
    : undefined;
  const readyP95Example = workloadProfile
    ? `Hier: CPU Ready P95 ${percent(workloadProfile.ready.p95)} über ${workloadProfile.ready.sampleCount.toLocaleString("de-DE")} Messpunkten. Werte über etwa 5 % sollten auf Host-/Cluster-Contention und vCPU-Breite geprüft werden.`
    : undefined;
  const profileExample = workloadProfile
    ? `Hier: Muster „${VM_WORKLOAD_SHAPE_LABEL[workloadProfile.shape]}“, Niveau „${VM_WORKLOAD_INTENSITY_LABEL[workloadProfile.intensity]}“, Datenabdeckung ${percent(workloadProfile.demand.coverageRatio * 100)} bei ${workloadProfile.demand.sampleCount.toLocaleString("de-DE")} Messpunkten.`
    : undefined;
  const trendExample = workloadProfile
    ? `Für diese VM: Demand P95 ${decimal(workloadProfile.demand.p95, 0)} MHz; höchster Stundenmittelwert ${decimal(workloadProfile.demand.maximum, 0)} MHz. Kurze Spitzen können darüber liegen, wenn Demand Max importiert wurde.`
    : undefined;
  const concentrationExample = workloadProfile
    ? `Hier: Index ${decimal(workloadProfile.capacitySignals.concentrationIndexP90)}. 0 bedeutet gleichmäßig verteilte Last, 1 annähernd Last auf einem Kern; ergänzend werden maximal ${decimal(workloadProfile.capacitySignals.effectiveCoresMax)} effektiv belastete Kerne geschätzt.`
    : undefined;
  const singleCoreExample = workloadProfile
    ? `Hier: ${hours(workloadProfile.capacitySignals.singleCoreBoundHours)} Stunden mit geschätzter Sättigung des heißesten Kerns bei gleichzeitig höchstens 60 % Gesamtlast. Mehr vCPU helfen dann nicht automatisch – Anwendungsthreads und Parallelisierung prüfen.`
    : undefined;

  // Der RAM-Verlauf steht auf derselben Stundenreihe wie der CPU-Verlauf, führt
  // aber eine eigene Metrik: vROps liefert Memory|Workload bereits als Prozent
  // des konfigurierten RAM, nicht als absolute Größe.
  const memoryTrendPoints: VropsObjectTrendPoint[] = workloadProfile?.hourly.map((point): VropsObjectTrendPoint => ({
    timestampUtc: point.timestampUtc,
    primaryValue: point.memoryWorkloadAvgPct ?? null,
    primaryPeakValue: point.memoryWorkloadMaxPct ?? null,
    secondaryValue: null,
  })) ?? [];
  const hasMemoryTrend = memoryTrendPoints.some((point) => point.primaryValue !== null || point.primaryPeakValue !== null);
  const memoryCapacityMiB = workloadProfile?.configuredMemoryMiB ?? vm.memoryMiB;
  // Die markierte Zone folgt der aktiven RAM-Policy: oberhalb ihrer
  // Zielauslastung ist der geplante Puffer aufgebraucht.
  const ramPolicy = ramRightsizing ? RAM_RIGHTSIZING_POLICIES[ramRightsizing.policyLevel] : DEFAULT_RAM_RIGHTSIZING_POLICY;
  const ramAvoidanceThresholdPct = Math.round(ramPolicy.targetWorkloadFactor * 100);

  const kpis: DetailKpi[] = [
    { label: "Betriebszustand", value: compactValue(vm.powerState), hint: compactValue(vm.connectionState), tone: vmTone(vm.powerState) },
    { label: "vCPU", value: compactValue(vm.cpuCount === null ? null : String(vm.cpuCount)), hint: `${toNumber(cpu["Sockets"]) ?? "—"} Sockel`, tone: "neutral", info: VM_PROFILE_COLUMNS.vcpu },
    { label: "Arbeitsspeicher", value: formatBytes(vm.memoryMiB), hint: `vMemory.Active Rohdiagnose: ${formatBytes(toNumber(memory["Active"]))}`, tone: "neutral" },
    { label: "CPU Demand P95", value: percent(p95Pct), hint: workloadProfile ? `${decimal(workloadProfile.demand.p95, 0)} MHz` : "Keine Zeitreihe", tone: p95Pct !== null && p95Pct >= 80 ? "critical" : p95Pct !== null && p95Pct >= 60 ? "warning" : "neutral", info: VM_PROFILE_COLUMNS.demandP95Pct, infoExample: demandP95Example },
    { label: "CPU Ready P95", value: percent(workloadProfile?.ready.p95), hint: workloadProfile ? `${workloadProfile.demand.sampleCount} Messpunkte` : "Keine Zeitreihe", tone: (workloadProfile?.ready.p95 ?? 0) > 5 ? "warning" : workloadProfile ? "good" : "neutral", info: VM_PROFILE_COLUMNS.readyP95, infoExample: readyP95Example },
    {
      label: "Rightsizing",
      value: rightsizing?.recommendedVcpu ? `${rightsizing.recommendedVcpu} vCPU` : "Keine Änderung",
      hint: additional > 0
        ? `${additional} vCPU fehlen`
        : reclaimable > 0
          ? `${reclaimable} vCPU rückgewinnbar`
          : rightsizing?.recommendationWithheldReason ? VM_RIGHTSIZING_WITHHELD_LABEL[rightsizing.recommendationWithheldReason] : "Kein Kandidat",
      // Unterdimensionierung wiegt schwerer als ungenutzte Kapazität: Die eine kostet
      // Leistung im laufenden Betrieb, die andere nur Reserve.
      tone: additional > 0 ? "critical" : reclaimable > 0 ? "warning" : "neutral",
      info: RIGHTSIZING_COLUMNS.recommendedVcpu,
    },
  ];

  const identityFields: DetailField[] = [
    { label: "vCenter", value: compactValue(vm.vcenterId), sensitivity: "identifier" },
    { label: "Datacenter", value: compactValue(vm.datacenter), sensitivity: "identifier" },
    { label: "Cluster", value: compactValue(vm.cluster), sensitivity: "identifier" },
    { label: "ESXi Host", value: compactValue(vm.host), sensitivity: "identifier" },
    { label: "Folder", value: compactValue(lastPathSegment(vm.folder)), sensitivity: "identifier" },
    { label: "Resource Pool", value: compactValue(lastPathSegment(vm.resourcePool)), sensitivity: "identifier" },
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
    { label: "Lastmuster", value: VM_WORKLOAD_SHAPE_LABEL[workloadProfile.shape], info: VM_PROFILE_COLUMNS.shape },
    {
      label: "Auslastungsniveau",
      value: VM_WORKLOAD_INTENSITY_LABEL[workloadProfile.intensity],
      tone: ["idle", "very-low", "low"].includes(workloadProfile.intensity)
        ? "good"
        : ["moderate", "elevated"].includes(workloadProfile.intensity)
          ? "warning"
          : workloadProfile.intensity === "high"
          ? "critical"
            : "neutral",
      info: VM_PROFILE_COLUMNS.intensity,
      infoExample: profileExample,
    },
    { label: "Vertrauen", value: workloadProfile.confidence, info: VM_PROFILE_UI.confidence },
    { label: "Datenabdeckung", value: percent(workloadProfile.demand.coverageRatio * 100), info: VM_PROFILE_COLUMNS.coverage },
    { label: "Variationskoeffizient", value: decimal(workloadProfile.signals.coefficientOfVariation), info: VM_PROFILE_COLUMNS.coefficientOfVariation },
    { label: "Aktive Stunden", value: percent(workloadProfile.signals.dutyCyclePct), info: VM_PROFILE_COLUMNS.dutyCycle },
    { label: "Grundlastanteil", value: percent(workloadProfile.signals.baselineRatio === null ? null : workloadProfile.signals.baselineRatio * 100), info: VM_PROFILE_COLUMNS.baselineRatio },
    { label: "Tages-Wiederholbarkeit", value: decimal(workloadProfile.signals.dailyRepeatability), info: VM_PROFILE_COLUMNS.dailyRepeatability },
    { label: "Wochen-Wiederholbarkeit", value: decimal(workloadProfile.signals.weeklyRepeatability), info: VM_PROFILE_COLUMNS.weeklyRepeatability },
    { label: "Streuung der Wochenmaxima", value: decimal(workloadProfile.signals.weeklyPeakVariation), info: VM_PROFILE_COLUMNS.weeklyPeakVariation },
    { label: "Business-Hours-Konzentration", value: decimal(workloadProfile.signals.businessHoursConcentration), info: VM_PROFILE_COLUMNS.businessHoursConcentration },
    { label: "Nacht-Konzentration", value: decimal(workloadProfile.signals.nightConcentration), info: VM_PROFILE_COLUMNS.nightConcentration },
    { label: "Wochenend-Konzentration", value: decimal(workloadProfile.signals.weekendConcentration), info: VM_PROFILE_COLUMNS.weekendConcentration },
    { label: "Konfigurierte CPU-Kapazität", value: workloadProfile.configuredCpuCapacityMHz ? `${decimal(workloadProfile.configuredCpuCapacityMHz, 0)} MHz` : "—", info: VM_PROFILE_COLUMNS.configuredCapacity },
    { label: "Stunden über 75 % Kapazität", value: workloadProfile.capacitySignals.hoursAboveCapacity75 === null ? "—" : hours(workloadProfile.capacitySignals.hoursAboveCapacity75), info: VM_PROFILE_COLUMNS.hoursAboveCapacity75 },
    { label: "Stunden über 90 % Kapazität", value: workloadProfile.capacitySignals.hoursAboveCapacity90 === null ? "—" : hours(workloadProfile.capacitySignals.hoursAboveCapacity90), info: VM_PROFILE_COLUMNS.hoursAboveCapacity90 },
    { label: "Co-Stop unter Last P95", value: percent(workloadProfile.capacitySignals.costopUnderLoadP95Pct), info: VM_PROFILE_COLUMNS.costopUnderLoadP95 },
    { label: "Stunden Einzelkern-Engpass", value: hours(workloadProfile.capacitySignals.singleCoreBoundHours), info: VM_PROFILE_COLUMNS.singleCoreBoundHours, infoExample: singleCoreExample },
    { label: "Lastkonzentration", value: decimal(workloadProfile.capacitySignals.concentrationIndexP90), info: VM_PROFILE_COLUMNS.concentrationIndexP90, infoExample: concentrationExample },
    { label: "Belastete Kerne (max.)", value: decimal(workloadProfile.capacitySignals.effectiveCoresMax), info: VM_PROFILE_COLUMNS.effectiveCoresMax },
  ] : [];

  const rightsizingFields: DetailField[] = rightsizing ? [
    { label: "Konfiguriert", value: rightsizing.vcpu === null ? "—" : `${rightsizing.vcpu} vCPU`, info: RIGHTSIZING_COLUMNS.configured },
    { label: "Genutzt P95", value: rightsizing.usedVcpuEquivalentP95 === null ? "—" : `${decimal(rightsizing.usedVcpuEquivalentP95)} vCPU`, info: RIGHTSIZING_COLUMNS.usedVcpuEquivalent },
    { label: "Genutzt Spitze", value: rightsizing.usedVcpuEquivalentPeak === null ? "—" : `${decimal(rightsizing.usedVcpuEquivalentPeak)} vCPU`, info: RIGHTSIZING_COLUMNS.usedVcpuEquivalentPeak },
    { label: "MHz je vCPU", value: rightsizing.mhzPerVcpu === null ? "—" : `${decimal(rightsizing.mhzPerVcpu, 0)} MHz`, info: RIGHTSIZING_COLUMNS.mhzPerVcpu },
    { label: "Bedarfsgerecht", value: rightsizing.demandBasedVcpu === null ? "—" : `${rightsizing.demandBasedVcpu} vCPU`, info: RIGHTSIZING_COLUMNS.demandBasedVcpu },
    { label: "Empfohlen", value: rightsizing.recommendedVcpu === null ? "Keine Empfehlung" : `${rightsizing.recommendedVcpu} vCPU`, info: RIGHTSIZING_COLUMNS.recommendedVcpu },
    { label: "Rückgewinnbar", value: rightsizing.reclaimableVcpu === null ? "—" : `${rightsizing.reclaimableVcpu} vCPU`, info: RIGHTSIZING_COLUMNS.reclaimableVcpu },
    { label: "Zusätzlich nötig", value: rightsizing.additionalVcpu === null ? "—" : `${rightsizing.additionalVcpu} vCPU`, info: RIGHTSIZING_COLUMNS.additionalVcpu },
    { label: "Viele vCPU, geringer Bedarf", value: bool(rightsizing.flags.manyVcpuLowDemand), info: RIGHTSIZING_COLUMNS.manyVcpuLowDemand },
    { label: "Auffälliges CPU Ready", value: bool(rightsizing.flags.highCpuReady), info: RIGHTSIZING_COLUMNS.highCpuReady },
    { label: "Co-Stop unter Last", value: bool(rightsizing.flags.costopUnderLoad), info: RIGHTSIZING_COLUMNS.costopUnderLoad },
    { label: "Einzelkern-Engpass", value: bool(rightsizing.flags.singleCoreBound), info: RIGHTSIZING_COLUMNS.singleCoreBound, infoExample: singleCoreExample },
    { label: "Last auf wenigen Kernen", value: bool(rightsizing.flags.concentratedOnFewCores), info: RIGHTSIZING_COLUMNS.concentratedOnFewCores, infoExample: concentrationExample },
    { label: "Dauerhaft nahe Kapazität", value: bool(rightsizing.flags.sustainedNearCapacity), info: RIGHTSIZING_COLUMNS.sustainedNearCapacity },
  ] : [];
  const ramRightsizingFields: DetailField[] = ramRightsizing ? [
    { label: "RAM aktuell", value: formatBytes(ramRightsizing.configuredMemoryMiB) },
    { label: "Workload Avg P95", value: percent(ramRightsizing.workloadAvg.p95) },
    { label: "Workload Avg P99", value: percent(ramRightsizing.workloadAvg.p99) },
    { label: `Peak Workload Max ${ramRightsizing.peakStatistic === "p995" ? "P99,5" : "P99"}`, value: percent(ramRightsizing.workloadMax?.[ramRightsizing.peakStatistic] ?? null) },
    { label: "RAM-Bedarf berechnet", value: formatBytes(ramRightsizing.requiredMemoryMiB) },
    { label: "RAM empfohlen", value: formatBytes(ramRightsizing.recommendedMemoryMiB) },
    { label: "Delta", value: ramRightsizing.deltaMiB === null ? "—" : `${ramRightsizing.deltaMiB > 0 ? "+" : ramRightsizing.deltaMiB < 0 ? "−" : ""}${formatBytes(Math.abs(ramRightsizing.deltaMiB))}` },
    { label: "Richtung", value: ramRightsizing.direction === "shrink" ? "Verkleinern" : ramRightsizing.direction === "grow" ? "Vergrößern" : ramRightsizing.direction === "unchanged" ? "Unverändert" : "Nicht berechenbar" },
    { label: "Datenabdeckung", value: percent(ramRightsizing.coverageRatio * 100) },
    { label: "Datenqualität", value: ramRightsizing.confidence },
    { label: "Begründung", value: ramRightsizing.recommendationReason ?? "—" },
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
    ? `CPU-Auslastung P95: ${percent(p95Pct)} (${VM_WORKLOAD_INTENSITY_LABEL[workloadProfile.intensity]}), Muster: ${VM_WORKLOAD_SHAPE_LABEL[workloadProfile.shape]}. ${rightsizingNarrative(rightsizing, reclaimable, additional)}`
    : "Keine zugeordnete vROps-Zeitreihe – CPU-Auslastung und Rightsizing sind derzeit nicht beurteilbar.";

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
      title: `CPU-Auslastung · ${describeTrendRange(workloadProfile.hourly.length)}`,
      points: workloadProfile.hourly.map((point) => ({
        timestampUtc: point.timestampUtc,
        primaryValue: point.cpuDemandMHz,
        primaryPeakValue: point.cpuDemandMaxMHz,
        secondaryValue: point.cpuReadyPct,
      })),
      cpuCapacityMHz: workloadProfile.configuredCpuCapacityMHz,
      importedAt: vropsImportedAt,
      secondaryLabel: "CPU Ready (%)",
    } : undefined,
    sections: [
      { title: "Identität & Platzierung", fields: identityFields },
      {
        title: "Verantwortung & Betrieb",
        fields: techInfoFields,
        note: techInfo ? undefined : "Keine verknüpften Tech-Info-Daten vorhanden.",
      },
      { title: "Auslastungsprofil", fields: workloadFields, note: workloadProfile ? undefined : "Keine zugeordnete vROps-Zeitreihe vorhanden." },
      {
        title: "CPU-Rightsizing",
        fields: rightsizingFields,
        note: rightsizing
          ? (additional > 0 && rightsizing.flags.singleCoreBound
            ? "Warnung: In anderen Stunden ist ein Kern gesättigt, obwohl die VM insgesamt Luft hat. Zusätzliche vCPU helfen in diesen Stunden nicht. Empfehlung gemeinsam mit dem Anwendungsmuster prüfen."
            : "Empfehlungen sind prüfpflichtig und werden nicht automatisch umgesetzt.")
          : "Keine Rightsizing-Auswertung vorhanden.",
      },
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
          <VmCpuSummary
            vm={vm}
            workloadProfile={workloadProfile}
            rightsizing={rightsizing}
            p95Pct={p95Pct}
            reclaimable={reclaimable}
            additional={additional}
          />
        </DetailNarrative>
        <DetailKpiGrid items={kpis} />

        {/* Der Verlauf steht bewusst vor den Stammdaten: er ist die Frage, mit der die Systemakte geöffnet wird. */}
        <DetailSection
          icon={<Activity className="size-4" />}
          title={`Auslastung · ${describeTrendRange(workloadProfile?.hourly.length ?? 0)}`}
          description="CPU-Demand- und CPU-Ready-Werte; Wochenende, höchster Peak und die aktuelle Wochenzeit sind hervorgehoben."
          info={VM_PROFILE_SECTIONS.detailTrend}
          infoExample={trendExample}
        >
          {workloadProfile ? (
            <VropsTrendChart
              hourly={workloadProfile.hourly.map((point) => ({
                timestampUtc: point.timestampUtc,
                primaryValue: point.cpuDemandMHz,
                primaryPeakValue: point.cpuDemandMaxMHz,
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

        {/* Der RAM-Verlauf ist die Datengrundlage, mit der Systemverantwortliche
            das RAM-Rightsizing beurteilen; er bleibt deshalb neben dem CPU-Verlauf
            eigenständig sichtbar. */}
        <DetailSection
          icon={<MemoryStick className="size-4" />}
          title={`RAM-Auslastung · ${describeTrendRange(workloadProfile?.hourly.length ?? 0)}`}
          description={`Memory-Workload aus vROps in Prozent des konfigurierten RAM (${formatBytes(memoryCapacityMiB)}); Wochenende, höchster Peak und die aktuelle Wochenzeit sind hervorgehoben.`}
        >
          {hasMemoryTrend ? (
            <VropsTrendChart
              hourly={memoryTrendPoints}
              primaryMetric="memory-workload"
              title="RAM-Auslastungsverlauf"
              cpuCapacityMHz={null}
              memoryCapacityMiB={memoryCapacityMiB}
              secondaryCapacity={null}
              avoidanceThresholdPct={ramAvoidanceThresholdPct}
              hasImport
              isMatched
              isLoading={false}
              importedAt={vropsImportedAt}
            />
          ) : (
            <DetailUnavailable
              title="Keine RAM-Workload-Zeitreihe zugeordnet"
              description="Der CPU-Verlauf bleibt unabhängig davon nutzbar. Sobald ein vROps-Import die Spalte Memory|Workload enthält, erscheint hier der RAM-Verlauf mit derselben Auflösung."
            />
          )}
        </DetailSection>

        <div className="grid gap-5 xl:grid-cols-2">
          <DetailSection icon={<ServerCog className="size-4" />} title="Identität & Platzierung" description="Eindeutige Zuordnung der VM innerhalb der virtuellen Infrastruktur.">
            <DetailFieldGrid fields={identityFields} columns={2} />
          </DetailSection>
          <DetailSection icon={<UserRound className="size-4" />} title="Verantwortung & Betrieb" description="Tech-Info ergänzt Zuständigkeit, Wartung und Backup-Kontext.">
            {techInfo ? <DetailFieldGrid fields={techInfoFields} columns={2} /> : <DetailUnavailable title="Keine Tech-Info-Zuordnung" description="Die RVTools-Daten bleiben vollständig sichtbar. Zuständigkeit, Wartungsfenster und Backup-Angaben werden ergänzt, sobald ein passender Tech-Info-Datensatz vorhanden ist." />}
          </DetailSection>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <DetailSection icon={<Gauge className="size-4" />} title="Lastprofil" description="Muster, Niveau und Qualität der beobachteten Auslastung." info={VM_PROFILE_SECTIONS.detailProfile} infoExample={profileExample}>
            {workloadProfile ? <DetailFieldGrid fields={workloadFields} columns={2} /> : <DetailUnavailable title="Profil nicht verfügbar" description="Ohne vROps-Zeitreihe wird keine Verhaltensklasse abgeleitet." />}
          </DetailSection>
          <DetailSection
            icon={<Recycle className="size-4" />}
            title="CPU-Rightsizing"
            description="Konservative, prüfpflichtige Empfehlung auf Basis von Demand und CPU Ready."
            info={RIGHTSIZING_SECTIONS.candidateTable}
            aside={rightsizing && <Badge variant={reclaimable > 0 ? "secondary" : "outline"} className="rounded-full">{reclaimable > 0 ? `${reclaimable} vCPU Potenzial` : "Kein Schritt"}</Badge>}
          >
            {rightsizing ? <DetailFieldGrid fields={rightsizingFields} columns={2} /> : <DetailUnavailable title="Keine Rightsizing-Auswertung" description="Ohne passendes Profil oder bei fehlenden Kapazitätsdaten wird keine Empfehlung angezeigt." />}
          </DetailSection>
        </div>

        <DetailSection
          icon={<MemoryStick className="size-4" />}
          title="RAM-Rightsizing"
          description="Eigenständige Bewertung aus vROps Memory|Workload und konfiguriertem RAM aus RVTools vInfo.Memory. vMemory.Active bleibt eine Rohdiagnose und fließt nicht ein."
          aside={ramRightsizing && <Badge variant={ramRightsizing.direction === "shrink" ? "secondary" : ramRightsizing.direction === "grow" ? "destructive" : "outline"} className="rounded-full">{ramRightsizing.direction === "shrink" ? "Verkleinern prüfen" : ramRightsizing.direction === "grow" ? "Vergrößern prüfen" : ramRightsizing.direction === "unchanged" ? "Kein Schritt" : "Nicht berechenbar"}</Badge>}
        >
          {ramRightsizing ? <DetailFieldGrid fields={ramRightsizingFields} columns={2} /> : <DetailUnavailable title="Keine RAM-Rightsizing-Auswertung" description="Ohne Memory Workload Avg im vROps-Import wird keine RAM-Empfehlung berechnet. Die vMemory.Active-Rohkennzahl bleibt davon unabhängig sichtbar." />}
        </DetailSection>

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
