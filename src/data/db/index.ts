import Dexie, { type Table } from "dexie";
import type {
  SnapshotMeta,
  SheetRow,
  NormalizedVm,
  NormalizedHost,
  NormalizedCluster,
  NormalizedDatastore,
  NormalizedSnapshot,
  NormalizedHealth,
  AnalysisMetric,
  UiState,
} from "@/domain/models/types";

export class RVToolsDB extends Dexie {
  snapshots!: Table<SnapshotMeta, string>;
  rawSheets!: Table<SheetRow, [string, string, number]>;
  entities_vm!: Table<NormalizedVm, string>;
  entities_host!: Table<NormalizedHost, string>;
  entities_cluster!: Table<NormalizedCluster, string>;
  entities_datastore!: Table<NormalizedDatastore, string>;
  entities_snapshot!: Table<NormalizedSnapshot>;
  entities_health!: Table<NormalizedHealth>;
  metrics_cache!: Table<AnalysisMetric, string>;
  ui_state!: Table<UiState, string>;

  constructor() {
    super("rvtools-analyzer");

    this.version(1).stores({
      snapshots:
        "snapshotId, [vcenterId+exportTs], vcenterId, exportTs, fileChecksum",
      rawSheets:
        "[snapshotId+sheetName+rowIndex], [snapshotId+sheetName], sheetName, snapshotId",
      entities_vm:
        "vmKey, vcenterId, snapshotId, cluster, host, powerState",
      entities_host:
        "hostKey, vcenterId, snapshotId, cluster",
      entities_cluster:
        "clusterKey, vcenterId, snapshotId",
      entities_datastore:
        "dsKey, vcenterId, snapshotId, clusterName, freePct",
      entities_snapshot:
        "++id, snapshotId, vcenterId, vmName",
      entities_health:
        "++id, snapshotId, vcenterId, messageType",
      metrics_cache:
        "[snapshotId+id], id, snapshotId, vcenterId",
      ui_state: "id",
    });
  }
}

export const db = new RVToolsDB();

export async function deleteAllData(): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.snapshots,
      db.rawSheets,
      db.entities_vm,
      db.entities_host,
      db.entities_cluster,
      db.entities_datastore,
      db.entities_snapshot,
      db.entities_health,
      db.metrics_cache,
      db.ui_state,
    ],
    async () => {
      await Promise.all([
        db.snapshots.clear(),
        db.rawSheets.clear(),
        db.entities_vm.clear(),
        db.entities_host.clear(),
        db.entities_cluster.clear(),
        db.entities_datastore.clear(),
        db.entities_snapshot.clear(),
        db.entities_health.clear(),
        db.metrics_cache.clear(),
        db.ui_state.clear(),
      ]);
    }
  );
}

export async function deleteSnapshot(snapshotId: string): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.snapshots,
      db.rawSheets,
      db.entities_vm,
      db.entities_host,
      db.entities_cluster,
      db.entities_datastore,
      db.entities_snapshot,
      db.entities_health,
      db.metrics_cache,
    ],
    async () => {
      await Promise.all([
        db.snapshots.delete(snapshotId),
        db.rawSheets.where("snapshotId").equals(snapshotId).delete(),
        db.entities_vm.where("snapshotId").equals(snapshotId).delete(),
        db.entities_host.where("snapshotId").equals(snapshotId).delete(),
        db.entities_cluster.where("snapshotId").equals(snapshotId).delete(),
        db.entities_datastore.where("snapshotId").equals(snapshotId).delete(),
        db.entities_snapshot.where("snapshotId").equals(snapshotId).delete(),
        db.entities_health.where("snapshotId").equals(snapshotId).delete(),
        db.metrics_cache.where("snapshotId").equals(snapshotId).delete(),
      ]);
    }
  );
}
