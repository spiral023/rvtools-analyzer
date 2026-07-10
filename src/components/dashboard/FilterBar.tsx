import { useEffect, useMemo, useState, useCallback } from "react";
import { useFilterState } from "@/hooks/useFilterState";
import { useActiveSnapshotIds } from "@/hooks/useActiveSnapshots";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Monitor, Search, ShieldOff, X } from "lucide-react";
import { hasVmScopeFilter } from "@/lib/vmScope";

export function FilterBar() {
  const { filters, setFilters, resetFilters } = useFilterState();
  const { snapshots } = useActiveSnapshotIds();
  const [searchLocal, setSearchLocal] = useState(filters.search);

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

  const handleVcenterChange = useCallback((value: string) => {
    if (value === "all") setFilters({ vcenterIds: [] });
    else setFilters({ vcenterIds: [value] });
  }, [setFilters]);

  const hasFilters =
    filters.vcenterIds.length > 0 ||
    filters.search !== "" ||
    hasVmScopeFilter(filters);

  if (snapshots.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-card/60 p-3 animate-fade-in">
      <Select value={filters.vcenterIds[0] || "all"} onValueChange={handleVcenterChange}>
        <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="vCenter" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle vCenter</SelectItem>
          {vcenters.map(([id, displayName]) => (
            <SelectItem key={id} value={id}>{displayName}</SelectItem>
          ))}
        </SelectContent>
      </Select>
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
    </div>
  );
}
