import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Layers3, PlusSquare, Server } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { FillUpClusterDetails } from "@/components/planning/fill-up/FillUpClusterDetails";
import { FillUpClusterTable } from "@/components/planning/fill-up/FillUpClusterTable";
import { FillUpInputControls } from "@/components/planning/fill-up/FillUpInputControls";
import { FillUpWorkloadProfileEditor } from "@/components/planning/fill-up/FillUpWorkloadProfileEditor";
import { FillUpObservedVmProfileTable } from "@/components/planning/fill-up/FillUpObservedVmProfileTable";
import { VropsDataQualityCard } from "@/components/planning/fill-up/VropsDataQualityCard";
import { FillUpRunHistory } from "@/components/planning/fill-up/FillUpRunHistory";
import { useFillUpPlanning } from "@/hooks/useFillUpPlanning";
import {
  DEFAULT_FILL_UP_HIGH_SHARE_PCT,
  DEFAULT_FILL_UP_WORKLOAD_PROFILES,
  type FillUpPlanningClusterResult,
} from "@/domain/services/fillUpPlanningService";
import { DEFAULT_CPU_DEMAND_CONCURRENCY_PCT } from "@/domain/services/fillUpRecommendationEngine";
import type { FillUpObservedVmProfile, FillUpWorkloadProfile, GlobalWorkloadClassProfile } from "@/domain/models/types";
import { FILL_UP_KPI, FILL_UP_UI } from "@/lib/glossaries/planning";
import { toast } from "sonner";

/** Kein Präzisionsverlust beim Übernehmen, aber auch keine sinnlos langen Beobachtungsnachkommastellen. */
function roundAdoptedValue(value: number): number {
  return Math.max(0.01, Math.round(value * 100) / 100);
}

function hasUsableGlobalAverages(profile: GlobalWorkloadClassProfile | undefined): profile is GlobalWorkloadClassProfile {
  return Boolean(profile && profile.averageVcpu !== null && profile.averageConfiguredMemoryMiB !== null && profile.cpuDemandP95MHz !== null);
}

/** Ersetzt Name und Werte des Standardprofils durch den HIGH-/STD-Durchschnitt über alle eingeschalteten, nicht-vCLS-VMs. */
function toGlobalAverageProfile(profile: FillUpWorkloadProfile, global: GlobalWorkloadClassProfile): FillUpWorkloadProfile {
  return {
    ...profile,
    name: `${profile.workloadClass.toUpperCase()} · Ø alle VMs`,
    vcpu: roundAdoptedValue(global.averageVcpu!),
    memoryMiB: roundAdoptedValue(global.averageConfiguredMemoryMiB!),
    cpuDemandP95MHz: roundAdoptedValue(global.cpuDemandP95MHz!),
    cpuDemandAverageMHz: global.averageCpuDemandMHz === null ? null : roundAdoptedValue(global.averageCpuDemandMHz),
  };
}

function formatPlanningError(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Die Fill-Up-Auswertung ist ohne verwertbaren Browserfehler abgebrochen. Bitte den Import erneut öffnen; bei erneutem Auftreten diese Meldung weitergeben.";
}

export function FillUpPlanningPanel() {
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<FillUpWorkloadProfile[]>([...DEFAULT_FILL_UP_WORKLOAD_PROFILES]);
  const [highSharePct, setHighSharePct] = useState(DEFAULT_FILL_UP_HIGH_SHARE_PCT);
  const [cpuDemandConcurrencyPct, setCpuDemandConcurrencyPct] = useState(DEFAULT_CPU_DEMAND_CONCURRENCY_PCT);
  const [includeN2, setIncludeN2] = useState(false);
  const [selectedClusterKey, setSelectedClusterKey] = useState<string | null>(null);
  const highProfile = profiles.find((profile) => profile.workloadClass === "high");
  const stdProfile = profiles.find((profile) => profile.workloadClass === "std");
  const mix = highProfile && stdProfile ? { highProfileId: highProfile.id, stdProfileId: stdProfile.id, highSharePct } : undefined;
  const planning = useFillUpPlanning(selectedImportId, profiles, mix, includeN2, cpuDemandConcurrencyPct);
  const effectiveImportId = selectedImportId ?? planning.selectedImport?.id ?? null;

  // Standardwerte der typischen zusätzlichen VM einmalig mit dem HIGH-/STD-Durchschnitt über alle
  // eingeschalteten, nicht-vCLS-VMs vorbelegen. Danach nicht mehr überschreiben, damit spätere
  // manuelle Anpassungen erhalten bleiben.
  const defaultsSeededRef = useRef(false);
  useEffect(() => {
    if (defaultsSeededRef.current) return;
    const high = planning.globalWorkloadClassProfiles.find((profile) => profile.workloadClass === "high");
    const std = planning.globalWorkloadClassProfiles.find((profile) => profile.workloadClass === "std");
    if (!hasUsableGlobalAverages(high) && !hasUsableGlobalAverages(std)) return;
    defaultsSeededRef.current = true;
    setProfiles((current) => current.map((profile) => {
      if (profile.id === "high-standard" && hasUsableGlobalAverages(high)) return toGlobalAverageProfile(profile, high);
      if (profile.id === "std-standard" && hasUsableGlobalAverages(std)) return toGlobalAverageProfile(profile, std);
      return profile;
    }));
  }, [planning.globalWorkloadClassProfiles]);

  useEffect(() => {
    if (selectedClusterKey && planning.results.some((row) => row.cluster.clusterKey === selectedClusterKey)) return;
    setSelectedClusterKey(planning.results[0]?.cluster.clusterKey ?? null);
  }, [planning.results, selectedClusterKey]);

  const selectedResult = useMemo<FillUpPlanningClusterResult | null>(() => planning.results.find((row) => row.cluster.clusterKey === selectedClusterKey) ?? null, [planning.results, selectedClusterKey]);
  const observedProfiles = useMemo(() => planning.results.flatMap((row) => row.observedVmProfiles), [planning.results]);
  const quality = planning.results[0]?.quality ?? null;
  const hostsInScope = useMemo(() => planning.results.reduce((sum, row) => sum + row.hostCount, 0), [planning.results]);
  const additionalVmsTotal = useMemo(
    () => planning.results.reduce((sum, row) => sum + (row.recommendation.workloadMixRecommendation?.maxAdditionalVms ?? 0), 0),
    [planning.results],
  );
  const criticalClusterCount = useMemo(() => planning.results.filter((row) => row.capacity.n1?.status === "red").length, [planning.results]);
  const adoptObservedProfile = useCallback((observed: FillUpObservedVmProfile) => {
    if (observed.averageVcpu === null || observed.averageConfiguredMemoryMiB === null || observed.cpuDemandP95MHz === null) {
      toast.error("Das beobachtete Profil ist wegen fehlender vCPU-, RAM- oder CPU-P95-Werte nicht übernehmbar.");
      return;
    }
    const scope = observed.scope === "cluster" ? "Gesamt" : observed.resourcePool ?? "Ohne Resource Pool";
    const profile: FillUpWorkloadProfile = {
      id: `observed-${crypto.randomUUID()}`,
      name: `${observed.clusterName} · ${scope}`,
      workloadClass: observed.suggestedWorkloadClass,
      vcpu: roundAdoptedValue(observed.averageVcpu),
      memoryMiB: roundAdoptedValue(observed.averageConfiguredMemoryMiB),
      cpuDemandP95MHz: roundAdoptedValue(observed.cpuDemandP95MHz),
      cpuDemandAverageMHz: observed.averageCpuDemandMHz === null ? null : roundAdoptedValue(observed.averageCpuDemandMHz),
    };
    setProfiles((current) => [profile, ...current]);
    toast.success(`${profile.name} ist jetzt das aktive ${profile.workloadClass.toUpperCase()}-Profil und bleibt editierbar.`);
  }, []);
  return <div className="space-y-6">
    <KpiGrid>
      <KpiCard title="Berechnete Cluster" value={planning.results.length.toLocaleString("de-DE")} icon={<Layers3 className="h-4 w-4" />} info={FILL_UP_KPI.clustersEvaluated} />
      <KpiCard title="Hosts im Scope" value={hostsInScope.toLocaleString("de-DE")} icon={<Server className="h-4 w-4" />} info={FILL_UP_KPI.hostsInScope} />
      <KpiCard title="Zusätzliche VMs gesamt" value={`+${additionalVmsTotal.toLocaleString("de-DE")}`} icon={<PlusSquare className="h-4 w-4" />} info={FILL_UP_KPI.additionalVmsTotal} />
      <KpiCard title="Kritische Cluster" value={criticalClusterCount.toLocaleString("de-DE")} severity={criticalClusterCount > 0 ? "crit" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} info={FILL_UP_KPI.criticalClusters} />
    </KpiGrid>
    <Card className="overflow-hidden border-t-4 border-t-primary shadow-sm">
      <CardHeader className="pb-3"><InfoTooltip entry={FILL_UP_UI.capacity} side="right"><CardTitle className="w-fit cursor-help">Fill-Up-Kapazität</CardTitle></InfoTooltip><p className="text-sm text-muted-foreground">Historische vROps-Zeitreihen werden gegen eingefrorene RVTools-Beziehungen, die aktive Policy und einen expliziten P95-Workload gerechnet. CPU- und RAM-Headrooms bleiben unabhängig ausgewiesen.</p></CardHeader>
      <FillUpInputControls imports={planning.imports} selectedImportId={effectiveImportId} onImportChange={setSelectedImportId} includeN2={includeN2} onIncludeN2Change={setIncludeN2} highSharePct={highSharePct} onHighShareChange={setHighSharePct} cpuDemandConcurrencyPct={cpuDemandConcurrencyPct} onCpuDemandConcurrencyChange={setCpuDemandConcurrencyPct} />
      <CardContent className="space-y-6 pt-5"><FillUpWorkloadProfileEditor profiles={profiles} onChange={setProfiles} cpuDemandConcurrencyPct={cpuDemandConcurrencyPct} /><FillUpObservedVmProfileTable rows={observedProfiles} onAdopt={adoptObservedProfile} /></CardContent>
    </Card>
    {planning.isError && <Alert variant="destructive"><AlertDescription><p className="font-medium">Fill-Up-Auswertung fehlgeschlagen</p><p className="mt-1 break-words">{formatPlanningError(planning.error)}</p></AlertDescription></Alert>}
    {planning.isCalculating && <Alert><AlertDescription>Fill-Up-Auswertung läuft im Hintergrund. Die Zeitreihen und Ausfallszenarien werden lokal im Browser berechnet; die Seite bleibt dabei bedienbar.</AlertDescription></Alert>}
    <VropsDataQualityCard importMeta={planning.selectedImport} quality={quality} />
    {planning.selectedImport && !planning.isLoading && planning.results.length === 0 && <Alert><AlertDescription>Der Import enthält im aktuellen RVTools-Stand keine eindeutig verknüpften Cluster. Prüfe den Datenqualitätsbericht oder importiere den passenden Snapshot erneut.</AlertDescription></Alert>}
    <Card><CardHeader className="pb-3"><InfoTooltip entry={FILL_UP_UI.clusterComparison} side="right"><CardTitle className="w-fit cursor-help text-base">Clustervergleich</CardTitle></InfoTooltip></CardHeader><CardContent><FillUpClusterTable rows={planning.results} onSelect={(row) => setSelectedClusterKey(row.cluster.clusterKey)} /></CardContent></Card>
    <FillUpClusterDetails result={selectedResult} cpuDemandConcurrencyPct={cpuDemandConcurrencyPct} />
    <FillUpRunHistory importMeta={planning.selectedImport} results={planning.results} profiles={profiles} workloadMix={mix ?? null} includeN2={includeN2} cpuDemandConcurrencyPct={cpuDemandConcurrencyPct} />
  </div>;
}
