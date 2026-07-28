import { useEffect, useMemo, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { CapacityPolicyEditor } from "@/components/planning/fill-up/CapacityPolicyEditor";
import { PolicyCatalogList } from "@/components/planning/policies/PolicyCatalogList";
import { PolicyClusterAssignmentTable } from "@/components/planning/policies/PolicyClusterAssignmentTable";
import { useClusters } from "@/hooks/useActiveSnapshots";
import { useCapacityPolicies } from "@/hooks/useCapacityPolicies";
import { createCustomCapacityPolicy, duplicateCapacityPolicy, isBuiltInCapacityPolicy } from "@/domain/services/capacityPolicyService";
import type { CapacityPolicy } from "@/domain/models/types";
import { FILL_UP_POLICY_KPI } from "@/lib/glossaries/planning";

export function PolicyManagementPanel() {
  const { data: clusters = [] } = useClusters();
  const { policies, assignments, isLoading, isSaving, savePolicy, deletePolicy } = useCapacityPolicies();
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedPolicyId && policies[0]) setSelectedPolicyId(policies[0].id);
  }, [policies, selectedPolicyId]);

  const selectedPolicy = useMemo(
    () => policies.find((policy) => policy.id === selectedPolicyId) ?? policies[0] ?? null,
    [policies, selectedPolicyId],
  );
  const customPolicyCount = useMemo(() => policies.filter((policy) => !isBuiltInCapacityPolicy(policy)).length, [policies]);
  const unassignedClusterCount = useMemo(
    () => clusters.filter((cluster) => !assignments.some((assignment) => assignment.vcenterId === cluster.vcenterId && assignment.clusterKey === cluster.clusterKey)).length,
    [clusters, assignments],
  );
  const isAssigned = (policy: CapacityPolicy) => assignments.some((assignment) => assignment.policyId === policy.id);

  const handleSaveVersion = async (next: CapacityPolicy) => {
    try {
      await savePolicy(next);
      toast.success("Neue Policy-Version gespeichert.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Policy konnte nicht gespeichert werden.");
    }
  };

  const handleCreate = async (name: string) => {
    const policy = createCustomCapacityPolicy(name);
    try {
      await savePolicy(policy);
      setSelectedPolicyId(policy.id);
      toast.success("Policy angelegt.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Policy konnte nicht angelegt werden.");
    }
  };

  const handleDuplicate = async (policy: CapacityPolicy, name: string) => {
    const copy = duplicateCapacityPolicy(policy, name);
    try {
      await savePolicy(copy);
      setSelectedPolicyId(copy.id);
      toast.success("Policy dupliziert.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Policy konnte nicht dupliziert werden.");
    }
  };

  const handleDelete = async (policy: CapacityPolicy) => {
    try {
      await deletePolicy(policy.id);
      if (selectedPolicyId === policy.id) setSelectedPolicyId(null);
      toast.success("Policy gelöscht.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Policy konnte nicht gelöscht werden.");
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Kapazitätsrichtlinien werden geladen …</p>;

  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard title="Policies gesamt" value={policies.length} subtitle={`davon ${customPolicyCount} eigene`} icon={<ShieldCheck className="h-4 w-4" />} info={FILL_UP_POLICY_KPI.totalPolicies} />
        <KpiCard title="Cluster ohne explizite Zuweisung" value={unassignedClusterCount} icon={<ShieldAlert className="h-4 w-4" />} severity={unassignedClusterCount > 0 ? "warn" : "ok"} info={FILL_UP_POLICY_KPI.unassignedClusters} />
      </KpiGrid>

      <PolicyClusterAssignmentTable />

      <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)] xl:items-start">
        <PolicyCatalogList
          policies={policies}
          selectedPolicy={selectedPolicy}
          onSelect={setSelectedPolicyId}
          onCreate={handleCreate}
          onDuplicate={handleDuplicate}
          onDelete={(policy) => { void handleDelete(policy); }}
          isBuiltIn={isBuiltInCapacityPolicy}
          isAssigned={isAssigned}
          isSaving={isSaving}
        />
        {selectedPolicy && (
          <CapacityPolicyEditor policy={selectedPolicy} onSaveVersion={handleSaveVersion} isSaving={isSaving} />
        )}
      </div>
    </div>
  );
}
