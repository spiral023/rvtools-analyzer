import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteScenario, getScenarios, putScenario } from "@/data/db";
import type { Scenario } from "@/domain/models/types";

const SCENARIOS_KEY = ["scenarios"] as const;

export function useScenarios() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: SCENARIOS_KEY,
    queryFn: getScenarios,
  });

  const saveMutation = useMutation({
    mutationFn: (scenario: Scenario) => putScenario(scenario),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SCENARIOS_KEY }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteScenario(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SCENARIOS_KEY }),
  });

  return {
    scenarios: query.data ?? [],
    isLoading: query.isLoading,
    saveScenario: saveMutation.mutateAsync,
    deleteScenario: deleteMutation.mutateAsync,
  };
}
