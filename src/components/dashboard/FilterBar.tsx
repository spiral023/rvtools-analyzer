import { useEffect, useMemo, useState, useCallback } from "react";
import { useFilterState } from "@/hooks/useFilterState";
import { useActiveSnapshotIds } from "@/hooks/useActiveSnapshots";
import { useVcenterGroups } from "@/hooks/useVcenterGroups";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BookmarkPlus, FolderCog, Monitor, Pencil, Search, Server, ShieldOff, Trash2, X } from "lucide-react";
import { hasVmScopeFilter } from "@/lib/vmScope";
import { toast } from "sonner";
import type { VCenterGroup } from "@/domain/models/types";

function createGroupId() {
  return globalThis.crypto?.randomUUID?.() ?? `vcenter-group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function FilterBar() {
  const { filters, setFilters, resetFilters } = useFilterState();
  const { snapshots } = useActiveSnapshotIds();
  const { groups: vcenterGroups, saveGroup, deleteGroup } = useVcenterGroups();
  const [searchLocal, setSearchLocal] = useState(filters.search);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const vcenters = useMemo(() => {
    const compareByName = (a: string, b: string) =>
      a.localeCompare(b, "de-DE", { numeric: true, sensitivity: "base" });
    const vcenterById = new Map<string, string>();
    for (const snapshot of snapshots) {
      if (!vcenterById.has(snapshot.vcenterId)) {
        vcenterById.set(snapshot.vcenterId, snapshot.vcenterDisplayName || snapshot.vcenterId);
      }
    }
    return [...vcenterById.entries()]
      .sort(([, nameA], [, nameB]) => compareByName(nameA, nameB));
  }, [snapshots]);

  useEffect(() => {
    const timer = setTimeout(() => { setFilters({ search: searchLocal }); }, 200);
    return () => clearTimeout(timer);
  }, [searchLocal, setFilters]);

  const selectedVcenterIds = new Set(filters.vcenterIds);
  const matchingVcenterGroup = vcenterGroups.find((group) => {
    const groupVcenterIds = new Set(group.vcenterIds);
    return groupVcenterIds.size === selectedVcenterIds.size
      && [...groupVcenterIds].every((vcenterId) => selectedVcenterIds.has(vcenterId));
  });
  const vcenterLabel = matchingVcenterGroup?.name
    ?? (filters.vcenterIds.length === 0
      ? "Alle vCenter"
      : filters.vcenterIds.length === 1
        ? (vcenters.find(([id]) => id === filters.vcenterIds[0])?.[1] ?? "1 vCenter ausgewählt")
        : `${filters.vcenterIds.length} vCenter ausgewählt`);

  const toggleVcenter = useCallback((vcenterId: string, checked: boolean) => {
    setFilters({
      vcenterIds: checked
        ? [...new Set([...filters.vcenterIds, vcenterId])]
        : filters.vcenterIds.filter((id) => id !== vcenterId),
    });
  }, [filters.vcenterIds, setFilters]);

  const applyGroup = useCallback((group: VCenterGroup) => {
    setFilters({ vcenterIds: group.vcenterIds });
  }, [setFilters]);

  const openNewGroup = useCallback(() => {
    if (filters.vcenterIds.length === 0) {
      toast.error("Wählen Sie mindestens ein vCenter aus.");
      return;
    }
    setEditingGroupId(null);
    setGroupName("");
    setGroupDialogOpen(true);
  }, [filters.vcenterIds.length]);

  const openEditGroup = useCallback((group: VCenterGroup) => {
    applyGroup(group);
    setEditingGroupId(group.id);
    setGroupName(group.name);
    setGroupDialogOpen(true);
  }, [applyGroup]);

  const saveCurrentGroup = async () => {
    const name = groupName.trim();
    if (!name) {
      toast.error("Bitte geben Sie einen Gruppennamen ein.");
      return;
    }
    if (filters.vcenterIds.length === 0) {
      toast.error("Eine Gruppe muss mindestens ein vCenter enthalten.");
      return;
    }
    const existing = vcenterGroups.find((group) => group.id === editingGroupId);
    const now = new Date().toISOString();
    await saveGroup({
      id: existing?.id ?? createGroupId(),
      name,
      vcenterIds: filters.vcenterIds,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    toast.success(existing ? "vCenter-Gruppe gespeichert." : "vCenter-Gruppe erstellt.");
    setGroupDialogOpen(false);
    setEditingGroupId(null);
    setGroupName("");
  };

  const removeGroup = async (group: VCenterGroup) => {
    await deleteGroup(group.id);
    if (editingGroupId === group.id) {
      setEditingGroupId(null);
      setGroupName("");
    }
    toast.success("vCenter-Gruppe gelöscht.");
  };

  const handleGroupDialogChange = (open: boolean) => {
    setGroupDialogOpen(open);
    if (!open) {
      setEditingGroupId(null);
      setGroupName("");
    }
  };

  const hasFilters =
    filters.vcenterIds.length > 0 ||
    filters.search !== "" ||
    hasVmScopeFilter(filters);

  if (snapshots.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-card/60 p-3 animate-fade-in">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 min-w-[180px] justify-start text-xs" aria-label="vCenter auswählen">
            <Server className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <span className="max-w-[138px] truncate">{vcenterLabel}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuCheckboxItem
            checked={filters.vcenterIds.length === 0}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => setFilters({ vcenterIds: [] })}
          >
            Alle vCenter
          </DropdownMenuCheckboxItem>
          {vcenters.map(([id, displayName]) => (
            <DropdownMenuCheckboxItem
              key={id}
              checked={selectedVcenterIds.has(id)}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) => toggleVcenter(id, checked === true)}
            >
              {displayName}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Gespeicherte Gruppen</DropdownMenuLabel>
          {vcenterGroups.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">Noch keine Gruppen gespeichert</div>
          ) : vcenterGroups.map((group) => (
            <DropdownMenuItem key={group.id} onSelect={() => applyGroup(group)} className="text-xs">
              <FolderCog className="mr-2 h-3.5 w-3.5 text-primary" />
              <span className="truncate">{group.name}</span>
              <span className="ml-auto pl-2 text-[10px] text-muted-foreground">{group.vcenterIds.length}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={openNewGroup} className="text-xs">
            <BookmarkPlus className="mr-2 h-3.5 w-3.5" />Aktuelle Auswahl speichern
          </DropdownMenuItem>
          {vcenterGroups.length > 0 && (
            <DropdownMenuItem onSelect={() => handleGroupDialogChange(true)} className="text-xs">
              <FolderCog className="mr-2 h-3.5 w-3.5" />Gruppen verwalten
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Suchen..." value={searchLocal} onChange={(e) => setSearchLocal(e.target.value)} className="h-8 w-[180px] pl-7 text-xs" />
      </div>
      <Select
        value={filters.vmPowerScope}
        onValueChange={(value) => setFilters({ vmPowerScope: value as "all" | "poweredOn" })}
      >
        <SelectTrigger className="h-8 w-[150px] text-xs">
          <Monitor className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
          <SelectValue placeholder="VM Scope" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle VMs</SelectItem>
          <SelectItem value="poweredOn">Nur Powered On</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={filters.excludeVclsVms ? "exclude" : "include"}
        onValueChange={(value) => setFilters({ excludeVclsVms: value === "exclude" })}
      >
        <SelectTrigger className="h-8 w-[150px] text-xs">
          <ShieldOff className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
          <SelectValue placeholder="vCLS" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="include">vCLS anzeigen</SelectItem>
          <SelectItem value="exclude">vCLS ausblenden</SelectItem>
        </SelectContent>
      </Select>
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-xs text-muted-foreground hover:text-foreground">
          <X className="mr-1 h-3 w-3" />Reset
        </Button>
      )}
      <Dialog open={groupDialogOpen} onOpenChange={handleGroupDialogChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>vCenter-Gruppen</DialogTitle>
            <DialogDescription>
              Gruppen speichern die aktuell ausgewählten vCenter über ihre Namen/IDs und sind Teil der Datensicherung.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <label htmlFor="vcenter-group-name" className="text-xs font-medium">Gruppenname</label>
            <Input
              id="vcenter-group-name"
              placeholder="z. B. vCenter Server Prod"
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              className="h-9"
            />
            <p className="text-xs text-muted-foreground">
              {filters.vcenterIds.length} vCenter aus der aktuellen Auswahl werden gespeichert.
            </p>
            <Button size="sm" onClick={() => void saveCurrentGroup()} disabled={filters.vcenterIds.length === 0}>
              <BookmarkPlus className="mr-1.5 h-3.5 w-3.5" />{editingGroupId ? "Gruppe aktualisieren" : "Gruppe speichern"}
            </Button>
          </div>
          {vcenterGroups.length > 0 && (
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {vcenterGroups.map((group) => (
                <div key={group.id} className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{group.name}</p>
                    <p className="text-xs text-muted-foreground">{group.vcenterIds.length} vCenter</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Gruppe bearbeiten" onClick={() => openEditGroup(group)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Gruppe löschen" onClick={() => void removeGroup(group)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => handleGroupDialogChange(false)}>Schließen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
