import { useMemo } from "react";
import { useActiveSnapshotIds, useRawSheet } from "@/hooks/useActiveSnapshots";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { Network, Router, Cable, Server, GitCompare, AlertTriangle, Layers } from "lucide-react";
import { formatNum } from "@/lib/xlsx/parseHelpers";
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
  { accessorKey: "label", header: "Variante", cell: ({ getValue }) => <span className="font-mono-data font-semibold">{getValue() as string}</span> },
  { accessorKey: "hostCount", header: "Hosts" },
  { accessorKey: "clusters", header: "Cluster", cell: ({ getValue }) => { const v = getValue() as string; return <div className="max-w-[200px] truncate" title={v}>{v || "—"}</div>; } },
  { accessorKey: "nicCount", header: "NICs/Host" },
  { accessorKey: "summary", header: "Belegung (vmnic → Switch / Uplink)", cell: ({ getValue }) => { const v = getValue() as string; return <div className="max-w-[460px] truncate font-mono-data text-xs" title={v}>{v}</div>; } },
  { accessorKey: "hosts", header: "Host-Namen", cell: ({ getValue }) => { const v = getValue() as string; return <div className="max-w-[220px] truncate text-xs text-muted-foreground" title={v}>{v}</div>; } },
];

const driftColumns: ColumnDef<DriftRow, unknown>[] = [
  { accessorKey: "host", header: "Host" },
  { accessorKey: "cluster", header: "Cluster" },
  { accessorKey: "isVariant", header: "Ist-Variante", cell: ({ getValue }) => <span className="text-destructive font-semibold font-mono-data">{getValue() as string}</span> },
  { accessorKey: "expected", header: "Soll (Cluster-Mehrheit)", cell: ({ getValue }) => <span className="text-success font-mono-data">{getValue() as string}</span> },
];

const dvsColumns: ColumnDef<DvsRow, unknown>[] = [
  { accessorKey: "name", header: "vDS" },
  { accessorKey: "version", header: "Version" },
  { accessorKey: "maxMtu", header: "Max MTU", cell: ({ getValue }) => { const v = getValue() as number; return <span className={v && v !== 1500 && v !== 9000 ? "text-warning" : ""}>{v || "—"}</span>; } },
  { accessorKey: "ports", header: "# Ports", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "members", header: "Host Members" },
  { accessorKey: "uplinksPerHost", header: "Uplinks/Host" },
  { accessorKey: "consistent", header: "Einheitlich", cell: ({ row }) => { if (row.original.uplinksPerHost === "—") return <span className="text-muted-foreground">— (keine Uplinks im Snapshot)</span>; return row.original.consistent ? <span className="text-success">Ja</span> : <span className="text-warning font-semibold">Nein</span>; } },
];

const nicColumns: ColumnDef<NicDetailRow, unknown>[] = [
  { accessorKey: "host", header: "Host" },
  { accessorKey: "cluster", header: "Cluster" },
  { accessorKey: "device", header: "vmnic" },
  { accessorKey: "speed", header: "Speed (Mbps)", cell: ({ getValue }) => formatNum(getValue() as number) },
  { accessorKey: "switchName", header: "Switch", cell: ({ getValue }) => { const v = getValue() as string; return v || <span className="text-warning">nicht zugewiesen</span>; } },
  { accessorKey: "switchType", header: "Typ", cell: ({ getValue }) => { const v = getValue() as string; return <span className={v === "Distributed" ? "text-info" : v === "Standard" ? "" : "text-muted-foreground"}>{v}</span>; } },
  { accessorKey: "uplink", header: "Uplink-Port", cell: ({ getValue }) => { const v = getValue() as string; return v || "—"; } },
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

export default function HostNetwork() {
  const { snapshots, filters } = useActiveSnapshotIds();
  const { data: rawNIC = [] } = useRawSheet("vNIC");
  const { data: rawVSwitch = [] } = useRawSheet("vSwitch");
  const { data: rawDvSwitch = [] } = useRawSheet("dvSwitch");

  // Pro Host die NIC-Belegung samt Switch-Typ und Fingerprint aufbauen.
  const hostConfigs = useMemo<HostConfig[]>(() => {
    // Achtung: In vNIC/dvPort wird der dvSwitch über seinen Identifier ("Switch")
    // referenziert, nicht über den (oft mehrfach gleichen) Anzeigenamen ("Name").
    const dvsNames = new Set(rawDvSwitch.map((r) => s(r.data["Switch"])).filter(Boolean));
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
  const { variants, driftRows } = useMemo(() => {
    // Gruppierung nach Fingerprint → Varianten.
    const grouped = new Map<string, { hosts: string[]; clusters: Set<string>; nicCount: number; summary: string }>();
    for (const cfg of hostConfigs) {
      const g = grouped.get(cfg.fp) || { hosts: [], clusters: new Set<string>(), nicCount: cfg.nics.length, summary: cfg.summary };
      g.hosts.push(cfg.host);
      if (cfg.cluster) g.clusters.add(cfg.cluster);
      grouped.set(cfg.fp, g);
    }
    const sorted = [...grouped.entries()].sort((a, b) => b[1].hosts.length - a[1].hosts.length);
    const fpToLabel = new Map<string, string>();
    const variants: VariantRow[] = sorted.map(([fp, g], i) => {
      const label = `V${i + 1}`;
      fpToLabel.set(fp, label);
      return {
        label,
        hostCount: g.hosts.length,
        clusters: [...g.clusters].sort().join(", "),
        nicCount: g.nicCount,
        summary: g.summary,
        hosts: g.hosts.sort().join(", "),
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
    return { variants, driftRows };
  }, [hostConfigs]);

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
    return hostConfigs.flatMap((cfg) =>
      cfg.nics.map((n) => ({ host: cfg.host, cluster: cfg.cluster, device: n.device, speed: 0, switchName: n.switchName, switchType: n.switchType, uplink: n.uplink })),
    ).map((row) => {
      // Speed aus der Roh-Zeile nachziehen (nicht im HostConfig gespeichert).
      const raw = rawNIC.find((r) => s(r.data["Host"]) === row.host && s(r.data["Network Device"]) === row.device);
      return { ...row, speed: Number(raw?.data["Speed"] || 0) };
    }).sort((a, b) => a.host.localeCompare(b.host, "de-DE") || collator.compare(a.device, b.device));
  }, [hostConfigs, rawNIC]);

  // KPIs
  const hostCount = hostConfigs.length;
  const vssNames = useMemo(() => new Set(rawVSwitch.map((r) => s(r.data["Switch"])).filter(Boolean)), [rawVSwitch]);
  const totalUplinks = nicDetail.filter((n) => n.switchName !== "").length;

  if (snapshots.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold">Host-Netzwerk</h1>
        <EmptyState icon={<Network className="h-6 w-6" />} title="Keine Daten" description="Laden Sie RVTools-Daten hoch." actionLabel="Zum Upload" actionTo="/upload" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Host-Netzwerk</h1>
      <p className="text-sm text-muted-foreground -mt-3">vmnic-zu-Switch-Belegung der Hosts, aggregierte Konfigurations-Varianten und vDS-Übersicht. Infrastruktur-Sicht — nicht vom globalen VM-Filter betroffen.</p>
      <FilterBar />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
        <KpiCard title="Hosts" value={formatNum(hostCount)} icon={<Server className="h-4 w-4" />} />
        <KpiCard title="vDS" value={formatNum(rawDvSwitch.length)} icon={<Router className="h-4 w-4" />} />
        <KpiCard title="vSwitch (Std.)" value={formatNum(vssNames.size)} icon={<Network className="h-4 w-4" />} />
        <KpiCard title="Uplinks gesamt" value={formatNum(totalUplinks)} icon={<Cable className="h-4 w-4" />} />
        <KpiCard title="Konfig-Varianten" value={formatNum(variants.length)} severity={variants.length > 1 ? "warn" : "ok"} icon={<GitCompare className="h-4 w-4" />} />
        <KpiCard title="Drift-Hosts" value={formatNum(driftRows.length)} severity={driftRows.length > 0 ? "crit" : "ok"} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      {driftRows.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-card/30 p-4">
          <h3 className="mb-2 text-sm font-semibold text-destructive">Konfigurations-Abweichungen ({driftRows.length})</h3>
          <p className="text-xs text-muted-foreground mb-3">Hosts, deren vmnic-Belegung von der Mehrheit ihres Clusters abweicht — potenzieller Standardisierungs-Drift.</p>
          <VirtualTable data={driftRows} columns={driftColumns} globalFilter={filters.search} height={Math.min(300, 80 + driftRows.length * 40)} />
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Konfigurations-Varianten ({variants.length})</h3>
        <VirtualTable data={variants} columns={variantColumns} globalFilter={filters.search} height={Math.min(360, 80 + variants.length * 44)} />
      </div>

      {dvsRows.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">vDS-Membership ({dvsRows.length})</h3>
          <VirtualTable data={dvsRows} columns={dvsColumns} globalFilter={filters.search} height={Math.min(320, 80 + dvsRows.length * 44)} />
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground flex items-center gap-2"><Layers className="h-4 w-4" /> Uplink-Belegung Detail ({nicDetail.length})</h3>
        <VirtualTable data={nicDetail} columns={nicColumns} globalFilter={filters.search} height={400} />
      </div>
    </div>
  );
}
