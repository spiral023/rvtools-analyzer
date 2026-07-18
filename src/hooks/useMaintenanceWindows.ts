import { useCallback, useState } from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteMaintenanceWindow,
  getMaintenanceWindows,
  putMaintenanceWindow,
  upsertMaintenanceWindows,
} from "@/data/db";
import type { MaintenanceWindowDefinition } from "@/domain/models/types";

const MAINTENANCE_WINDOWS_QUERY_KEY = ["maintenanceWindows"] as const;
const MAINTENANCE_WINDOWS_MUTATION_KEY = ["maintenanceWindows", "mutation"] as const;

export function useMaintenanceWindows() {
  const queryClient = useQueryClient();
  const [lastMutationError, setLastMutationError] = useState<Error | null>(null);
  const query = useQuery({
    queryKey: MAINTENANCE_WINDOWS_QUERY_KEY,
    queryFn: getMaintenanceWindows,
  });

  const { mutateAsync: saveMutationAsync } = useMutation({
    mutationKey: MAINTENANCE_WINDOWS_MUTATION_KEY,
    mutationFn: (definition: MaintenanceWindowDefinition) => putMaintenanceWindow(definition),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MAINTENANCE_WINDOWS_QUERY_KEY }),
  });
  const { mutateAsync: removeMutationAsync } = useMutation({
    mutationKey: MAINTENANCE_WINDOWS_MUTATION_KEY,
    mutationFn: (id: string) => deleteMaintenanceWindow(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MAINTENANCE_WINDOWS_QUERY_KEY }),
  });
  const { mutateAsync: upsertMutationAsync } = useMutation({
    mutationKey: MAINTENANCE_WINDOWS_MUTATION_KEY,
    mutationFn: (definitions: MaintenanceWindowDefinition[]) => upsertMaintenanceWindows(definitions),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MAINTENANCE_WINDOWS_QUERY_KEY }),
  });
  const isMutating = useIsMutating({ mutationKey: MAINTENANCE_WINDOWS_MUTATION_KEY }) > 0;

  const runMutation = useCallback(async <T,>(mutation: () => Promise<T>) => {
    setLastMutationError(null);
    try {
      return await mutation();
    } catch (error) {
      setLastMutationError(error instanceof Error ? error : new Error("Mutation fehlgeschlagen."));
      throw error;
    }
  }, []);

  const save = useCallback(
    (definition: MaintenanceWindowDefinition) => runMutation(() => saveMutationAsync(definition)),
    [runMutation, saveMutationAsync],
  );
  const remove = useCallback(
    (id: string) => runMutation(() => removeMutationAsync(id)),
    [removeMutationAsync, runMutation],
  );
  const upsert = useCallback(
    (definitions: MaintenanceWindowDefinition[]) => runMutation(() => upsertMutationAsync(definitions)),
    [runMutation, upsertMutationAsync],
  );

  return {
    definitions: query.data ?? [],
    isLoading: query.isLoading,
    error: lastMutationError ?? query.error ?? null,
    isMutating,
    save,
    remove,
    upsert,
  };
}
