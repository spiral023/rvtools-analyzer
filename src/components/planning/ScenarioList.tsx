import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Trash2, FileText, Plus } from "lucide-react";
import type { Scenario } from "@/domain/models/types";

export function ScenarioList({
  scenarios,
  activeId,
  onSelect,
  onCreate,
  onDelete,
}: {
  scenarios: Scenario[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Szenarien</h2>
        <Button size="sm" variant="outline" onClick={onCreate}>
          <Plus className="h-4 w-4" />
          Neu
        </Button>
      </div>
      {scenarios.length === 0 ? (
        <Card className="p-4 text-center text-sm text-muted-foreground">
          Noch keine Szenarien vorhanden. Klicken Sie auf „Neu", um ein Szenario zu erstellen.
        </Card>
      ) : (
        <div className="space-y-1.5">
          {scenarios.map((s) => {
            const totalVms = s.groups.reduce((sum, g) => sum + g.vmKeys.length, 0);
            return (
              <Card
                key={s.id}
                className={`flex items-center justify-between gap-3 p-3 cursor-pointer transition-colors hover:bg-muted/30 ${
                  activeId === s.id ? "border-primary bg-primary/5" : ""
                }`}
                onClick={() => onSelect(s.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.groups.length} Gruppe(n) · {totalVms} VM(s)
                    </p>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(s.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
