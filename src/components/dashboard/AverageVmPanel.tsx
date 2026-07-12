import { Cpu, HardDrive, MemoryStick, Layers, Network } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { OVERVIEW_SECTIONS } from "@/lib/glossary";
import { formatBytes, formatNum } from "@/lib/xlsx/parseHelpers";
import type { AverageVm } from "@/lib/averageVm";

/** Zahl mit einer Nachkommastelle im deutschen Format (z. B. 4,6). */
function decimal(value: number, maximumFractionDigits = 1): string {
  return value.toLocaleString("de-DE", { maximumFractionDigits });
}

interface MemoryBarProps {
  label: string;
  valueMiB: number;
  sizeMiB: number;
  tone: "primary" | "success";
}

/**
 * Signature-Element: ein schlanker Auslastungsbalken, dessen Füllung dem Anteil an der
 * durchschnittlichen RAM-Größe entspricht. `belegt` und `aktiv` teilen sich dieselbe Skala,
 * damit beide Werte direkt vergleichbar sind (nicht additiv gestapelt).
 */
function MemoryBar({ label, valueMiB, sizeMiB, tone }: MemoryBarProps) {
  const pct = sizeMiB > 0 ? Math.min(100, Math.max(0, (valueMiB / sizeMiB) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono-data text-foreground">
          {formatBytes(valueMiB)} <span className="text-muted-foreground">· {pct.toFixed(0)} %</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none ${
            tone === "primary" ? "bg-primary" : "bg-success"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface StatTileProps {
  icon: React.ReactNode;
  value: string;
  label: string;
}

function StatTile({ icon, value, label }: StatTileProps) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1 font-mono-data text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function AverageVmPanel({ avg }: { avg: AverageVm | null }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/30 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <InfoTooltip entry={OVERVIEW_SECTIONS.averageVm} side="bottom">
          <h3 className="w-fit cursor-help text-sm font-semibold text-muted-foreground">
            Durchschnittliche VM
          </h3>
        </InfoTooltip>
        {avg && (
          <span className="text-xs text-muted-foreground">⌀ über {formatNum(avg.vmCount)} VMs</span>
        )}
      </div>

      {!avg ? (
        <p className="py-10 text-center text-sm italic text-muted-foreground">
          Keine VMs im aktuellen Filter.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,1.15fr)]">
          {/* Hero: die prägenden zwei Kennwerte einer typischen VM */}
          <div className="flex flex-col justify-center gap-4">
            <div>
              <p className="flex items-baseline gap-1.5 font-mono-data text-4xl font-bold text-primary">
                {decimal(avg.cpuCores)}
                <span className="text-base font-medium text-muted-foreground">vCPU</span>
              </p>
              <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                Kerne je VM
              </p>
            </div>
            <div className="h-px bg-border/60" />
            <div>
              <p className="font-mono-data text-4xl font-bold text-foreground">
                {formatBytes(avg.memorySizeMiB)}
              </p>
              <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                Arbeitsspeicher
              </p>
            </div>
          </div>

          {/* Memory-Auslastung: das grafische Signature-Element */}
          <div className="flex flex-col justify-center gap-3">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MemoryStick className="h-3.5 w-3.5" />
              <span className="text-[10px] uppercase tracking-wide">Arbeitsspeicher-Nutzung</span>
            </div>
            <MemoryBar label="belegt" valueMiB={avg.memoryConsumedMiB} sizeMiB={avg.memorySizeMiB} tone="primary" />
            <MemoryBar label="aktiv" valueMiB={avg.memoryActiveMiB} sizeMiB={avg.memorySizeMiB} tone="success" />
            <p className="text-[11px] text-muted-foreground">
              Anteile bezogen auf die durchschnittliche RAM-Größe von {formatBytes(avg.memorySizeMiB)}.
            </p>
          </div>

          {/* Restliche Kennwerte je VM */}
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <StatTile icon={<HardDrive className="h-3.5 w-3.5" />} value={decimal(avg.disksPerVm)} label="Disks" />
              <StatTile
                icon={<Cpu className="h-3.5 w-3.5" />}
                value={formatBytes(avg.diskProvisionedMiB)}
                label="Provisioniert"
              />
              <StatTile icon={<Layers className="h-3.5 w-3.5" />} value={decimal(avg.partitionsPerVm)} label="Partitionen" />
              <StatTile icon={<Network className="h-3.5 w-3.5" />} value={decimal(avg.nicsPerVm, 2)} label="NICs" />
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Partitionen: {formatBytes(avg.partitionConsumedMiB)} belegt von {formatBytes(avg.partitionCapacityMiB)}
              {" · "}
              {formatBytes(avg.partitionFreeMiB)} frei
              {avg.partitionFreePct !== null && ` (${avg.partitionFreePct.toFixed(0)} % frei)`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
