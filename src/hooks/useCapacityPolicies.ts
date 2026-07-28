import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCapacityPolicies,
  getCapacityPolicyAssignments,
  putCapacityPolicy,
  putCapacityPolicyAssignment,
} from "@/data/db";
import { mergeInitialAndStoredCapacityPolicies } from "@/domain/services/capacityPolicyService";
import type { CapacityPolicy, ClusterCapacityPolicyAssignment } from "@/domain/models/types";

const CAPACITY_POLICY_QUERY_KEY = ["capacityPolicies"] as const;
const CAPACITY_ASSIGNMENTS_QUERY_KEY = ["capacityPolicyAssignments"] as const;

export function useCapacityPolicies() {
  const queryClient = useQueryClient();
  const policiesQuery = useQuery({ queryKey: CAPACITY_POLICY_QUERY_KEY, queryFn: getCapacityPolicies });
  const assignmentsQuery = useQuery({ queryKey: CAPACITY_ASSIGNMENTS_QUERY_KEY, queryFn: getCapacityPolicyAssignments });
  const invalidate = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: CAPACITY_POLICY_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: CAPACITY_ASSIGNMENTS_QUERY_KEY }),
  ]);
  const savePolicy = useMutation({ mutationFn: (policy: CapacityPolicy) => putCapacityPolicy(policy), onSuccess: invalidate });
  const saveAssignment = useMutation({ mutationFn: (assignment: ClusterCapacityPolicyAssignment) => putCapacityPolicyAssignment(assignment), onSuccess: invalidate });
  const policies = useMemo(() => mergeInitialAndStoredCapacityPolicies(policiesQuery.data ?? []), [policiesQuery.data]);

  return {
    policies,
    assignments: assignmentsQuery.data ?? [],
    isLoading: policiesQuery.isLoading || assignmentsQuery.isLoading,
    isError: policiesQuery.isError || assignmentsQuery.isError,
    error: policiesQuery.error ?? assignmentsQuery.error ?? null,
    savePolicy: savePolicy.mutateAsync,
    saveAssignment: saveAssignment.mutateAsync,
    isSaving: savePolicy.isPending || saveAssignment.isPending,
  };
}
