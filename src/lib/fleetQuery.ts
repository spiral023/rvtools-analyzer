import type { SnapshotMeta } from "@/domain/models/types";

/** Fleet-Queries teilen die kanonische All-Snapshot-Identität mit dem globalen Preload. */
export function getFleetQuerySnapshotIds(snapshots: SnapshotMeta[]): string[] {
  return snapshots.map((snapshot) => snapshot.snapshotId);
}
