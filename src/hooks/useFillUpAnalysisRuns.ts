import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteFillUpAnalysisRun, getFillUpAnalysisRuns, putFillUpAnalysisRun } from "@/data/db";
import type { FillUpAnalysisRun } from "@/domain/models/types";
const KEY = ["fillUpAnalysisRuns"] as const;
export function useFillUpAnalysisRuns() { const client = useQuery({ queryKey: KEY, queryFn: getFillUpAnalysisRuns }); const queryClient = useQueryClient(); const refresh = () => queryClient.invalidateQueries({ queryKey: KEY }); const save = useMutation({ mutationFn: (run: FillUpAnalysisRun) => putFillUpAnalysisRun(run), onSuccess: refresh }); const remove = useMutation({ mutationFn: deleteFillUpAnalysisRun, onSuccess: refresh }); return { runs: client.data ?? [], isLoading: client.isLoading, save: save.mutateAsync, remove: remove.mutateAsync, isSaving: save.isPending || remove.isPending }; }
