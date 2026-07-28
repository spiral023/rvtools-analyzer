import { useState } from "react";
import { ClusterPlanningPanel } from "@/components/cluster/ClusterPlanningPanel";
import { GlobalFilterScopeHint } from "@/components/global-filter/GlobalFilterScopeHint";
import { PageHeader } from "@/components/layout/PageHeader";
import { FillUpPlanningPanel } from "@/components/planning/fill-up/FillUpPlanningPanel";
import { PolicyManagementPanel } from "@/components/planning/policies/PolicyManagementPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Planning() {
  const [tab, setTab] = useState("what-if");

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Planung" />
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList aria-label="Planungsbereich">
          <TabsTrigger value="what-if">What-if</TabsTrigger>
          <TabsTrigger value="fill-up">Fill up</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
        </TabsList>
        <TabsContent value="what-if" className="space-y-6">
          <GlobalFilterScopeHint text="Die globale Einschränkung wird bei der VM-Auswahl berücksichtigt; gespeicherte Szenarien bleiben für spätere Vergleiche erhalten." />
          <ClusterPlanningPanel />
        </TabsContent>
        <TabsContent value="fill-up" className="space-y-6">
          <GlobalFilterScopeHint text="Fill Up verwendet den gewählten, beim vROps-Import eingefrorenen RVTools-Snapshot. Globale Filter verändern die historische Berechnungsbasis nicht." />
          <FillUpPlanningPanel />
        </TabsContent>
        <TabsContent value="policies" className="space-y-6">
          <GlobalFilterScopeHint text="Die Clusterliste folgt dem aktiven Snapshot; globale Filter verändern die Policy-Zuweisung nicht." />
          <PolicyManagementPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
