import { Badge } from "@/components/ui/badge";
import { useFilterState } from "@/hooks/useFilterState";
import { hasGlobalFilterDefinition } from "@/lib/globalFilter";
import { parseVmNameScopeList } from "@/lib/vmScope";

export function GlobalFilterScopeHint({ text }: { text: string }) {
  const { filters } = useFilterState();

  if (!hasGlobalFilterDefinition(filters.globalFilter) && parseVmNameScopeList(filters.vmNameList).length === 0) return null;

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <Badge variant="outline">Globaler Filter aktiv</Badge>
        <span>{text}</span>
      </div>
    </div>
  );
}
