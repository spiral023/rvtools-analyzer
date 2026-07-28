import { ClusterPlanningPanel } from "@/components/cluster/ClusterPlanningPanel";
import { GlobalFilterScopeHint } from "@/components/global-filter/GlobalFilterScopeHint";
import { PageHeader } from "@/components/layout/PageHeader";
import { CapacityPolicyEditor } from "@/components/planning/fill-up/CapacityPolicyEditor";
import { FillUpPlanningPanel } from "@/components/planning/fill-up/FillUpPlanningPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Planning() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Planung" />
      <Tabs defaultValue="what-if" className="space-y-4">
        <TabsList aria-label="Planungsbereich">
          <TabsTrigger value="what-if">What-if</TabsTrigger>
          <TabsTrigger value="fill-up">Fill up</TabsTrigger>
        </TabsList>
        <TabsContent value="what-if" className="space-y-6">
          <GlobalFilterScopeHint text="Die globale Einschränkung wird bei der VM-Auswahl berücksichtigt; gespeicherte Szenarien bleiben für spätere Vergleiche erhalten." />
          <ClusterPlanningPanel />
        </TabsContent>
        <TabsContent value="fill-up" className="space-y-6">
          <GlobalFilterScopeHint text="Fill Up verwendet den gewählten, beim vROps-Import eingefrorenen RVTools-Snapshot. Globale Filter verändern die historische Berechnungsbasis nicht." />
          <FillUpPlanningPanel />
          <CapacityPolicyEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
}
