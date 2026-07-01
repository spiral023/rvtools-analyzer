import { useSelection } from "@/hooks/useSelection";
import { Button } from "@/components/ui/button";
import { X, CheckSquare } from "lucide-react";

export function SelectionBar({ onAssignToGroup }: { onAssignToGroup: () => void }) {
  const { selectedVmKeys, clear } = useSelection();
  const count = selectedVmKeys.size;

  if (count === 0) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2">
      <div className="flex items-center gap-2 text-sm">
        <CheckSquare className="h-4 w-4 text-primary" />
        <span className="font-medium">{count} VM{count !== 1 ? "s" : ""} ausgewählt</span>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="default" onClick={onAssignToGroup}>
          Ziel-Cluster zuweisen
        </Button>
        <Button size="sm" variant="ghost" onClick={clear}>
          <X className="h-4 w-4" />
          Auswahl aufheben
        </Button>
      </div>
    </div>
  );
}
