import { useMemo, useState } from "react";
import { Database, Server } from "lucide-react";
import { AuditDetailView } from "@/components/network/AuditDetailView";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Badge } from "@/components/ui/badge";
import {
  NET_AUDIT_COLUMNS,
  NET_HOST_QUALITY_RVTOOLS_COLUMNS,
  NET_HOST_QUALITY_TECHINFO_COLUMNS,
  NET_MAC_CDP_COLUMNS,
  NET_MAC_DISCOVERY_COLUMNS,
} from "@/lib/glossaries/networking";
import { formatBandwidth } from "@/lib/eramon";
import { shortHostname } from "@/lib/networkAudit";
import type {
  CdpMacRow,
  L2Classification,
  L2DiscoveryRow,
  PortAuditRow,
  PortMatchStatus,
} from "@/lib/networkAudit";
import type { RvtoolsHostQualityRow, TechInfoHostQualityRow } from "@/lib/hostDataQualityAudit";
import {
  classifyDiscoveryAuditRow,
  classifyHostAuditRow,
  classifyMacAuditRow,
  classifyPortAuditRow,
  type NetworkAuditCategory,
  type NetworkAuditCheckSummary,
  type NetworkAuditScope,
} from "@/lib/networkAuditViewModel";
import type { ColumnDef } from "@tanstack/react-table";

export interface SharedDetailProps {
  summary: NetworkAuditCheckSummary;
  scope: NetworkAuditScope;
  search: string;
  onBack: () => void;
  onScopeChange: (scope: NetworkAuditScope) => void;
}

function textCell(value: string | null) {
  return value ?? "—";
}

const MATCH_STATUS_LABELS: Record<PortMatchStatus, string> = {
  "confirmed-cdp": "CDP bestätigt",
  "text-match": "RVTools-Treffer",
  "documented-only": "Nur dokumentiert",
  "unknown": "Unbekannt",
  "no-target": "Kein Ziel",
};

function matchStatusBadge(status: PortMatchStatus) {
  const label = MATCH_STATUS_LABELS[status];
  if (status === "confirmed-cdp") {
    return <Badge className="border-transparent bg-success text-success-foreground hover:bg-success/80">{label}</Badge>;
  }
  if (status === "documented-only") {
    return <Badge className="border-transparent bg-warning text-warning-foreground hover:bg-warning/80">{label}</Badge>;
  }
  if (status === "unknown") {
    return <Badge variant="destructive">{label}</Badge>;
  }
  if (status === "no-target") {
    return <Badge variant="outline">{label}</Badge>;
  }
  return <Badge variant="secondary">{label}</Badge>;
}

function presenceBadge(present: boolean) {
  return present
    ? <Badge className="border-transparent bg-success text-success-foreground hover:bg-success/80">vorhanden</Badge>
    : <Badge variant="destructive">fehlt</Badge>;
}

function listCell(values: string[]) {
  if (values.length === 0) return "—";
  return <span className="font-mono-data text-xs">{values.join(", ")}</span>;
}

const portColumns: ColumnDef<PortAuditRow, unknown>[] = [
  { accessorKey: "switchHostname", header: "Switch", meta: { info: NET_AUDIT_COLUMNS.switchHostname }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "interface", header: "Interface", meta: { info: NET_AUDIT_COLUMNS.interface }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "description", header: "Beschreibung", meta: { info: NET_AUDIT_COLUMNS.description }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "status", header: "Status", meta: { info: NET_AUDIT_COLUMNS.status }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  {
    id: "bandwidth",
    header: "Bandbreite",
    meta: { info: NET_AUDIT_COLUMNS.bandwidth },
    accessorFn: (row) => row.bandwidthBps ?? 0,
    cell: ({ row }) => {
      const bps = row.original.bandwidthBps;
      return <span title={bps != null ? `${bps} bit/s` : undefined}>{formatBandwidth(bps)}</span>;
    },
  },
  {
    id: "matchStatus",
    header: "Match-Status",
    meta: { info: NET_AUDIT_COLUMNS.matchStatus },
    accessorFn: (row) => `${MATCH_STATUS_LABELS[row.matchStatus]} ${row.matchStatus}`,
    cell: ({ row }) => matchStatusBadge(row.original.matchStatus),
  },
  { accessorKey: "matchedHost", header: "Vermuteter Host", meta: { info: NET_AUDIT_COLUMNS.matchedHost }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  {
    accessorKey: "finding",
    header: "Auffälligkeit",
    meta: { info: NET_AUDIT_COLUMNS.finding },
    cell: ({ getValue }) => {
      const v = getValue() as string | null;
      if (!v) return textCell(v);
      return <span className="text-warning text-xs">{v}</span>;
    },
  },
];

const rvtoolsHostColumns: ColumnDef<RvtoolsHostQualityRow, unknown>[] = [
  { accessorKey: "host", header: "ESXi-Host (RVTools)", meta: { info: NET_HOST_QUALITY_RVTOOLS_COLUMNS.host }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "cluster", header: "Cluster", meta: { info: NET_HOST_QUALITY_RVTOOLS_COLUMNS.cluster }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "version", header: "ESXi-Version", meta: { info: NET_HOST_QUALITY_RVTOOLS_COLUMNS.version }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { id: "techInfoPresent", header: "Tech-Info", meta: { info: NET_HOST_QUALITY_RVTOOLS_COLUMNS.techInfoPresent }, accessorFn: (row) => row.techInfoPresent ? "vorhanden" : "fehlt", cell: ({ row }) => presenceBadge(row.original.techInfoPresent) },
  { accessorKey: "techInfoServerType", header: "Servertyp", meta: { info: NET_HOST_QUALITY_RVTOOLS_COLUMNS.techInfoServerType }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "techInfoDepartment", header: "Abteilung", meta: { info: NET_HOST_QUALITY_RVTOOLS_COLUMNS.techInfoDepartment }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { id: "ipamPresent", header: "IPAM", meta: { info: NET_HOST_QUALITY_RVTOOLS_COLUMNS.ipamPresent }, accessorFn: (row) => row.ipamPresent ? "vorhanden" : "fehlt", cell: ({ row }) => presenceBadge(row.original.ipamPresent) },
  { id: "ipamAddresses", header: "IP-Adressen", meta: { info: NET_HOST_QUALITY_RVTOOLS_COLUMNS.ipamAddresses }, accessorFn: (row) => row.ipamAddresses.join(" "), cell: ({ row }) => listCell(row.original.ipamAddresses) },
  { id: "ipamNetworks", header: "IPAM-Netze", meta: { info: NET_HOST_QUALITY_RVTOOLS_COLUMNS.ipamNetworks }, accessorFn: (row) => row.ipamNetworks.join(" "), cell: ({ row }) => listCell(row.original.ipamNetworks) },
  { accessorKey: "finding", header: "Datenlücke", meta: { info: NET_HOST_QUALITY_RVTOOLS_COLUMNS.finding }, cell: ({ getValue }) => <span className="text-warning text-xs">{textCell(getValue() as string | null)}</span> },
];

const techInfoHostColumns: ColumnDef<TechInfoHostQualityRow, unknown>[] = [
  { accessorKey: "techInfoName", header: "Objekt (Tech-Info)", meta: { info: NET_HOST_QUALITY_TECHINFO_COLUMNS.techInfoName }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { id: "rvtoolsPresent", header: "RVTools", meta: { info: NET_HOST_QUALITY_TECHINFO_COLUMNS.rvtoolsPresent }, accessorFn: (row) => row.rvtoolsPresent ? "vorhanden" : "fehlt", cell: ({ row }) => presenceBadge(row.original.rvtoolsPresent) },
  { accessorKey: "rvtoolsHost", header: "ESXi-Host (RVTools)", meta: { info: NET_HOST_QUALITY_TECHINFO_COLUMNS.rvtoolsHost }, cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
  { accessorKey: "rvtoolsCluster", header: "Cluster", meta: { info: NET_HOST_QUALITY_TECHINFO_COLUMNS.rvtoolsCluster }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { id: "ipamPresent", header: "IPAM", meta: { info: NET_HOST_QUALITY_TECHINFO_COLUMNS.ipamPresent }, accessorFn: (row) => row.ipamPresent ? "vorhanden" : "fehlt", cell: ({ row }) => presenceBadge(row.original.ipamPresent) },
  { id: "ipamAddresses", header: "IP-Adressen", meta: { info: NET_HOST_QUALITY_TECHINFO_COLUMNS.ipamAddresses }, accessorFn: (row) => row.ipamAddresses.join(" "), cell: ({ row }) => listCell(row.original.ipamAddresses) },
  { accessorKey: "finding", header: "Datenlücke", meta: { info: NET_HOST_QUALITY_TECHINFO_COLUMNS.finding }, cell: ({ getValue }) => <span className="text-warning text-xs">{textCell(getValue() as string | null)}</span> },
];

const CLASSIFICATION_LABELS: Record<L2Classification, string> = {
  "esxi-cdp": "ESXi (CDP)",
  "ipam": "IPAM-bekannt",
  "unknown": "Unbekannt/Fremd",
};

function classificationBadge(classification: L2Classification) {
  if (classification === "esxi-cdp") return <Badge className="border-transparent bg-success text-success-foreground hover:bg-success/80">{CLASSIFICATION_LABELS[classification]}</Badge>;
  if (classification === "ipam") return <Badge variant="secondary">{CLASSIFICATION_LABELS[classification]}</Badge>;
  return <Badge variant="destructive">{CLASSIFICATION_LABELS[classification]}</Badge>;
}

const cdpMacColumns: ColumnDef<CdpMacRow, unknown>[] = [
  { accessorKey: "host", header: "Host", meta: { info: NET_MAC_CDP_COLUMNS.host }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "adapter", header: "vmnic", meta: { info: NET_MAC_CDP_COLUMNS.adapter }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "mac", header: "MAC", meta: { info: NET_MAC_CDP_COLUMNS.mac }, cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
  { id: "inL2", header: "In L2?", meta: { info: NET_MAC_CDP_COLUMNS.inL2 }, accessorFn: (row) => (row.inL2 ? "ja" : "nein"), cell: ({ row }) => (row.original.inL2 ? presenceBadge(true) : <Badge variant="destructive">fehlt</Badge>) },
  { id: "l2Location", header: "Switch/Port (L2)", meta: { info: NET_MAC_CDP_COLUMNS.l2Location }, accessorFn: (row) => `${row.l2Switch ?? ""} ${row.l2Interface ?? ""}`, cell: ({ row }) => (row.original.l2Switch ? <span className="font-mono-data text-xs">{shortHostname(row.original.l2Switch)}/{row.original.l2Interface}</span> : "—") },
  { accessorKey: "vlan", header: "VLAN", meta: { info: NET_MAC_CDP_COLUMNS.vlan }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "learnedIp", header: "Gelernte IP", meta: { info: NET_MAC_CDP_COLUMNS.learnedIp }, cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
  { accessorKey: "dnsName", header: "DNS-Name", meta: { info: NET_MAC_CDP_COLUMNS.dnsName }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { accessorKey: "finding", header: "Auffälligkeit", meta: { info: NET_MAC_CDP_COLUMNS.finding }, cell: ({ getValue }) => { const value = getValue() as string | null; return value ? <span className="text-warning text-xs">{value}</span> : "—"; } },
];

const l2DiscoveryColumns: ColumnDef<L2DiscoveryRow, unknown>[] = [
  { id: "l2Location", header: "Switch/Port", meta: { info: NET_MAC_DISCOVERY_COLUMNS.l2Location }, accessorFn: (row) => `${row.switchName} ${row.interface}`, cell: ({ row }) => <span className="font-mono-data text-xs">{shortHostname(row.original.switchName)}/{row.original.interface}</span> },
  { accessorKey: "vlan", header: "VLAN", meta: { info: NET_MAC_DISCOVERY_COLUMNS.vlan }, cell: ({ getValue }) => textCell((getValue() as string) || null) },
  { accessorKey: "mac", header: "MAC", meta: { info: NET_MAC_DISCOVERY_COLUMNS.mac }, cell: ({ getValue }) => <span className="font-mono-data">{getValue() as string}</span> },
  { accessorKey: "learnedIp", header: "Gelernte IP", meta: { info: NET_MAC_DISCOVERY_COLUMNS.learnedIp }, cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
  { accessorKey: "dnsName", header: "DNS-Name", meta: { info: NET_MAC_DISCOVERY_COLUMNS.dnsName }, cell: ({ getValue }) => textCell(getValue() as string | null) },
  { id: "classification", header: "Klassifikation", meta: { info: NET_MAC_DISCOVERY_COLUMNS.classification }, accessorFn: (row) => CLASSIFICATION_LABELS[row.classification], cell: ({ row }) => classificationBadge(row.original.classification) },
  { accessorKey: "esxiHost", header: "ESXi-Host", meta: { info: NET_MAC_DISCOVERY_COLUMNS.esxiHost }, cell: ({ getValue }) => <span className="font-mono-data">{textCell(getValue() as string | null)}</span> },
];

function filterByScope<T>(
  rows: T[],
  scope: NetworkAuditScope,
  classifyRow: (row: T) => NetworkAuditCategory,
): T[] {
  if (scope === "all") return rows;
  return rows.filter((row) => {
    const category = classifyRow(row);
    return scope === "attention" ? category !== "passed" : category === "passed";
  });
}

function unavailableState(title: string, description: string) {
  return (
    <EmptyState
      icon={<Database aria-hidden="true" className="h-6 w-6" />}
      title={title}
      description={description}
      actionLabel="Fehlende Daten importieren"
      actionTo="/upload"
    />
  );
}

export function PortAuditDetail({
  rows,
  summary,
  scope,
  search,
  onBack,
  onScopeChange,
}: SharedDetailProps & { rows: PortAuditRow[] }) {
  const visibleRows = useMemo(
    () => filterByScope(rows, scope, classifyPortAuditRow),
    [rows, scope],
  );
  const [visibleCount, setVisibleCount] = useState(visibleRows.length);

  if (summary.readiness === "unavailable") {
    return unavailableState(
      "Switch-Port-Prüfung noch nicht möglich",
      "Importieren Sie Eramon-Interface-Daten.",
    );
  }

  return (
    <AuditDetailView
      title="Switch-Port-Zuordnungen"
      description="Prüft Portbeschriftung, Link-Status und CDP-Nachbar auf Widersprüche."
      summary={summary}
      scope={scope}
      visibleCount={visibleCount}
      totalCount={rows.length}
      search={search}
      onBack={onBack}
      onScopeChange={onScopeChange}
    >
      <VirtualTable
        data={visibleRows}
        columns={portColumns}
        globalFilter={search}
        height={500}
        exportFileName="network-audit"
        onFilteredRowCountChange={setVisibleCount}
        emptyTitle={search ? "Keine passenden Einträge" : "Keine Einträge in diesem Ergebnisfilter"}
        emptyDescription={search
          ? "Entfernen Sie den Suchbegriff oder ändern Sie den Ergebnisfilter."
          : "Wählen Sie einen anderen Ergebnisfilter."}
      />
    </AuditDetailView>
  );
}

type HostPerspective = "rvtools" | "techinfo";

const HOST_PERSPECTIVE_OPTIONS: Array<{ value: HostPerspective; label: string }> = [
  { value: "rvtools", label: "Aus RVTools" },
  { value: "techinfo", label: "Aus Tech-Info" },
];

function getAdjacentHostPerspective(
  current: HostPerspective,
  key: string,
): HostPerspective | null {
  const direction = key === "ArrowLeft" || key === "ArrowUp"
    ? -1
    : key === "ArrowRight" || key === "ArrowDown"
      ? 1
      : 0;
  if (direction === 0) return null;
  const currentIndex = HOST_PERSPECTIVE_OPTIONS.findIndex((option) => option.value === current);
  const nextIndex = (currentIndex + direction + HOST_PERSPECTIVE_OPTIONS.length)
    % HOST_PERSPECTIVE_OPTIONS.length;
  return HOST_PERSPECTIVE_OPTIONS[nextIndex].value;
}

export function HostDataAuditDetail({
  rvtoolsRows,
  techInfoRows,
  summary,
  scope,
  search,
  onBack,
  onScopeChange,
}: SharedDetailProps & {
  rvtoolsRows: RvtoolsHostQualityRow[];
  techInfoRows: TechInfoHostQualityRow[];
}) {
  const [perspective, setPerspective] = useState<HostPerspective>("rvtools");
  const filteredRvtoolsRows = useMemo(
    () => filterByScope(rvtoolsRows, scope, classifyHostAuditRow),
    [rvtoolsRows, scope],
  );
  const filteredTechInfoRows = useMemo(
    () => filterByScope(techInfoRows, scope, classifyHostAuditRow),
    [techInfoRows, scope],
  );
  const [visibleCount, setVisibleCount] = useState(filteredRvtoolsRows.length);

  if (summary.readiness === "unavailable") {
    return unavailableState(
      "Host-Datenabgleich noch nicht möglich",
      "Importieren Sie einen RVTools-Snapshot.",
    );
  }

  const isRvtoolsPerspective = perspective === "rvtools";
  const totalCount = isRvtoolsPerspective ? rvtoolsRows.length : techInfoRows.length;

  return (
    <AuditDetailView
      title="Host-Datenqualität"
      description="Gleicht ESXi-Namen aus RVTools und Tech-Info mit IPAM ab."
      summary={summary}
      scope={scope}
      visibleCount={visibleCount}
      totalCount={totalCount}
      search={search}
      onBack={onBack}
      onScopeChange={onScopeChange}
    >
      <div className="space-y-4">
        <div className="max-w-full overflow-x-auto">
          <div
            role="radiogroup"
            aria-label="Ausgangspunkt des Host-Abgleichs"
            className="inline-flex min-w-max items-center rounded-md border bg-muted/25 p-1"
          >
            {HOST_PERSPECTIVE_OPTIONS.map((option) => (
              <span key={option.value}>
                <input
                  id={`host-audit-perspective-${option.value}`}
                  className="peer sr-only"
                  type="radio"
                  name="host-audit-perspective"
                  value={option.value}
                  checked={perspective === option.value}
                  onChange={() => setPerspective(option.value)}
                  onKeyDown={(event) => {
                    const nextPerspective = getAdjacentHostPerspective(option.value, event.key);
                    if (!nextPerspective) return;
                    event.preventDefault();
                    const nextInput = event.currentTarget
                      .closest('[role="radiogroup"]')
                      ?.querySelector<HTMLInputElement>(`[value="${nextPerspective}"]`);
                    nextInput?.focus();
                    setPerspective(nextPerspective);
                  }}
                />
                <label
                  htmlFor={`host-audit-perspective-${option.value}`}
                  className="flex min-h-11 cursor-pointer items-center rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors peer-checked:bg-background peer-checked:text-foreground peer-checked:shadow-sm peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2"
                >
                  {option.label}
                </label>
              </span>
            ))}
          </div>
        </div>

        <div className="flex min-h-11 items-center gap-2 rounded-md border bg-muted/20 px-3 text-sm text-muted-foreground">
          <Server aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
          <span>
            {isRvtoolsPerspective
              ? "Startpunkt: vCenter-Inventar"
              : "Startpunkt: technische Dokumentation"}
          </span>
        </div>

        {isRvtoolsPerspective ? (
          <VirtualTable
            data={filteredRvtoolsRows}
            columns={rvtoolsHostColumns}
            globalFilter={search}
            height={420}
            exportFileName="host-data-quality-rvtools"
            onFilteredRowCountChange={setVisibleCount}
            emptyTitle={search
              ? "Keine passenden Einträge"
              : scope === "attention" ? "Keine offenen Datenlücken" : "Keine passenden Einträge"}
            emptyDescription={search
              ? "Entfernen Sie den Suchbegriff oder ändern Sie den Ergebnisfilter."
              : scope === "attention"
                ? "In dieser Perspektive wurden keine Datenlücken erkannt."
                : "Ändern Sie Filter oder Suchbegriff."}
          />
        ) : (
          <VirtualTable
            data={filteredTechInfoRows}
            columns={techInfoHostColumns}
            globalFilter={search}
            height={420}
            exportFileName="host-data-quality-techinfo"
            onFilteredRowCountChange={setVisibleCount}
            emptyTitle={search
              ? "Keine passenden Einträge"
              : scope === "attention" ? "Keine offenen Datenlücken" : "Keine passenden Einträge"}
            emptyDescription={search
              ? "Entfernen Sie den Suchbegriff oder ändern Sie den Ergebnisfilter."
              : scope === "attention"
                ? "In dieser Perspektive wurden keine Datenlücken erkannt."
                : "Ändern Sie Filter oder Suchbegriff."}
          />
        )}
      </div>
    </AuditDetailView>
  );
}

export function MacAuditDetail({
  rows,
  summary,
  scope,
  search,
  onBack,
  onScopeChange,
}: SharedDetailProps & { rows: CdpMacRow[] }) {
  const visibleRows = useMemo(
    () => filterByScope(rows, scope, classifyMacAuditRow),
    [rows, scope],
  );
  const [visibleCount, setVisibleCount] = useState(visibleRows.length);

  if (summary.readiness === "unavailable") {
    return unavailableState(
      "MAC-Abgleich noch nicht möglich",
      "Importieren Sie CDP- und Eramon-L2-Daten.",
    );
  }

  return (
    <AuditDetailView
      title="ESXi-MAC-Abgleich"
      description="Vergleicht die MAC-Adressen der ESXi-Adapter mit ihrer beobachteten L2-Position."
      summary={summary}
      scope={scope}
      visibleCount={visibleCount}
      totalCount={rows.length}
      search={search}
      onBack={onBack}
      onScopeChange={onScopeChange}
    >
      <VirtualTable
        data={visibleRows}
        columns={cdpMacColumns}
        globalFilter={search}
        height={420}
        exportFileName="mac-audit-cdp"
        onFilteredRowCountChange={setVisibleCount}
        emptyTitle={search
          ? "Keine passenden Einträge"
          : scope === "attention" ? "Keine offenen MAC-Befunde" : "Keine passenden Einträge"}
        emptyDescription={search
          ? "Entfernen Sie den Suchbegriff oder ändern Sie den Ergebnisfilter."
          : scope === "attention"
            ? "Alle auswertbaren ESXi-Adapter wurden ohne Abweichung gefunden."
            : "Ändern Sie Filter oder Suchbegriff."}
      />
    </AuditDetailView>
  );
}

export function NetworkDiscoveryDetail({
  rows,
  summary,
  scope,
  search,
  onBack,
  onScopeChange,
}: SharedDetailProps & { rows: L2DiscoveryRow[] }) {
  const visibleRows = useMemo(
    () => filterByScope(rows, scope, classifyDiscoveryAuditRow),
    [rows, scope],
  );
  const [visibleCount, setVisibleCount] = useState(visibleRows.length);

  if (summary.readiness === "unavailable") {
    return unavailableState(
      "Netz-Discovery noch nicht möglich",
      "Importieren Sie Eramon-L2-Daten.",
    );
  }

  return (
    <AuditDetailView
      title="Unbekannte Geräte"
      description="Klassifiziert gelernte L2-MACs über CDP und IPAM."
      summary={summary}
      scope={scope}
      visibleCount={visibleCount}
      totalCount={rows.length}
      search={search}
      onBack={onBack}
      onScopeChange={onScopeChange}
    >
      <VirtualTable
        data={visibleRows}
        columns={l2DiscoveryColumns}
        globalFilter={search}
        height={420}
        exportFileName="mac-discovery"
        onFilteredRowCountChange={setVisibleCount}
        emptyTitle={search
          ? "Keine passenden Einträge"
          : scope === "attention" ? "Keine unbekannten Geräte" : "Keine passenden Einträge"}
        emptyDescription={search
          ? "Entfernen Sie den Suchbegriff oder ändern Sie den Ergebnisfilter."
          : scope === "attention"
            ? "Alle auswertbaren L2-MACs konnten klassifiziert werden."
            : "Ändern Sie Filter oder Suchbegriff."}
      />
    </AuditDetailView>
  );
}
