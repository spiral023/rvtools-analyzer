import { AlertTriangle, Boxes, Database, HardDrive, Server, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import type { NormalizedCluster, NormalizedDatastore, NormalizedHealth, SnapshotMeta } from "@/domain/models/types";
import type { VCenterSummary } from "@/pages/FleetCompare";
import { formatBytes, formatNum, formatPct } from "@/lib/xlsx/parseHelpers";
import type { DetailDossier, DetailField, DetailKpi, DetailTable } from "@/lib/detailExport";
import {
  DetailCountBadge,
  DetailFieldGrid,
  DetailKpiGrid,
  DetailNarrative,
  DetailSection,
  DetailTableView,
  SystemDetailContent,
} from "@/components/detail/SystemDetailLayout";

interface VCenterDetailDialogProps {
  summary: VCenterSummary | null;
  snapshot: SnapshotMeta | null;
  open: boolean;
  onClose: () => void;
  clusters: NormalizedCluster[];
  datastores: NormalizedDatastore[];
  health: NormalizedHealth[];
}

function bool(value: boolean | null): string {
  if (value === null) return "—";
  return value ? "Aktiv" : "Aus";
}

export function VCenterDetailDialog({
  summary,
  snapshot,
  open,
  onClose,
  clusters,
  datastores,
  health,
}: VCenterDetailDialogProps) {
  if (!summary) return null;
  const scopedClusters = clusters.filter((cluster) => cluster.snapshotId === summary.snapshotId);
  const scopedDatastores = datastores
    .filter((datastore) => datastore.snapshotId === summary.snapshotId)
    .sort((a, b) => (a.freePct ?? 101) - (b.freePct ?? 101));
  const scopedHealth = health.filter((event) => event.snapshotId === summary.snapshotId);
  const poweredOff = summary.vmCount - summary.poweredOn;
  const totalDatastoreCapacity = scopedDatastores.reduce((sum, datastore) => sum + (datastore.capacityMiB ?? 0), 0);
  const totalDatastoreFree = scopedDatastores.reduce((sum, datastore) => sum + (datastore.freeMiB ?? 0), 0);
  const haDisabled = scopedClusters.filter((cluster) => cluster.haEnabled === false).length;
  const drsDisabled = scopedClusters.filter((cluster) => cluster.drsEnabled === false).length;
  const riskTone: DetailKpi["tone"] = summary.riskScore > 50 ? "critical" : summary.riskScore > 25 ? "warning" : "good";

  const kpis: DetailKpi[] = [
    { label: "VMs", value: formatNum(summary.vmCount), hint: `${formatNum(summary.poweredOn)} eingeschaltet` },
    { label: "Hosts", value: formatNum(summary.hostCount), hint: `${formatNum(summary.clusterCount)} Cluster` },
    { label: "Gesamt-RAM", value: `${summary.totalRamGiB.toLocaleString("de-DE", { maximumFractionDigits: 0 })} GiB`, hint: `${formatNum(summary.totalCpuThreads)} CPU-Threads` },
    { label: "CPU Overcommit", value: `${summary.cpuOvercommit.toLocaleString("de-DE", { maximumFractionDigits: 1 })}:1`, hint: "vCPU zu Thread", tone: summary.cpuOvercommit > 5 ? "critical" : summary.cpuOvercommit > 3 ? "warning" : "neutral" },
    { label: "Datastore frei", value: formatPct(summary.avgDsFree), hint: summary.criticalDatastores ? `${summary.criticalDatastores} kritisch` : "keine kritischen", tone: summary.criticalDatastores ? "critical" : "good" },
    { label: "Risiko-Score", value: `${summary.riskScore} / 100`, hint: `${summary.healthIssues} Health Issues`, tone: riskTone },
  ];
  const inventoryFields: DetailField[] = [
    { label: "vCenter ID", value: summary.vcenterId, sensitivity: "identifier" },
    { label: "Version", value: summary.version || "—" },
    { label: "Snapshot-ID", value: summary.snapshotId, sensitivity: "identifier" },
    { label: "Exportzeitpunkt", value: snapshot ? new Date(snapshot.exportTs).toLocaleString("de-DE") : "—" },
    { label: "Importzeitpunkt", value: snapshot ? new Date(snapshot.importedAt).toLocaleString("de-DE") : "—" },
    { label: "Quelldatei", value: snapshot?.fileName || "—", sensitivity: "identifier" },
    { label: "VMs gesamt", value: formatNum(summary.vmCount) },
    { label: "VMs powered off", value: formatNum(poweredOff) },
    { label: "Hosts", value: formatNum(summary.hostCount) },
    { label: "Cluster", value: formatNum(summary.clusterCount) },
    { label: "Datastores", value: formatNum(summary.datastoreCount) },
    { label: "Offene VM-Snapshots", value: formatNum(summary.snapshotCount) },
  ];
  const riskFields: DetailField[] = [
    { label: "Risiko-Score", value: `${summary.riskScore} / 100` },
    { label: "Health Issues", value: formatNum(summary.healthIssues) },
    { label: "Security Drift", value: formatNum(summary.securityDrift) },
    { label: "Kritische Datastores", value: formatNum(summary.criticalDatastores) },
    { label: "Cluster ohne HA", value: formatNum(haDisabled) },
    { label: "Cluster ohne DRS", value: formatNum(drsDisabled) },
    { label: "Datastore-Kapazität", value: formatBytes(totalDatastoreCapacity) },
    { label: "Datastore frei", value: formatBytes(totalDatastoreFree) },
  ];
  const clusterTable: DetailTable = {
    headers: ["Cluster", "Datacenter", "Hosts", "Effektiv", "HA", "DRS", "CPU Cores", "RAM"],
    rows: scopedClusters.map((cluster) => [
      cluster.name,
      cluster.datacenter || "—",
      formatNum(cluster.numHosts),
      formatNum(cluster.numEffectiveHosts),
      bool(cluster.haEnabled),
      bool(cluster.drsEnabled),
      formatNum(cluster.numCpuCores),
      formatBytes(cluster.totalMemoryMiB),
    ]),
    sensitiveColumns: { 0: "identifier", 1: "identifier" },
  };
  const datastoreTable: DetailTable = {
    headers: ["Datastore", "Cluster", "Typ", "Kapazität", "Belegt", "Frei", "Frei %"],
    rows: scopedDatastores.map((datastore) => [
      datastore.name,
      datastore.clusterName || "—",
      datastore.type || "—",
      formatBytes(datastore.capacityMiB),
      formatBytes(datastore.inUseMiB),
      formatBytes(datastore.freeMiB),
      formatPct(datastore.freePct),
    ]),
    sensitiveColumns: { 0: "identifier", 1: "identifier" },
    maxRows: 35,
  };
  const healthTable: DetailTable = {
    headers: ["Entity", "Typ", "Meldung"],
    rows: scopedHealth.map((event) => [event.entity || "—", event.messageType || "—", event.message || "—"]),
    sensitiveColumns: { 0: "identifier", 2: "text" },
    maxRows: 40,
  };
  const narrative = `Das vCenter verwaltet ${formatNum(summary.vmCount)} VMs auf ${formatNum(summary.hostCount)} Hosts in ${formatNum(summary.clusterCount)} Clustern. ${formatNum(summary.poweredOn)} VMs sind eingeschaltet. Der aktuelle Risiko-Score liegt bei ${summary.riskScore} von 100${summary.healthIssues || summary.criticalDatastores ? `; dazu tragen ${summary.healthIssues} Health Issues und ${summary.criticalDatastores} kritische Datastores bei.` : " und zeigt derzeit keine ausgelösten Risikofaktoren."}`;
  const dossier: DetailDossier = {
    kind: "vCenter",
    title: summary.displayName,
    titleSensitivity: "identifier",
    subtitle: [summary.version, snapshot ? `Export ${new Date(snapshot.exportTs).toLocaleString("de-DE")}` : null].filter(Boolean).join(" · "),
    summary: narrative,
    kpis,
    sourceDate: snapshot ? new Date(snapshot.exportTs).toLocaleString("de-DE") : null,
    sections: [
      { title: "Inventar & Datenstand", fields: inventoryFields },
      { title: "Betriebsrisiken & Kapazität", fields: riskFields },
      { title: "Cluster", table: clusterTable },
      { title: "Datastores", table: datastoreTable },
      { title: "Health-Events", table: healthTable },
    ],
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <SystemDetailContent
        icon={<Server className="size-6" />}
        eyebrow="vCenter-Systemakte"
        title={summary.displayName}
        subtitle={[summary.version, snapshot ? `Export ${new Date(snapshot.exportTs).toLocaleString("de-DE")}` : null].filter(Boolean).join(" · ")}
        badges={
          <>
            <Badge variant={summary.riskScore > 50 ? "destructive" : "secondary"} className="rounded-full text-[10px]">Risiko {summary.riskScore}</Badge>
            <Badge variant="outline" className="rounded-full text-[10px]">{summary.healthIssues} Health Issues</Badge>
            <Badge variant="outline" className="rounded-full text-[10px]">{summary.securityDrift} Security Drift</Badge>
          </>
        }
        dossier={dossier}
      >
        <DetailNarrative source="RVTools Snapshot">{narrative}</DetailNarrative>
        <DetailKpiGrid items={kpis} />
        <div className="grid gap-5 xl:grid-cols-2">
          <DetailSection icon={<Database className="size-4" />} title="Inventar & Datenstand" description="Scope, Version und Herkunft des ausgewerteten RVTools-Snapshots.">
            <DetailFieldGrid fields={inventoryFields} columns={2} />
          </DetailSection>
          <DetailSection icon={<ShieldAlert className="size-4" />} title="Betriebsrisiken & Kapazität" description="Verdichtete Hinweise für Betrieb, Security und Storage.">
            <DetailFieldGrid fields={riskFields} columns={2} />
          </DetailSection>
        </div>
        <DetailSection icon={<Boxes className="size-4" />} title="Cluster" description="Cluster-Services und physische Gesamtkapazität." aside={<DetailCountBadge>{scopedClusters.length}</DetailCountBadge>}>
          <DetailTableView table={clusterTable} />
        </DetailSection>
        <DetailSection icon={<HardDrive className="size-4" />} title="Datastores" description="Storage-Bestand nach freiem Anteil sortiert." aside={<DetailCountBadge>{scopedDatastores.length}</DetailCountBadge>}>
          <DetailTableView table={datastoreTable} />
        </DetailSection>
        <DetailSection icon={<AlertTriangle className="size-4" />} title="Health-Events" description="Von vCenter gemeldete Health- und Konfigurationshinweise." aside={<DetailCountBadge>{scopedHealth.length}</DetailCountBadge>}>
          <DetailTableView table={healthTable} />
        </DetailSection>
      </SystemDetailContent>
    </Dialog>
  );
}
