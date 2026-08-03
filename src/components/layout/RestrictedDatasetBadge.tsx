import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useActiveSnapshotIds } from "@/hooks/useActiveSnapshots";

/** Zentraler, persistenter Hinweis, wenn der aktive Analysedatensatz aus einem SysV-Paket stammt. */
export function RestrictedDatasetBadge() {
  const { snapshots, activeSnapshotIds } = useActiveSnapshotIds();
  const activeSnapshotIdSet = new Set(activeSnapshotIds);

  if (!snapshots.some((snapshot) => activeSnapshotIdSet.has(snapshot.snapshotId) && snapshot.restrictedDataset?.kind === "sysv-package")) return null;

  return (
    <Badge
      variant="outline"
      className="gap-1.5 border-primary/40 text-primary"
      title="Eingeschränkter SysV-Datensatz: Dieser Datensatz ist physisch auf einen exportierten SysV-Scope begrenzt."
    >
      <ShieldCheck className="size-3.5" aria-hidden="true" />
      <span className="hidden lg:inline">Eingeschränkter SysV-Datensatz</span>
      <span className="lg:hidden">SysV-Scope</span>
    </Badge>
  );
}
