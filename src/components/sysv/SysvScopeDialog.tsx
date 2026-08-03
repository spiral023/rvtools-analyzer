import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SysvScopeTree } from "@/components/sysv/SysvScopeTree";
import type { SysvScopePreference } from "@/domain/models/types";
import { useAppMode } from "@/hooks/useAppMode";
import { useAllTechInfoLatest } from "@/hooks/useActiveSnapshots";
import { useFilterState } from "@/hooks/useFilterState";
import {
  buildSysvScopeDirectory,
  buildSysvScopeGlobalFilter,
  getAvailableSysvScopePreference,
} from "@/lib/sysvScope";

export function SysvScopeDialog() {
  const navigate = useNavigate();
  const {
    lastSysvScope,
    sysvScopeDialogOpen,
    closeSysvScopeDialog,
    saveLastSysvScope,
  } = useAppMode();
  const { setFilters } = useFilterState();
  const { data: techInfoRows = [], isPending } = useAllTechInfoLatest(sysvScopeDialogOpen);
  const directory = useMemo(() => buildSysvScopeDirectory(techInfoRows), [techInfoRows]);
  const [selection, setSelection] = useState<SysvScopePreference>({ kind: "all" });
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    if (!sysvScopeDialogOpen) return;
    setSelection(getAvailableSysvScopePreference(directory, lastSysvScope));
  }, [directory, lastSysvScope, sysvScopeDialogOpen]);

  const applySelection = async (scope: SysvScopePreference) => {
    setIsApplying(true);
    try {
      setFilters({ globalFilter: buildSysvScopeGlobalFilter(scope) });
      await saveLastSysvScope(scope);
      closeSysvScopeDialog();
      toast.success(scope.kind === "all" ? "Alle Systeme bleiben sichtbar." : "Persönlicher Systemkontext wurde übernommen.");
      navigate("/", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Der persönliche Systemkontext konnte nicht gespeichert werden.");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog
      open={sysvScopeDialogOpen}
      onOpenChange={(open) => {
        if (!open) void applySelection({ kind: "all" });
      }}
    >
      <DialogContent className="max-w-2xl gap-5" aria-describedby="sysv-scope-dialog-description">
        <DialogHeader className="pr-8">
          <div className="mb-1 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </div>
          <DialogTitle>Persönlichen Systemkontext wählen</DialogTitle>
          <DialogDescription id="sysv-scope-dialog-description">
            Die Auswahl ist optional. Sie erzeugt einen normalen globalen Filter, den du später im Filterdialog ändern oder vollständig entfernen kannst.
          </DialogDescription>
        </DialogHeader>

        {isPending ? (
          <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">Tech-Info-Zuordnungen werden geladen …</div>
        ) : (
          <SysvScopeTree directory={directory} value={selection} onChange={setSelection} />
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => void applySelection({ kind: "all" })} disabled={isApplying}>
            Überspringen
          </Button>
          <Button type="button" onClick={() => void applySelection(selection)} disabled={isApplying || isPending}>
            Übernehmen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
