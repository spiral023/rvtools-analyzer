import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteVcenterGroup, getVcenterGroups, putVcenterGroup } from "@/data/db";
import type { VCenterGroup } from "@/domain/models/types";

export const VCENTER_GROUPS_QUERY_KEY = ["vcenterGroups"] as const;

export function useVcenterGroups() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: VCENTER_GROUPS_QUERY_KEY });

  const groups = useQuery({ queryKey: VCENTER_GROUPS_QUERY_KEY, queryFn: getVcenterGroups });
  const save = useMutation({ mutationFn: (group: VCenterGroup) => putVcenterGroup(group), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => deleteVcenterGroup(id), onSuccess: invalidate });

  return {
    groups: groups.data ?? [],
    isLoading: groups.isLoading,
    saveGroup: save.mutateAsync,
    deleteGroup: remove.mutateAsync,
  };
}
