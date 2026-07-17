import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteMaintenanceWindow,
  getMaintenanceWindows,
  putMaintenanceWindow,
  upsertMaintenanceWindows,
} from "@/data/db";
import type { MaintenanceWindowDefinition } from "@/domain/models/types";

const MAINTENANCE_WINDOWS_QUERY_KEY = ["maintenanceWindows"] as const;

export function useMaintenanceWindows() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: MAINTENANCE_WINDOWS_QUERY_KEY,
    queryFn: getMaintenanceWindows,
  });

  const saveMutation = useMutation({
    mutationFn: (definition: MaintenanceWindowDefinition) => putMaintenanceWindow(definition),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MAINTENANCE_WINDOWS_QUERY_KEY }),
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteMaintenanceWindow(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MAINTENANCE_WINDOWS_QUERY_KEY }),
  });
  const upsertMutation = useMutation({
    mutationFn: (definitions: MaintenanceWindowDefinition[]) => upsertMaintenanceWindows(definitions),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MAINTENANCE_WINDOWS_QUERY_KEY }),
  });

  return {
    definitions: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ?? saveMutation.error ?? removeMutation.error ?? upsertMutation.error,
    isMutating: saveMutation.isPending || removeMutation.isPending || upsertMutation.isPending,
    save: saveMutation.mutateAsync,
    remove: removeMutation.mutateAsync,
    upsert: upsertMutation.mutateAsync,
  };
}
