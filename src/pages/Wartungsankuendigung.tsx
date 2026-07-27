import { ClusterMaintenancePanel } from "@/components/cluster/ClusterMaintenancePanel";
import { GlobalFilterScopeHint } from "@/components/global-filter/GlobalFilterScopeHint";
import { PageHeader } from "@/components/layout/PageHeader";

export default function Wartungsankuendigung() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Wartung" />
      <GlobalFilterScopeHint text="Die globale Einschränkung gilt für die Cluster-Zuweisungen, Verantwortlichen und Wartungsfenster dieser Ansicht." />
      <ClusterMaintenancePanel />
    </div>
  );
}
