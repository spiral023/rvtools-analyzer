import { useMemo } from "react";
import { Cpu, HardDrive, Network as NetworkIcon, Wrench, Camera } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import type { NormalizedVm, SheetRow } from "@/domain/models/types";
import { formatBytes } from "@/lib/xlsx/parseHelpers";
import { formatRvtoolsDate, summarizeSnapshots, summarizeStorage } from "@/lib/vmDetail";
import { boolLabel, sheetRowKey, str, toNumber } from "@/lib/vmDetailFormat";

interface VmTechnicalSectionsProps {
  vm: NormalizedVm;
  cpuRows: SheetRow[];
  memoryRows: SheetRow[];
  diskRows: SheetRow[];
  partitionRows: SheetRow[];
  networkRows: SheetRow[];
  snapshotRows: SheetRow[];
  toolsRows: SheetRow[];
}

export function VmTechnicalSections({
  vm,
  cpuRows,
  memoryRows,
  diskRows,
  partitionRows,
  networkRows,
  snapshotRows,
  toolsRows,
}: VmTechnicalSectionsProps) {
  const cpu = cpuRows[0]?.data ?? {};
  const memory = memoryRows[0]?.data ?? {};
  const tools = toolsRows[0]?.data ?? {};

  const sortedSnapshots = useMemo(
    () =>
      snapshotRows.slice().sort((a, b) => {
        const av = toNumber(a.data["Date / time"]);
        const bv = toNumber(b.data["Date / time"]);
        if (av !== null && bv !== null) return bv - av;
        const ad = Date.parse(str(a.data["Date / time"]));
        const bd = Date.parse(str(b.data["Date / time"]));
        if (!Number.isNaN(ad) && !Number.isNaN(bd)) return bd - ad;
        return str(a.data["Name"]).localeCompare(str(b.data["Name"]), "de-DE", {
          numeric: true,
          sensitivity: "base",
        });
      }),
    [snapshotRows],
  );

  const storageSummary = useMemo(() => summarizeStorage(diskRows), [diskRows]);
  const snapshotSummary = useMemo(() => summarizeSnapshots(snapshotRows), [snapshotRows]);

  return (
    <>
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <Cpu className="h-3.5 w-3.5" /> CPU & Arbeitsspeicher
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ["vCPU", String(vm.cpuCount ?? toNumber(cpu["CPUs"]) ?? "—")],
            ["Sockets", String(toNumber(cpu["Sockets"]) ?? "—")],
            ["Cores/Sockel", String(toNumber(cpu["Cores p/s"]) ?? "—")],
            ["Memory Size", formatBytes(toNumber(memory["Size MiB"]) ?? vm.memoryMiB)],
            ["Memory Active", formatBytes(toNumber(memory["Active"]))],
            ["Memory Consumed", formatBytes(toNumber(memory["Consumed"]))],
            ["Memory Ballooned", formatBytes(toNumber(memory["Ballooned"]))],
            ["Memory Swapped", formatBytes(toNumber(memory["Swapped"]))],
            ["CPU Reservation", String(toNumber(cpu["Reservation"]) ?? "—")],
            ["CPU Limit", String(toNumber(cpu["Limit"]) ?? "—")],
            ["Mem Reservation", String(toNumber(memory["Reservation"]) ?? "—")],
            ["Mem Limit", String(toNumber(memory["Limit"]) ?? "—")],
            ["CPU Hot Add", boolLabel(cpu["Hot Add"])],
            ["CPU Hot Remove", boolLabel(cpu["Hot Remove"])],
            ["Memory Hot Add", boolLabel(memory["Hot Add"])],
            ["Consolidation Needed", vm.consolidationNeeded == null ? "—" : vm.consolidationNeeded ? "Ja" : "Nein"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-muted/40 px-3 py-2">
              <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
              <p className="text-sm font-bold font-mono-data">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <HardDrive className="h-3.5 w-3.5" /> Storage
        </h4>
        <div className="mb-3 grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="rounded-lg bg-muted/40 px-3 py-2">
            <p className="text-[10px] uppercase text-muted-foreground">Disks</p>
            <p className="text-sm font-bold font-mono-data">{storageSummary.diskCount}</p>
          </div>
          <div className="rounded-lg bg-muted/40 px-3 py-2">
            <p className="text-[10px] uppercase text-muted-foreground">Disk Capacity</p>
            <p className="text-sm font-bold font-mono-data">{formatBytes(storageSummary.totalCapacityMiB)}</p>
          </div>
          <div className="rounded-lg bg-muted/40 px-3 py-2">
            <p className="text-[10px] uppercase text-muted-foreground">Provisioned</p>
            <p className="text-sm font-bold font-mono-data">{formatBytes(vm.provisionedMiB)}</p>
          </div>
        </div>

        {diskRows.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Keine Disk-Daten gefunden</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Disk</th>
                  <th className="py-2 pr-3">Capacity</th>
                  <th className="py-2 pr-3">Mode</th>
                  <th className="py-2 pr-3">Thin</th>
                  <th className="py-2 pr-3">Controller</th>
                  <th className="py-2 pr-3">Path</th>
                </tr>
              </thead>
              <tbody>
                {diskRows.map((row) => (
                  <tr key={sheetRowKey(row, str(row.data["Disk Key"]))} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                    <td className="py-2 pr-3 font-mono-data font-semibold">{str(row.data["Disk"]) || "—"}</td>
                    <td className="py-2 pr-3 font-mono-data">{formatBytes(toNumber(row.data["Capacity MiB"]))}</td>
                    <td className="py-2 pr-3">{str(row.data["Disk Mode"]) || "—"}</td>
                    <td className="py-2 pr-3">{boolLabel(row.data["Thin"])}</td>
                    <td className="py-2 pr-3">{str(row.data["Controller"]) || "—"}</td>
                    <td className="py-2 pr-3 max-w-[320px] truncate" title={str(row.data["Disk Path"])}>
                      {str(row.data["Disk Path"]) || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4">
          <h5 className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            Partitionen ({partitionRows.length})
          </h5>
          {partitionRows.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Keine Partition-Daten gefunden</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase text-muted-foreground">
                    <th className="py-2 pr-3">Disk</th>
                    <th className="py-2 pr-3">Capacity</th>
                    <th className="py-2 pr-3">Consumed</th>
                    <th className="py-2 pr-3">Free</th>
                    <th className="py-2 pr-3">Free %</th>
                  </tr>
                </thead>
                <tbody>
                  {partitionRows.map((row) => (
                    <tr key={sheetRowKey(row, str(row.data["Disk Key"]))} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-3 max-w-[260px] truncate" title={str(row.data["Disk"])}>
                        {str(row.data["Disk"]) || "—"}
                      </td>
                      <td className="py-2 pr-3 font-mono-data">{formatBytes(toNumber(row.data["Capacity MiB"]))}</td>
                      <td className="py-2 pr-3 font-mono-data">{formatBytes(toNumber(row.data["Consumed MiB"]))}</td>
                      <td className="py-2 pr-3 font-mono-data">{formatBytes(toNumber(row.data["Free MiB"]))}</td>
                      <td className="py-2 pr-3 font-mono-data">
                        {toNumber(row.data["Free %"]) == null ? "—" : `${toNumber(row.data["Free %"])?.toFixed(1)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <Separator />

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <NetworkIcon className="h-3.5 w-3.5" /> Netzwerk, Tools & Snapshots
        </h4>

        <div className="mb-4">
          <h5 className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            Netzwerkadapter ({networkRows.length})
          </h5>
          {networkRows.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Keine Netzwerkdaten gefunden</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase text-muted-foreground">
                    <th className="py-2 pr-3">NIC</th>
                    <th className="py-2 pr-3">Adapter</th>
                    <th className="py-2 pr-3">Network</th>
                    <th className="py-2 pr-3">Switch</th>
                    <th className="py-2 pr-3">Connected</th>
                    <th className="py-2 pr-3">MAC</th>
                    <th className="py-2 pr-3">IPv4</th>
                  </tr>
                </thead>
                <tbody>
                  {networkRows.map((row) => (
                    <tr key={sheetRowKey(row, str(row.data["NIC label"]))} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-3 font-mono-data">{str(row.data["NIC label"]) || "—"}</td>
                      <td className="py-2 pr-3">{str(row.data["Adapter"]) || "—"}</td>
                      <td className="py-2 pr-3">{str(row.data["Network"]) || "—"}</td>
                      <td className="py-2 pr-3">{str(row.data["Switch"]) || "—"}</td>
                      <td className="py-2 pr-3">{boolLabel(row.data["Connected"])}</td>
                      <td className="py-2 pr-3 font-mono-data">{str(row.data["Mac Address"]) || "—"}</td>
                      <td className="py-2 pr-3 font-mono-data">{str(row.data["IPv4 Address"]) || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border/60 bg-card px-4 py-3">
            <h5 className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Wrench className="h-3.5 w-3.5" /> VMware Tools
            </h5>
            {toolsRows.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Keine Tools-Daten gefunden</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  ["Status", str(tools["Tools"]) || "—"],
                  ["Version", str(tools["Tools Version"]) || "—"],
                  ["Required Version", str(tools["Required Version"]) || "—"],
                  ["Upgradeable", boolLabel(tools["Upgradeable"])],
                  ["Upgrade Policy", str(tools["Upgrade Policy"]) || "—"],
                  ["App status", str(tools["App status"]) || "—"],
                  ["Heartbeat", str(tools["Heartbeat status"]) || "—"],
                  ["Operation Ready", str(tools["Operation Ready"]) || "—"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded bg-muted/40 px-2 py-1.5">
                    <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
                    <p className="font-mono-data">{value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border/60 bg-card px-4 py-3">
            <h5 className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Camera className="h-3.5 w-3.5" /> Snapshots ({snapshotSummary.snapshotCount})
            </h5>
            <div className="mb-2 rounded bg-muted/40 px-2 py-1.5 text-xs">
              <span className="text-muted-foreground">Total Size: </span>
              <span className="font-mono-data">{formatBytes(snapshotSummary.totalSizeMiB)}</span>
            </div>
            {sortedSnapshots.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Keine Snapshot-Daten gefunden</p>
            ) : (
              <div className="space-y-2">
                {sortedSnapshots.map((row) => (
                  <div key={sheetRowKey(row, str(row.data["Name"]))} className="rounded bg-muted/40 px-2 py-1.5 text-xs">
                    <p className="font-medium truncate" title={str(row.data["Name"])}>
                      {str(row.data["Name"]) || "Unnamed Snapshot"}
                    </p>
                    <p className="text-muted-foreground">
                      {formatRvtoolsDate(row.data["Date / time"])} · {formatBytes(toNumber(row.data["Size MiB (total)"]))}
                    </p>
                    <p className="text-muted-foreground">
                      State: {str(row.data["State"]) || "—"} · Quiesced: {boolLabel(row.data["Quiesced"])}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
