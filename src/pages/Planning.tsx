import { ClusterPlanningPanel } from "@/components/cluster/ClusterPlanningPanel";
import { GlobalFilterScopeHint } from "@/components/global-filter/GlobalFilterScopeHint";
import { PageHeader } from "@/components/layout/PageHeader";

export default function Planning() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Planung" />
      <GlobalFilterScopeHint text="Die globale Einschränkung wird bei der VM-Auswahl berücksichtigt; gespeicherte Szenarien bleiben für spätere Vergleiche erhalten." />
      <ClusterPlanningPanel />
    </div>
  );
}
