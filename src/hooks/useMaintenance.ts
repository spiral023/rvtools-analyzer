import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getMaintenanceAssignments,
  getMaintenanceAssignmentsByVcenterIds,
  getMaintenanceSettings,
  putMaintenanceAssignment,
  putMaintenanceSettings,
} from "@/data/db";
import { DEFAULT_MAINTENANCE_SETTINGS } from "@/lib/maintenance";
import type { MaintenanceClusterAssignment, MaintenanceSettings } from "@/domain/models/types";

const STALE_MS = 5 * 60 * 1000;

export function useMaintenanceSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["maintenanceSettings"],
    queryFn: async () => (await getMaintenanceSettings()) ?? DEFAULT_MAINTENANCE_SETTINGS,
    staleTime: STALE_MS,
  });

  const mutation = useMutation({
    mutationFn: (settings: MaintenanceSettings) => putMaintenanceSettings(settings),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["maintenanceSettings"] });
    },
  });

  return {
    settings: query.data ?? DEFAULT_MAINTENANCE_SETTINGS,
    isLoading: query.isLoading,
    saveSettings: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}

export function useMaintenanceAssignments(vcenterIds?: string[]) {
  const queryClient = useQueryClient();
  const normalizedVcenterIds = [...new Set((vcenterIds ?? []).filter(Boolean))].sort();
  const query = useQuery({
    queryKey: ["maintenanceAssignments", normalizedVcenterIds],
    queryFn: () =>
      normalizedVcenterIds.length > 0
        ? getMaintenanceAssignmentsByVcenterIds(normalizedVcenterIds)
        : getMaintenanceAssignments(),
    staleTime: STALE_MS,
  });

  const mutation = useMutation({
    mutationFn: (assignment: MaintenanceClusterAssignment) => putMaintenanceAssignment(assignment),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["maintenanceAssignments"] });
    },
  });

  return {
    assignments: query.data ?? [],
    isLoading: query.isLoading,
    saveAssignment: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}
