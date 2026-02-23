import { useEffect, useState, useCallback } from "react";
import { useFilterState } from "@/hooks/useFilterState";
import { getSnapshots } from "@/data/db";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { X, Search } from "lucide-react";
import type { SnapshotMeta } from "@/domain/models/types";

export function FilterBar() {
  const { filters, setFilters, resetFilters } = useFilterState();
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [vcenters, setVcenters] = useState<string[]>([]);
  const [searchLocal, setSearchLocal] = useState(filters.search);

  useEffect(() => {
    getSnapshots().then((snaps) => {
      const compareByName = (a: string, b: string) =>
        a.localeCompare(b, "de-DE", { numeric: true, sensitivity: "base" });

      const sortedSnapshots = [...snaps].sort((a, b) => compareByName(a.fileName, b.fileName));
      setSnapshots(sortedSnapshots);

      const vcenterById = new Map<string, string>();
      for (const snap of sortedSnapshots) {
        if (!vcenterById.has(snap.vcenterId)) vcenterById.set(snap.vcenterId, snap.vcenterDisplayName || snap.vcenterId);
      }

      const sortedVcenters = [...vcenterById.entries()]
        .sort(([, nameA], [, nameB]) => compareByName(nameA, nameB))
        .map(([id]) => id);

      setVcenters(sortedVcenters);
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { setFilters({ search: searchLocal }); }, 200);
    return () => clearTimeout(timer);
  }, [searchLocal, setFilters]);

  const handleVcenterChange = useCallback((value: string) => {
    if (value === "all") setFilters({ vcenterIds: [], snapshotIds: [] });
    else setFilters({ vcenterIds: [value], snapshotIds: [] });
  }, [setFilters]);

  const handleSnapshotChange = useCallback((value: string) => {
    if (value === "all") setFilters({ snapshotIds: [] });
    else setFilters({ snapshotIds: [value] });
  }, [setFilters]);

  const filteredSnapshots = filters.vcenterIds.length
    ? snapshots.filter((s) => filters.vcenterIds.includes(s.vcenterId))
    : snapshots;

  const hasFilters = filters.vcenterIds.length > 0 || filters.snapshotIds.length > 0 || filters.search !== "";

  if (snapshots.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-card/60 p-3 animate-fade-in">
      <Select value={filters.vcenterIds[0] || "all"} onValueChange={handleVcenterChange}>
        <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="vCenter" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle vCenter</SelectItem>
          {vcenters.map((vc) => {
            const snap = snapshots.find((s) => s.vcenterId === vc);
            return <SelectItem key={vc} value={vc}>{snap?.vcenterDisplayName || vc}</SelectItem>;
          })}
        </SelectContent>
      </Select>
      <Select value={filters.snapshotIds[0] || "all"} onValueChange={handleSnapshotChange}>
        <SelectTrigger className="h-8 w-[220px] text-xs"><SelectValue placeholder="Snapshot" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle Snapshots</SelectItem>
          {filteredSnapshots.map((s) => (
            <SelectItem key={s.snapshotId} value={s.snapshotId}>
              {s.fileName} ({new Date(s.exportTs).toLocaleDateString("de-DE")})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Suchen..." value={searchLocal} onChange={(e) => setSearchLocal(e.target.value)} className="h-8 w-[180px] pl-7 text-xs" />
      </div>
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-xs text-muted-foreground hover:text-foreground">
          <X className="mr-1 h-3 w-3" />Reset
        </Button>
      )}
    </div>
  );
}
