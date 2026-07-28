import { useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CapacityPolicy } from "@/domain/models/types";

interface PolicyCatalogListProps {
  policies: readonly CapacityPolicy[];
  selectedPolicy: CapacityPolicy | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  onDuplicate: (policy: CapacityPolicy, name: string) => Promise<void>;
  onDelete: (policy: CapacityPolicy) => void;
  isBuiltIn: (policy: CapacityPolicy) => boolean;
  isAssigned: (policy: CapacityPolicy) => boolean;
  isSaving: boolean;
}

export function PolicyCatalogList({
  policies, selectedPolicy, onSelect, onCreate, onDuplicate, onDelete, isBuiltIn, isAssigned, isSaving,
}: PolicyCatalogListProps) {
  const [nameDialog, setNameDialog] = useState<{ mode: "create" | "duplicate"; name: string } | null>(null);

  const builtIn = selectedPolicy ? isBuiltIn(selectedPolicy) : false;
  const assigned = selectedPolicy ? isAssigned(selectedPolicy) : false;
  const deleteDisabledReason = !selectedPolicy
    ? undefined
    : builtIn
      ? "Standardprofile können nicht gelöscht werden."
      : assigned
        ? "Diese Policy ist noch mindestens einem Cluster zugewiesen."
        : undefined;

  const submitNameDialog = async () => {
    if (!nameDialog) return;
    const name = nameDialog.name.trim();
    if (!name) return;
    if (nameDialog.mode === "create") await onCreate(name);
    else if (selectedPolicy) await onDuplicate(selectedPolicy, name);
    setNameDialog(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Policy-Katalog</h3>
        <Button size="sm" variant="outline" onClick={() => setNameDialog({ mode: "create", name: "" })}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />Neu
        </Button>
      </div>
      <div className="max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
        {policies.map((policy) => {
          const active = selectedPolicy?.id === policy.id;
          return (
            <button
              key={policy.id}
              type="button"
              onClick={() => onSelect(policy.id)}
              aria-label={`${policy.name} auswählen`}
              className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${active ? "border-primary bg-primary/5" : "border-border/70 bg-card hover:border-primary/40 hover:bg-muted/30"}`}
            >
              <span className="min-w-0 truncate">{policy.name}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                <Badge variant={isBuiltIn(policy) ? "outline" : "secondary"} className="text-[10px]">{isBuiltIn(policy) ? "Standard" : "Eigene"}</Badge>
                <Badge variant="outline" className="text-[10px]">v{policy.version}</Badge>
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex gap-2 border-t pt-3">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={!selectedPolicy}
          onClick={() => selectedPolicy && setNameDialog({ mode: "duplicate", name: `${selectedPolicy.name} Kopie` })}
        >
          <Copy className="mr-1.5 h-3.5 w-3.5" />Duplizieren
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 text-destructive hover:text-destructive"
          disabled={!selectedPolicy || Boolean(deleteDisabledReason) || isSaving}
          title={deleteDisabledReason}
          onClick={() => {
            if (!selectedPolicy) return;
            if (window.confirm(`Policy „${selectedPolicy.name}“ wirklich löschen?`)) onDelete(selectedPolicy);
          }}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />Löschen
        </Button>
      </div>

      <Dialog open={nameDialog !== null} onOpenChange={(open) => { if (!open) setNameDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{nameDialog?.mode === "create" ? "Neue Policy anlegen" : "Policy duplizieren"}</DialogTitle>
            <DialogDescription>{nameDialog?.mode === "create" ? "Startet mit den Standardwerten; alle Felder können danach angepasst werden." : "Erstellt eine eigenständige Kopie mit denselben Werten."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="policy-catalog-name">Name</Label>
            <Input id="policy-catalog-name" value={nameDialog?.name ?? ""} onChange={(event) => setNameDialog((current) => current && { ...current, name: event.target.value })} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNameDialog(null)}>Abbrechen</Button>
            <Button onClick={() => void submitNameDialog()} disabled={!nameDialog?.name.trim() || isSaving}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
