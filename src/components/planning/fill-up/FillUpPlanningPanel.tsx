import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { FillUpClusterDetails } from "@/components/planning/fill-up/FillUpClusterDetails";
import { FillUpClusterTable } from "@/components/planning/fill-up/FillUpClusterTable";
import { FillUpInputControls } from "@/components/planning/fill-up/FillUpInputControls";
import { FillUpWorkloadProfileEditor } from "@/components/planning/fill-up/FillUpWorkloadProfileEditor";
import { FillUpObservedVmProfileTable } from "@/components/planning/fill-up/FillUpObservedVmProfileTable";
import { VropsDataQualityCard } from "@/components/planning/fill-up/VropsDataQualityCard";
import { FillUpRunHistory } from "@/components/planning/fill-up/FillUpRunHistory";
import { useFillUpPlanning } from "@/hooks/useFillUpPlanning";
import type { FillUpPlanningClusterResult } from "@/domain/services/fillUpPlanningService";
import { DEFAULT_CPU_DEMAND_CONCURRENCY_PCT } from "@/domain/services/fillUpRecommendationEngine";
import type { FillUpObservedVmProfile, FillUpWorkloadProfile } from "@/domain/models/types";
import { FILL_UP_UI } from "@/lib/glossaries/planning";
import { toast } from "sonner";

const INITIAL_PROFILES: FillUpWorkloadProfile[] = [
  { id: "high-standard", name: "HIGH Standard", workloadClass: "high", vcpu: 2, memoryMiB: 8_192, cpuDemandP95MHz: 500, cpuDemandAverageMHz: 250 },
  { id: "std-standard", name: "STD Standard", workloadClass: "std", vcpu: 2, memoryMiB: 8_192, cpuDemandP95MHz: 350, cpuDemandAverageMHz: 175 },
];

/** Kein Präzisionsverlust beim Übernehmen, aber auch keine sinnlos langen Beobachtungsnachkommastellen. */
function roundAdoptedValue(value: number): number {
  return Math.max(0.01, Math.round(value * 100) / 100);
}

function formatPlanningError(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Die Fill-Up-Auswertung ist ohne verwertbaren Browserfehler abgebrochen. Bitte den Import erneut öffnen; bei erneutem Auftreten diese Meldung weitergeben.";
}

export function FillUpPlanningPanel() {
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<FillUpWorkloadProfile[]>(INITIAL_PROFILES);
  const [highSharePct, setHighSharePct] = useState(50);
  const [cpuDemandConcurrencyPct, setCpuDemandConcurrencyPct] = useState(DEFAULT_CPU_DEMAND_CONCURRENCY_PCT);
  const [includeN2, setIncludeN2] = useState(false);
  const [selectedClusterKey, setSelectedClusterKey] = useState<string | null>(null);
  const highProfile = profiles.find((profile) => profile.workloadClass === "high");
  const stdProfile = profiles.find((profile) => profile.workloadClass === "std");
  const mix = highProfile && stdProfile ? { highProfileId: highProfile.id, stdProfileId: stdProfile.id, highSharePct } : undefined;
  const planning = useFillUpPlanning(selectedImportId, profiles, mix, includeN2, cpuDemandConcurrencyPct);
  const effectiveImportId = selectedImportId ?? planning.selectedImport?.id ?? null;

  useEffect(() => {
    if (selectedClusterKey && planning.results.some((row) => row.cluster.clusterKey === selectedClusterKey)) return;
    setSelectedClusterKey(planning.results[0]?.cluster.clusterKey ?? null);
  }, [planning.results, selectedClusterKey]);

  const selectedResult = useMemo<FillUpPlanningClusterResult | null>(() => planning.results.find((row) => row.cluster.clusterKey === selectedClusterKey) ?? null, [planning.results, selectedClusterKey]);
  const observedProfiles = useMemo(() => planning.results.flatMap((row) => row.observedVmProfiles), [planning.results]);
  const quality = planning.results[0]?.quality ?? null;
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
