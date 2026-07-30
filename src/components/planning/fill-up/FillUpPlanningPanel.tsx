import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Calculator, CircleCheck, Layers3, Loader2, PlusSquare, Server } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { readPreloadedFillUpWorkloadProfiles, useFillUpPlanning } from "@/hooks/useFillUpPlanning";
import {
  DEFAULT_FILL_UP_HIGH_SHARE_PCT,
  DEFAULT_FILL_UP_WORKLOAD_PROFILES,
  seedFillUpWorkloadProfilesWithGlobalAverages,
  type FillUpPlanningClusterResult,
} from "@/domain/services/fillUpPlanningService";
import { DEFAULT_UI_CPU_DEMAND_CONCURRENCY_PCT } from "@/domain/services/fillUpRecommendationEngine";
import type { FillUpObservedVmProfile, FillUpWorkloadProfile } from "@/domain/models/types";
import { FILL_UP_KPI, FILL_UP_UI } from "@/lib/glossaries/planning";
import { toast } from "sonner";

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
  const queryClient = useQueryClient();
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  // Schon im ersten Render mit den vorberechneten HIGH/STD-Durchschnitten starten, sofern vorhanden:
  // Nur dann trifft die erste Berechnungsanfrage den vorab hinterlegten Query-Key und die Auswertung
  // erscheint ohne Wartezeit. Ohne Vorladen bleibt der Standard, den der Effekt unten nachzieht.
  const [preloadedProfiles] = useState(() => readPreloadedFillUpWorkloadProfiles(queryClient));
  const [profiles, setProfiles] = useState<FillUpWorkloadProfile[]>(() => [...(preloadedProfiles ?? DEFAULT_FILL_UP_WORKLOAD_PROFILES)]);
  const [highSharePct, setHighSharePct] = useState(DEFAULT_FILL_UP_HIGH_SHARE_PCT);
  const [cpuDemandConcurrencyPct, setCpuDemandConcurrencyPct] = useState(DEFAULT_UI_CPU_DEMAND_CONCURRENCY_PCT);
  const [includeN2, setIncludeN2] = useState(false);
  const [selectedClusterKey, setSelectedClusterKey] = useState<string | null>(null);
  const highProfile = profiles.find((profile) => profile.workloadClass === "high");
  const stdProfile = profiles.find((profile) => profile.workloadClass === "std");
  const mix = highProfile && stdProfile ? { highProfileId: highProfile.id, stdProfileId: stdProfile.id, highSharePct } : undefined;
  const planning = useFillUpPlanning(selectedImportId, profiles, mix, includeN2, cpuDemandConcurrencyPct);
  const effectiveImportId = selectedImportId ?? planning.selectedImport?.id ?? null;

  // Standardwerte der typischen zusätzlichen VM einmalig mit dem HIGH-/STD-Durchschnitt über alle
  // eingeschalteten, nicht-vCLS-VMs vorbelegen. Danach nicht mehr überschreiben, damit spätere
  // manuelle Anpassungen erhalten bleiben. Beim Vorladen ist das bereits im ersten Render passiert.
  const defaultsSeededRef = useRef(preloadedProfiles !== null);
  useEffect(() => {
    if (defaultsSeededRef.current) return;
    const seeded = seedFillUpWorkloadProfilesWithGlobalAverages(DEFAULT_FILL_UP_WORKLOAD_PROFILES, planning.globalWorkloadClassProfiles);
    if (!seeded) return;
    defaultsSeededRef.current = true;
    setProfiles((current) => current.map((profile) => seeded.find((entry) => entry.id === profile.id) ?? profile));
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
  const n1ReadyClusterCount = useMemo(() => planning.results.filter((row) => row.capacity.n1?.status === "green").length, [planning.results]);
  const averageAdditionalVms = planning.results.length > 0 ? additionalVmsTotal / planning.results.length : 0;
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
      <KpiCard title="Ø +VM pro Cluster" value={averageAdditionalVms.toLocaleString("de-DE", { maximumFractionDigits: 1 })} icon={<Calculator className="h-4 w-4" />} info={FILL_UP_KPI.averageAdditionalVms} />
      <KpiCard title="N-1 bereit" value={n1ReadyClusterCount.toLocaleString("de-DE")} severity={n1ReadyClusterCount === planning.results.length ? "ok" : "warn"} icon={<CircleCheck className="h-4 w-4" />} info={FILL_UP_KPI.n1ReadyClusters} />
      <KpiCard title="Kritische Cluster" value={criticalClusterCount.toLocaleString("de-DE")} severity={criticalClusterCount > 0 ? "crit" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} info={FILL_UP_KPI.criticalClusters} />
    </KpiGrid>
    <Card className="overflow-hidden border-t-4 border-t-primary shadow-sm">
      <CardHeader className="pb-3"><InfoTooltip entry={FILL_UP_UI.capacity} side="right"><CardTitle className="w-fit cursor-help">Fill-Up-Kapazität</CardTitle></InfoTooltip><p className="text-sm text-muted-foreground">Historische vROps-Zeitreihen werden gegen eingefrorene RVTools-Beziehungen, die aktive Policy und einen expliziten P95-Workload gerechnet. CPU- und RAM-Headrooms bleiben unabhängig ausgewiesen.</p></CardHeader>
      <FillUpInputControls imports={planning.imports} selectedImportId={effectiveImportId} onImportChange={setSelectedImportId} includeN2={includeN2} onIncludeN2Change={setIncludeN2} highSharePct={highSharePct} onHighShareChange={setHighSharePct} cpuDemandConcurrencyPct={cpuDemandConcurrencyPct} onCpuDemandConcurrencyChange={setCpuDemandConcurrencyPct} />
      <CardContent className="space-y-6 pt-5"><FillUpWorkloadProfileEditor profiles={profiles} onChange={setProfiles} cpuDemandConcurrencyPct={cpuDemandConcurrencyPct} /><FillUpObservedVmProfileTable rows={observedProfiles} onAdopt={adoptObservedProfile} /></CardContent>
    </Card>
    {planning.isError && <Alert variant="destructive"><AlertDescription><p className="font-medium">Fill-Up-Auswertung fehlgeschlagen</p><p className="mt-1 break-words">{formatPlanningError(planning.error)}</p></AlertDescription></Alert>}
    {planning.isCalculating && <Alert className="border-warning/45 bg-warning/5" aria-live="polite">
      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-warning" />
      <AlertTitle>Daten werden berechnet …</AlertTitle>
      <AlertDescription>Die geänderten Werte werden lokal im Browser gegen die vROps-Zeitreihen und Ausfallszenarien gerechnet. Bis der Hinweis verschwindet, zeigen Kennzahlen, Clustervergleich und Clusterdetails noch den vorherigen Stand; die Seite bleibt bedienbar.</AlertDescription>
    </Alert>}
    <VropsDataQualityCard importMeta={planning.selectedImport} quality={quality} />
    {planning.selectedImport && !planning.isLoading && planning.results.length === 0 && <Alert><AlertDescription>Der Import enthält im aktuellen RVTools-Stand keine eindeutig verknüpften Cluster. Prüfe den Datenqualitätsbericht oder importiere den passenden Snapshot erneut.</AlertDescription></Alert>}
    <Card><CardHeader className="pb-3"><InfoTooltip entry={FILL_UP_UI.clusterComparison} side="right"><CardTitle className="w-fit cursor-help text-base">Clustervergleich</CardTitle></InfoTooltip></CardHeader><CardContent><FillUpClusterTable rows={planning.results} onSelect={(row) => setSelectedClusterKey(row.cluster.clusterKey)} /></CardContent></Card>
    <FillUpClusterDetails result={selectedResult} cpuDemandConcurrencyPct={cpuDemandConcurrencyPct} />
    <FillUpRunHistory importMeta={planning.selectedImport} results={planning.results} profiles={profiles} workloadMix={mix ?? null} includeN2={includeN2} cpuDemandConcurrencyPct={cpuDemandConcurrencyPct} />
  </div>;
}
