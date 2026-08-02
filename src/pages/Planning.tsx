import { useSearchParams } from "react-router-dom";
import { ClusterPlanningPanel } from "@/components/cluster/ClusterPlanningPanel";
import { GlobalFilterScopeHint } from "@/components/global-filter/GlobalFilterScopeHint";
import { PageHeader } from "@/components/layout/PageHeader";
import { FillUpPlanningPanel } from "@/components/planning/fill-up/FillUpPlanningPanel";
import { PolicyManagementPanel } from "@/components/planning/policies/PolicyManagementPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type PlanningTab = "what-if" | "fill-up" | "policies";

function isPlanningTab(value: string | null): value is PlanningTab {
  return value === "what-if" || value === "fill-up" || value === "policies";
}

export default function Planning() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTab = searchParams.get("tab");
  const activeTab: PlanningTab = isPlanningTab(queryTab) ? queryTab : "what-if";
  const handleTabChange = (value: string) => {
    if (!isPlanningTab(value)) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value === "what-if") next.delete("tab");
      else next.set("tab", value);
      return next;
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Planung" />
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
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
