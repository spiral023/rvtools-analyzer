import { useMemo, useState } from "react";
import { ListChecks, CheckCircle2, Archive, HelpCircle, AlertTriangle, Tag, Database, Server, Radar } from "lucide-react";
import { useActiveSnapshotIds, useNetworkAudit } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { NET_AUDIT_COLUMNS, NET_AUDIT_KPI, NET_HOST_QUALITY_RVTOOLS_COLUMNS, NET_HOST_QUALITY_TECHINFO_COLUMNS, NET_MAC_CDP_COLUMNS, NET_MAC_DISCOVERY_COLUMNS } from "@/lib/glossaries/networking";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PanelLoadingState } from "@/components/dashboard/PageLoadingState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Badge } from "@/components/ui/badge";
import { Switch as ToggleSwitch } from "@/components/ui/switch";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import { formatBandwidth } from "@/lib/eramon";
import { shortHostname } from "@/lib/networkAudit";
import type { PortAuditRow, PortMatchStatus, CdpMacRow, L2DiscoveryRow, L2Classification } from "@/lib/networkAudit";
import type { RvtoolsHostQualityRow, TechInfoHostQualityRow } from "@/lib/hostDataQualityAudit";
import type { ColumnDef } from "@tanstack/react-table";

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

function isNotable(row: PortAuditRow): boolean {
  if (row.matchStatus === "no-target") return false;
  if (row.matchStatus === "confirmed-cdp" && !row.labelConflict && !row.statusConflict) return false;
  return true;
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

const columns: ColumnDef<PortAuditRow, unknown>[] = [
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

export function NetworkAuditPanel() {
  const { rows: allRows, hostQuality = { rvtoolsRows: [], techInfoRows: [] }, cdpMacRows = [], l2DiscoveryRows = [], isLoading } = useNetworkAudit();
  const { filters } = useActiveSnapshotIds();
  const [onlyNotable, setOnlyNotable] = useState(true);
  const [onlyHostGaps, setOnlyHostGaps] = useState(true);
  const [onlyMacFindings, setOnlyMacFindings] = useState(true);
  const [onlyUnknownL2, setOnlyUnknownL2] = useState(true);

  const rows = useMemo(() => (onlyNotable ? allRows.filter(isNotable) : allRows), [allRows, onlyNotable]);
  const rvtoolsHostRows = useMemo(
    () => onlyHostGaps ? hostQuality.rvtoolsRows.filter((row) => row.finding !== null) : hostQuality.rvtoolsRows,
    [hostQuality.rvtoolsRows, onlyHostGaps],
  );
  const techInfoHostRows = useMemo(
    () => onlyHostGaps ? hostQuality.techInfoRows.filter((row) => row.finding !== null) : hostQuality.techInfoRows,
    [hostQuality.techInfoRows, onlyHostGaps],
  );
  const cdpMacDisplay = useMemo(
    () => (onlyMacFindings ? cdpMacRows.filter((row) => !row.inL2 || row.topologyMismatch) : cdpMacRows),
    [cdpMacRows, onlyMacFindings],
  );
  const l2DiscoveryDisplay = useMemo(
    () => (onlyUnknownL2 ? l2DiscoveryRows.filter((row) => row.classification === "unknown") : l2DiscoveryRows),
    [l2DiscoveryRows, onlyUnknownL2],
  );

  const confirmedCount = useMemo(() => allRows.filter((r) => r.matchStatus === "confirmed-cdp").length, [allRows]);
  const documentedOnlyCount = useMemo(() => allRows.filter((r) => r.matchStatus === "documented-only").length, [allRows]);
  const unknownCount = useMemo(() => allRows.filter((r) => r.matchStatus === "unknown").length, [allRows]);
  const statusConflictCount = useMemo(() => allRows.filter((r) => r.statusConflict).length, [allRows]);
  const labelConflictCount = useMemo(() => allRows.filter((r) => r.labelConflict).length, [allRows]);

  if (isLoading) return <PanelLoadingState />;

  if (allRows.length === 0 && cdpMacRows.length === 0 && l2DiscoveryRows.length === 0) {
    return (
      <EmptyState
        icon={<ListChecks className="h-6 w-6" />}
        title="Keine Daten für die Kontrolle"
        description="Laden Sie Eramon-Exporte auf der Upload-Seite hoch, um Switch-Ports gegen CDP-, RVTools-, TechInfo- und IPAM-Daten abzugleichen."
        actionLabel="Zum Upload"
        actionTo="/upload"
      />
    );
  }

  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard title="Ports gesamt" value={formatNum(allRows.length)} icon={<ListChecks className="h-4 w-4" />} info={NET_AUDIT_KPI.totalPorts} />
        <KpiCard title="CDP-bestätigt" value={formatNum(confirmedCount)} severity="ok" icon={<CheckCircle2 className="h-4 w-4" />} info={NET_AUDIT_KPI.cdpConfirmed} />
        <KpiCard title="Nur dokumentiert" value={formatNum(documentedOnlyCount)} severity={documentedOnlyCount > 0 ? "warn" : "ok"} icon={<Archive className="h-4 w-4" />} info={NET_AUDIT_KPI.documentedOnly} />
        <KpiCard title="Unbekannt" value={formatNum(unknownCount)} severity={unknownCount > 0 ? "warn" : "ok"} icon={<HelpCircle className="h-4 w-4" />} info={NET_AUDIT_KPI.unknown} />
        <KpiCard title="Status-Konflikte" value={formatNum(statusConflictCount)} severity={statusConflictCount > 0 ? "warn" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} info={NET_AUDIT_KPI.statusConflicts} />
        <KpiCard title="Beschriftungs-Konflikte" value={formatNum(labelConflictCount)} severity={labelConflictCount > 0 ? "warn" : "ok"} icon={<Tag className="h-4 w-4" />} info={NET_AUDIT_KPI.labelConflicts} />
      </KpiGrid>

      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Switch-Ports ({rows.length} von {allRows.length})</h3>
          <label htmlFor="only-notable" className="flex cursor-pointer items-center gap-3 rounded-md bg-background/70 px-3 py-2 text-xs font-medium">
            <span>Nur Auffälligkeiten</span>
            <ToggleSwitch id="only-notable" checked={onlyNotable} onCheckedChange={setOnlyNotable} aria-label="Nur auffällige Ports anzeigen" />
          </label>
        </div>
        <VirtualTable data={rows} columns={columns} globalFilter={filters.search} height={500} exportFileName="network-audit" />
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-card/60" aria-labelledby="host-quality-heading">
        <div className="border-b border-border bg-muted/20 px-4 py-4 sm:px-5">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div className="flex items-start gap-3">
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-2 text-primary"><Database className="h-4 w-4" /></div>
              <div>
                <h3 id="host-quality-heading" className="text-sm font-semibold">Host-Datenabgleich</h3>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">Gleicht ESXi-Namen aus RVTools und Tech-Info mit IPAM ab. Die Netze werden aus den IPAM-Adressen als IPv4-/24 bzw. IPv6-/64 abgeleitet.</p>
              </div>
            </div>
            <label htmlFor="only-host-gaps" className="flex cursor-pointer items-center gap-3 rounded-md border bg-background/70 px-3 py-2 text-xs font-medium">
              <span>Nur Datenlücken</span>
              <ToggleSwitch id="only-host-gaps" checked={onlyHostGaps} onCheckedChange={setOnlyHostGaps} aria-label="Nur Host-Datenlücken anzeigen" />
            </label>
          </div>
        </div>

        <div className="space-y-6 p-4 sm:p-5">
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><Server className="h-4 w-4 text-primary" /><h4 className="text-sm font-semibold">ESXi aus RVTools ({rvtoolsHostRows.length} von {hostQuality.rvtoolsRows.length})</h4></div>
              <span className="text-xs text-muted-foreground">Startpunkt: vCenter-Inventar</span>
            </div>
            <VirtualTable data={rvtoolsHostRows} columns={rvtoolsHostColumns} globalFilter={filters.search} height={360} exportFileName="host-data-quality-rvtools" />
          </div>
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><Database className="h-4 w-4 text-primary" /><h4 className="text-sm font-semibold">Objekte aus Tech-Info ({techInfoHostRows.length} von {hostQuality.techInfoRows.length})</h4></div>
              <span className="text-xs text-muted-foreground">Startpunkt: technische Dokumentation</span>
            </div>
            <VirtualTable data={techInfoHostRows} columns={techInfoHostColumns} globalFilter={filters.search} height={360} exportFileName="host-data-quality-techinfo" />
          </div>
        </div>
      </section>

      {(cdpMacRows.length > 0 || l2DiscoveryRows.length > 0) && (
        <section className="overflow-hidden rounded-xl border border-border bg-card/60" aria-labelledby="mac-audit-heading">
          <div className="border-b border-border bg-muted/20 px-4 py-4 sm:px-5">
            <div className="flex items-start gap-3">
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-2 text-primary"><Radar className="h-4 w-4" /></div>
              <div>
                <h3 id="mac-audit-heading" className="text-sm font-semibold">MAC-Abgleich (Eramon L2)</h3>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">Gleicht die MAC-Adressen der ESXi-Adapter (CDP) mit der Eramon-L2-Tabelle ab und klassifiziert alle am Netz gelernten MACs. MAC-Formate werden dafür kanonisiert.</p>
              </div>
            </div>
          </div>

          <div className="space-y-6 p-4 sm:p-5">
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2"><Server className="h-4 w-4 text-primary" /><h4 className="text-sm font-semibold">ESXi-Adapter in L2 ({cdpMacDisplay.length} von {cdpMacRows.length})</h4></div>
                <label htmlFor="only-mac-findings" className="flex cursor-pointer items-center gap-3 rounded-md border bg-background/70 px-3 py-2 text-xs font-medium">
                  <span>Nur Auffälligkeiten</span>
                  <ToggleSwitch id="only-mac-findings" checked={onlyMacFindings} onCheckedChange={setOnlyMacFindings} aria-label="Nur auffällige Adapter anzeigen" />
                </label>
              </div>
              <VirtualTable data={cdpMacDisplay} columns={cdpMacColumns} globalFilter={filters.search} height={360} exportFileName="mac-audit-cdp" />
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2"><Radar className="h-4 w-4 text-primary" /><h4 className="text-sm font-semibold">Netz-Discovery ({l2DiscoveryDisplay.length} von {l2DiscoveryRows.length})</h4></div>
                <label htmlFor="only-unknown-l2" className="flex cursor-pointer items-center gap-3 rounded-md border bg-background/70 px-3 py-2 text-xs font-medium">
                  <span>Nur Unbekannte</span>
                  <ToggleSwitch id="only-unknown-l2" checked={onlyUnknownL2} onCheckedChange={setOnlyUnknownL2} aria-label="Nur unbekannte MACs anzeigen" />
                </label>
              </div>
              <VirtualTable data={l2DiscoveryDisplay} columns={l2DiscoveryColumns} globalFilter={filters.search} height={360} exportFileName="mac-discovery" />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
