import { useMemo, useState } from "react";
import { useActiveSnapshotIds, useRawSheet } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { useHostDetailDialog } from "@/hooks/useHostDetailDialog";
import { VariantDetailDialog, type VariantDetail } from "@/components/network/VariantDetailDialog";
import { Network, Router, Cable, Server, GitCompare, AlertTriangle, Layers } from "lucide-react";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  NET_HOST_KPI,
  NET_VARIANT_COLUMNS,
  NET_DRIFT_COLUMNS,
  NET_DVS_COLUMNS,
  NET_NICDETAIL_COLUMNS,
  NET_HOST_SECTIONS,
} from "@/lib/glossaries/networking";
import type { ColumnDef } from "@tanstack/react-table";

/* ------------------------------------------------------------------ */
/*  Typen                                                              */
/* ------------------------------------------------------------------ */

interface NicDetailRow { host: string; cluster: string; device: string; speed: number; switchName: string; switchType: string; uplink: string }
interface VariantRow { label: string; hostCount: number; clusters: string; nicCount: number; summary: string; hosts: string }
interface DriftRow { host: string; cluster: string; isVariant: string; expected: string }
interface DvsRow { name: string; version: string; maxMtu: number; ports: number; members: number; uplinksPerHost: string; consistent: boolean }

interface HostConfig { host: string; cluster: string; nics: { device: string; switchName: string; switchType: string; uplink: string }[]; fp: string; summary: string }

/* ------------------------------------------------------------------ */
/*  Spalten                                                            */
/* ------------------------------------------------------------------ */

const variantColumns: ColumnDef<VariantRow, unknown>[] = [
  { accessorKey: "label", header: "Variante", meta: { info: NET_VARIANT_COLUMNS.label }, cell: ({ getValue }) => <span className="font-mono-data font-semibold">{getValue() as string}</span> },
  { accessorKey: "hostCount", header: "Hosts", meta: { info: NET_VARIANT_COLUMNS.hostCount } },
  { accessorKey: "clusters", header: "Cluster", meta: { info: NET_VARIANT_COLUMNS.clusters }, cell: ({ getValue }) => { const v = getValue() as string; return <div className="max-w-[200px] truncate" title={v}>{v || "—"}</div>; } },
  { accessorKey: "nicCount", header: "NICs/Host", meta: { info: NET_VARIANT_COLUMNS.nicCount } },
  { accessorKey: "summary", header: "Belegung (vmnic → Switch / Uplink)", meta: { info: NET_VARIANT_COLUMNS.summary }, cell: ({ getValue }) => { const v = getValue() as string; return <div className="max-w-[460px] truncate font-mono-data text-xs" title={v}>{v}</div>; } },
  { accessorKey: "hosts", header: "Host-Namen", meta: { info: NET_VARIANT_COLUMNS.hosts }, cell: ({ getValue }) => { const v = getValue() as string; return <div className="max-w-[220px] truncate text-xs text-muted-foreground" title={v}>{v}</div>; } },
];

const driftColumns: ColumnDef<DriftRow, unknown>[] = [
  { accessorKey: "host", header: "Host", meta: { info: NET_DRIFT_COLUMNS.host } },
  { accessorKey: "cluster", header: "Cluster", meta: { info: NET_DRIFT_COLUMNS.cluster } },
  { accessorKey: "isVariant", header: "Ist-Variante", meta: { info: NET_DRIFT_COLUMNS.isVariant }, cell: ({ getValue }) => <span className="text-destructive font-semibold font-mono-data">{getValue() as string}</span> },
  { accessorKey: "expected", header: "Soll (Cluster-Mehrheit)", meta: { info: NET_DRIFT_COLUMNS.expected }, cell: ({ getValue }) => <span className="text-success font-mono-data">{getValue() as string}</span> },
];

const dvsColumns: ColumnDef<DvsRow, unknown>[] = [
  { accessorKey: "name", header: "vDS", meta: { info: NET_DVS_COLUMNS.name } },
  { accessorKey: "version", header: "Version", meta: { info: NET_DVS_COLUMNS.version } },
  { accessorKey: "maxMtu", header: "Max MTU", meta: { info: NET_DVS_COLUMNS.maxMtu }, cell: ({ getValue }) => { const v = getValue() as number; return <span className={v && v !== 1500 && v !== 9000 ? "text-warning" : ""}>{v || "—"}</span>; } },
  { accessorKey: "ports", header: "# Ports", meta: { info: NET_DVS_COLUMNS.ports }, cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "members", header: "Host Members", meta: { info: NET_DVS_COLUMNS.members } },
  { accessorKey: "uplinksPerHost", header: "Uplinks/Host", meta: { info: NET_DVS_COLUMNS.uplinksPerHost } },
  { accessorKey: "consistent", header: "Einheitlich", meta: { info: NET_DVS_COLUMNS.consistent }, cell: ({ row }) => { if (row.original.uplinksPerHost === "—") return <span className="text-muted-foreground">— (keine Uplinks im Snapshot)</span>; return row.original.consistent ? <span className="text-success">Ja</span> : <span className="text-warning font-semibold">Nein</span>; } },
];

const nicColumns: ColumnDef<NicDetailRow, unknown>[] = [
  { accessorKey: "host", header: "Host", meta: { info: NET_NICDETAIL_COLUMNS.host } },
  { accessorKey: "cluster", header: "Cluster", meta: { info: NET_NICDETAIL_COLUMNS.cluster } },
  { accessorKey: "device", header: "vmnic", meta: { info: NET_NICDETAIL_COLUMNS.device } },
  { accessorKey: "speed", header: "Speed (Mbps)", meta: { info: NET_NICDETAIL_COLUMNS.speed }, cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "switchName", header: "Switch", meta: { info: NET_NICDETAIL_COLUMNS.switchName }, cell: ({ getValue }) => { const v = getValue() as string; return v || <span className="text-warning">nicht zugewiesen</span>; } },
  { accessorKey: "switchType", header: "Typ", meta: { info: NET_NICDETAIL_COLUMNS.switchType }, cell: ({ getValue }) => { const v = getValue() as string; return <span className={v === "Distributed" ? "text-info" : v === "Standard" ? "" : "text-muted-foreground"}>{v}</span>; } },
  { accessorKey: "uplink", header: "Uplink-Port", meta: { info: NET_NICDETAIL_COLUMNS.uplink }, cell: ({ getValue }) => { const v = getValue() as string; return v || "—"; } },
];

/* ------------------------------------------------------------------ */
/*  Helfer                                                             */
/* ------------------------------------------------------------------ */

function s(v: unknown): string { return v == null ? "" : String(v); }

// Lesbare Belegungs-Zusammenfassung, gruppiert nach Switch.
function buildSummary(nics: HostConfig["nics"]): string {
  const bySwitch = new Map<string, string[]>();
  for (const n of nics) {
    const key = n.switchName || "(kein Switch)";
    const arr = bySwitch.get(key) || [];
    arr.push(n.uplink ? `${n.device} (${n.uplink})` : n.device);
    bySwitch.set(key, arr);
  }
  return [...bySwitch.entries()].map(([sw, devs]) => `${sw}: ${devs.join(", ")}`).join("  |  ");
}

/* ------------------------------------------------------------------ */
/*  Seite                                                              */
/* ------------------------------------------------------------------ */

export function HostNetworkPanel() {
  const { filters } = useActiveSnapshotIds();
  const { openHostDetail, hostDetailDialog } = useHostDetailDialog();
  const [selectedVariantLabel, setSelectedVariantLabel] = useState<string | null>(null);
  const { data: rawNIC = [] } = useRawSheet("vNIC");
  const { data: rawVSwitch = [] } = useRawSheet("vSwitch");
  const { data: rawDvSwitch = [] } = useRawSheet("dvSwitch");

  // Pro Host die NIC-Belegung samt Switch-Typ und Fingerprint aufbauen.
  const hostConfigs = useMemo<HostConfig[]>(() => {
    // Achtung: In vNIC/dvPort wird der dvSwitch über seinen Identifier ("Switch")
    // referenziert, nicht über den (oft mehrfach gleichen) Anzeigenamen ("Name").
    const dvsNames = new Set<string>();
    for (const row of rawDvSwitch) {
      const switchName = s(row.data["Switch"]);
      if (switchName) dvsNames.add(switchName);
    }
    const map = new Map<string, HostConfig>();
    for (const r of rawNIC) {
      const host = s(r.data["Host"]);
      if (!host) continue;
      const switchName = s(r.data["Switch"]);
      const entry = map.get(host) || { host, cluster: s(r.data["Cluster"]), nics: [], fp: "", summary: "" };
      entry.nics.push({
        device: s(r.data["Network Device"]),
        switchName,
        switchType: switchName === "" ? "—" : dvsNames.has(switchName) ? "Distributed" : "Standard",
        uplink: s(r.data["Uplink port"]),
      });
      map.set(host, entry);
    }
    const collator = new Intl.Collator("de-DE", { numeric: true, sensitivity: "base" });
    for (const cfg of map.values()) {
      cfg.nics.sort((a, b) => collator.compare(a.device, b.device));
      cfg.fp = cfg.nics.map((n) => `${n.device}>${n.switchName}>${n.uplink}`).join("|");
      cfg.summary = buildSummary(cfg.nics);
    }
    return [...map.values()];
  }, [rawNIC, rawDvSwitch]);

  // Varianten (gruppiert nach Fingerprint) + Drift (Abweichung von der Cluster-Mehrheit).
  const { variants, driftRows, variantDetails } = useMemo(() => {
    // Speed je Host+Device für die Detailansicht nachschlagen.
    const speedByHostDevice = new Map<string, number>();
    for (const r of rawNIC) {
      speedByHostDevice.set(`${s(r.data["Host"])}|${s(r.data["Network Device"])}`, Number(r.data["Speed"] || 0));
    }
    // Gruppierung nach Fingerprint → Varianten.
    const grouped = new Map<string, { hosts: HostConfig[]; clusters: Set<string>; nicCount: number; summary: string }>();
    for (const cfg of hostConfigs) {
      const g = grouped.get(cfg.fp) || { hosts: [], clusters: new Set<string>(), nicCount: cfg.nics.length, summary: cfg.summary };
      g.hosts.push(cfg);
      if (cfg.cluster) g.clusters.add(cfg.cluster);
      grouped.set(cfg.fp, g);
    }
    const sorted = [...grouped.entries()].sort((a, b) => b[1].hosts.length - a[1].hosts.length);
    const fpToLabel = new Map<string, string>();
    const variantDetails = new Map<string, VariantDetail>();
    const variants: VariantRow[] = sorted.map(([fp, g], i) => {
      const label = `V${i + 1}`;
      fpToLabel.set(fp, label);
      variantDetails.set(label, {
        label,
        // Die Belegung ist per Fingerprint auf allen Hosts identisch → repräsentative NICs
        // vom ersten Host, Speeds über alle Hosts der Variante aggregiert.
        nics: g.hosts[0].nics.map((n) => ({
          ...n,
          speeds: g.hosts.map((h) => speedByHostDevice.get(`${h.host}|${n.device}`) ?? 0),
        })),
        hosts: g.hosts.map((h) => ({ host: h.host, cluster: h.cluster })),
        clusters: [...g.clusters].sort(),
      });
      return {
        label,
        hostCount: g.hosts.length,
        clusters: [...g.clusters].sort().join(", "),
        nicCount: g.nicCount,
        summary: g.summary,
        hosts: g.hosts.map((h) => h.host).sort().join(", "),
      };
    });

    // Drift: pro Cluster die häufigste Variante = Soll; abweichende Hosts = Drift.
    const byCluster = new Map<string, HostConfig[]>();
    for (const cfg of hostConfigs) {
      const arr = byCluster.get(cfg.cluster) || [];
      arr.push(cfg);
      byCluster.set(cfg.cluster, arr);
    }
    const driftRows: DriftRow[] = [];
    for (const [cluster, hosts] of byCluster) {
      if (hosts.length < 2) continue; // Einzel-Host: kein Soll ableitbar
      const fpCount = new Map<string, number>();
      for (const h of hosts) fpCount.set(h.fp, (fpCount.get(h.fp) || 0) + 1);
      const majorityFp = [...fpCount.entries()].sort((a, b) => b[1] - a[1])[0][0];
      for (const h of hosts) {
        if (h.fp !== majorityFp) {
          driftRows.push({ host: h.host, cluster, isVariant: fpToLabel.get(h.fp) || "?", expected: fpToLabel.get(majorityFp) || "?" });
        }
      }
    }
    driftRows.sort((a, b) => a.cluster.localeCompare(b.cluster, "de-DE") || a.host.localeCompare(b.host, "de-DE"));
    return { variants, driftRows, variantDetails };
  }, [hostConfigs, rawNIC]);

  // vDS-Membership inkl. abgeleiteter Uplinks/Host aus vNIC.
  const dvsRows = useMemo<DvsRow[]>(() => {
    return rawDvSwitch.map((r) => {
      // "Switch" = eindeutiger Identifier (Match-Key zu vNIC), "Name" = Anzeigename.
      const name = s(r.data["Switch"]);
      const perHost = new Map<string, number>();
      for (const n of rawNIC) {
        if (s(n.data["Switch"]) === name && name !== "") {
          const h = s(n.data["Host"]);
          perHost.set(h, (perHost.get(h) || 0) + 1);
        }
      }
      const counts = [...perHost.values()];
      const consistent = counts.length > 0 && counts.every((c) => c === counts[0]);
      const uplinksPerHost = counts.length === 0 ? "—" : consistent ? String(counts[0]) : `${Math.min(...counts)}–${Math.max(...counts)}`;
      return {
        name,
        version: s(r.data["Version"]),
        maxMtu: Number(r.data["Max MTU"] || 0),
        ports: Number(r.data["# Ports"] || 0),
        members: Number(r.data["Host members"] || 0),
        uplinksPerHost,
        consistent,
      };
    }).sort((a, b) => a.name.localeCompare(b.name, "de-DE"));
  }, [rawDvSwitch, rawNIC]);

  // Detail-Tabelle auf vmnic-Ebene.
  const nicDetail = useMemo<NicDetailRow[]>(() => {
    const collator = new Intl.Collator("de-DE", { numeric: true, sensitivity: "base" });
    const speedByHostAndDevice = new Map<string, number>();
    for (const row of rawNIC) {
      speedByHostAndDevice.set(`${s(row.data["Host"])}\0${s(row.data["Network Device"])}`, Number(row.data["Speed"] || 0));
    }
    const rows: NicDetailRow[] = [];
    for (const cfg of hostConfigs) {
      for (const nic of cfg.nics) {
        rows.push({
          host: cfg.host,
          cluster: cfg.cluster,
          device: nic.device,
          speed: speedByHostAndDevice.get(`${cfg.host}\0${nic.device}`) ?? 0,
          switchName: nic.switchName,
          switchType: nic.switchType,
          uplink: nic.uplink,
        });
      }
    }
    return rows.sort((a, b) => a.host.localeCompare(b.host, "de-DE") || collator.compare(a.device, b.device));
  }, [hostConfigs, rawNIC]);

  // KPIs
  const hostCount = hostConfigs.length;
  const vssNames = useMemo(() => {
    const names = new Set<string>();
    for (const row of rawVSwitch) {
      const switchName = s(row.data["Switch"]);
      if (switchName) names.add(switchName);
    }
    return names;
  }, [rawVSwitch]);
  const totalUplinks = nicDetail.filter((n) => n.switchName !== "").length;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">vmnic-zu-Switch-Belegung der Hosts, aggregierte Konfigurations-Varianten und vDS-Übersicht. Infrastruktur-Sicht — nicht vom globalen VM-Filter betroffen.</p>

      <KpiGrid>
        <KpiCard title="Hosts" value={formatNum(hostCount)} icon={<Server className="h-4 w-4" />} info={NET_HOST_KPI.hosts} />
        <KpiCard title="vDS" value={formatNum(rawDvSwitch.length)} icon={<Router className="h-4 w-4" />} info={NET_HOST_KPI.vds} />
        <KpiCard title="vSwitch (Std.)" value={formatNum(vssNames.size)} icon={<Network className="h-4 w-4" />} info={NET_HOST_KPI.vss} />
        <KpiCard title="Uplinks gesamt" value={formatNum(totalUplinks)} icon={<Cable className="h-4 w-4" />} info={NET_HOST_KPI.uplinks} />
        <KpiCard title="Konfig-Varianten" value={formatNum(variants.length)} severity={variants.length > 1 ? "warn" : "ok"} icon={<GitCompare className="h-4 w-4" />} info={NET_HOST_KPI.variants} />
        <KpiCard title="Drift-Hosts" value={formatNum(driftRows.length)} severity={driftRows.length > 0 ? "crit" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} info={NET_HOST_KPI.driftHosts} />
      </KpiGrid>

      {driftRows.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-card/30 p-4">
          <InfoTooltip entry={NET_HOST_SECTIONS.driftTable} side="bottom">
            <h3 className="mb-2 w-fit cursor-help text-sm font-semibold text-destructive">Konfigurations-Abweichungen ({driftRows.length})</h3>
          </InfoTooltip>
          <p className="text-xs text-muted-foreground mb-3">Hosts, deren vmnic-Belegung von der Mehrheit ihres Clusters abweicht — potenzieller Standardisierungs-Drift.</p>
          <VirtualTable data={driftRows} columns={driftColumns} globalFilter={filters.search} height={Math.min(300, 80 + driftRows.length * 40)} onRowClick={openHostDetail} />
        </div>
      )}

      <div>
        <InfoTooltip entry={NET_HOST_SECTIONS.variantTable} side="bottom">
          <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">Konfigurations-Varianten ({variants.length}) · Klick öffnet Detailansicht</h3>
        </InfoTooltip>
        <VirtualTable data={variants} columns={variantColumns} globalFilter={filters.search} height={Math.min(360, 80 + variants.length * 44)} onRowClick={(row) => setSelectedVariantLabel(row.label)} />
      </div>

      {dvsRows.length > 0 && (
        <div>
          <InfoTooltip entry={NET_HOST_SECTIONS.dvsTable} side="bottom">
            <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">vDS-Membership ({dvsRows.length})</h3>
          </InfoTooltip>
          <VirtualTable data={dvsRows} columns={dvsColumns} globalFilter={filters.search} height={Math.min(320, 80 + dvsRows.length * 44)} />
        </div>
      )}

      <div>
        <InfoTooltip entry={NET_HOST_SECTIONS.nicDetailTable} side="bottom">
          <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground flex items-center gap-2"><Layers className="h-4 w-4" /> Uplink-Belegung Detail ({nicDetail.length})</h3>
        </InfoTooltip>
        <VirtualTable data={nicDetail} columns={nicColumns} globalFilter={filters.search} height={400} onRowClick={openHostDetail} />
      </div>
      <VariantDetailDialog
        variant={selectedVariantLabel ? variantDetails.get(selectedVariantLabel) ?? null : null}
        open={!!selectedVariantLabel}
        onClose={() => setSelectedVariantLabel(null)}
        onHostClick={(host) => openHostDetail({ host })}
      />
      {hostDetailDialog}
    </div>
  );
}
