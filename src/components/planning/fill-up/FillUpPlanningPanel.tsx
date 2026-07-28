import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FillUpClusterDetails } from "@/components/planning/fill-up/FillUpClusterDetails";
import { FillUpClusterTable } from "@/components/planning/fill-up/FillUpClusterTable";
import { FillUpInputControls } from "@/components/planning/fill-up/FillUpInputControls";
import { FillUpWorkloadProfileEditor } from "@/components/planning/fill-up/FillUpWorkloadProfileEditor";
import { VropsDataQualityCard } from "@/components/planning/fill-up/VropsDataQualityCard";
import { FillUpRunHistory } from "@/components/planning/fill-up/FillUpRunHistory";
import { useFillUpPlanning } from "@/hooks/useFillUpPlanning";
import type { FillUpPlanningClusterResult } from "@/domain/services/fillUpPlanningService";
import type { FillUpWorkloadProfile } from "@/domain/models/types";

const INITIAL_PROFILES: FillUpWorkloadProfile[] = [
  { id: "high-standard", name: "HIGH Standard", workloadClass: "high", vcpu: 2, memoryMiB: 8_192, cpuDemandP95MHz: 500 },
  { id: "std-standard", name: "STD Standard", workloadClass: "std", vcpu: 2, memoryMiB: 8_192, cpuDemandP95MHz: 350 },
];

export function FillUpPlanningPanel() {
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<FillUpWorkloadProfile[]>(INITIAL_PROFILES);
  const [highSharePct, setHighSharePct] = useState(50);
  const [includeN2, setIncludeN2] = useState(false);
  const [selectedClusterKey, setSelectedClusterKey] = useState<string | null>(null);
  const highProfile = profiles.find((profile) => profile.workloadClass === "high");
  const stdProfile = profiles.find((profile) => profile.workloadClass === "std");
  const mix = highProfile && stdProfile ? { highProfileId: highProfile.id, stdProfileId: stdProfile.id, highSharePct } : undefined;
  const planning = useFillUpPlanning(selectedImportId, profiles, mix, includeN2);

  useEffect(() => {
    if (!selectedImportId && planning.imports[0]) setSelectedImportId(planning.imports[0].id);
  }, [planning.imports, selectedImportId]);
  useEffect(() => {
    if (selectedClusterKey && planning.results.some((row) => row.cluster.clusterKey === selectedClusterKey)) return;
    setSelectedClusterKey(planning.results[0]?.cluster.clusterKey ?? null);
  }, [planning.results, selectedClusterKey]);

  const selectedResult = useMemo<FillUpPlanningClusterResult | null>(() => planning.results.find((row) => row.cluster.clusterKey === selectedClusterKey) ?? null, [planning.results, selectedClusterKey]);
  const quality = planning.results[0]?.quality ?? null;
  return <div className="space-y-6">
    <Card className="overflow-hidden border-t-4 border-t-primary shadow-sm">
      <CardHeader className="pb-3"><CardTitle>Fill-Up-Kapazität</CardTitle><p className="text-sm text-muted-foreground">Historische vROps-Zeitreihen werden gegen eingefrorene RVTools-Beziehungen, die aktive Policy und einen expliziten P95-Workload gerechnet. CPU- und RAM-Headrooms bleiben unabhängig ausgewiesen.</p></CardHeader>
      <FillUpInputControls imports={planning.imports} selectedImportId={selectedImportId} onImportChange={setSelectedImportId} includeN2={includeN2} onIncludeN2Change={setIncludeN2} highSharePct={highSharePct} onHighShareChange={setHighSharePct} />
      <CardContent className="space-y-6 pt-5"><FillUpWorkloadProfileEditor profiles={profiles} onChange={setProfiles} /></CardContent>
    </Card>
    {planning.isError && <Alert variant="destructive"><AlertDescription>{planning.error instanceof Error ? planning.error.message : "Fill-Up-Daten konnten nicht geladen werden."}</AlertDescription></Alert>}
    <VropsDataQualityCard importMeta={planning.selectedImport} quality={quality} />
    {planning.selectedImport && !planning.isLoading && planning.results.length === 0 && <Alert><AlertDescription>Der Import enthält im aktuellen RVTools-Stand keine eindeutig verknüpften Cluster. Prüfe den Datenqualitätsbericht oder importiere den passenden Snapshot erneut.</AlertDescription></Alert>}
    <Card><CardHeader className="pb-3"><CardTitle className="text-base">Clustervergleich</CardTitle></CardHeader><CardContent><FillUpClusterTable rows={planning.results} onSelect={(row) => setSelectedClusterKey(row.cluster.clusterKey)} /></CardContent></Card>
    <FillUpClusterDetails result={selectedResult} />
    <FillUpRunHistory importMeta={planning.selectedImport} results={planning.results} profiles={profiles} workloadMix={mix ?? null} includeN2={includeN2} />
  </div>;
}
