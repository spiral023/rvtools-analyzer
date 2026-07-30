import { Link } from "react-router-dom";
import { Activity, Database, HardDrive, Layers, Network } from "lucide-react";
import { AverageVmWeekProfile } from "@/components/dashboard/AverageVmWeekProfile";
import { DistributionStrip } from "@/components/dashboard/DistributionStrip";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { AverageVmWorkload } from "@/domain/services/averageVmWorkloadService";
import { OVERVIEW_SECTIONS } from "@/lib/glossary";
import { formatDemandMHz, formatDemandPct, toCapacityPct } from "@/lib/formatDemand";
import { formatBytes, formatNum } from "@/lib/xlsx/parseHelpers";
import type { AverageVm } from "@/lib/averageVm";
import { cn } from "@/lib/utils";

/** Zahl mit einer Nachkommastelle im deutschen Format (z. B. 4,6). */
function decimal(value: number, maximumFractionDigits = 1): string {
  return value.toLocaleString("de-DE", { maximumFractionDigits });
}

function percent(value: number, maximumFractionDigits = 0): string {
  return `${value.toLocaleString("de-DE", { maximumFractionDigits })} %`;
}

/**
 * Sektionsmarke: trennt, was einer VM zugeteilt wurde, von dem, was sie tatsächlich
 * beansprucht. Die Datenherkunft steht im Label, weil der zweite Block ohne
 * vROps-Zeitreihe entfällt.
 */
function SectionLabel({ title, source, meta }: { title: string; source: string; meta?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/70">
        {title}
        <span className="ml-2 font-normal tracking-wider text-muted-foreground">{source}</span>
      </h4>
      <div className="h-px min-w-6 flex-1 bg-border/60" />
      {meta && <p className="font-mono-data text-[11px] text-muted-foreground">{meta}</p>}
    </div>
  );
}

/** `note` trägt eine zweite Einheit derselben Zahl – etwa den Anteil an der zugeteilten CPU. */
function Hero({ value, unit, caption, note }: { value: string; unit?: string; caption: string; note?: string }) {
  return (
    <div>
      <p className="flex items-baseline gap-1.5 font-mono-data text-[2.25rem] font-bold leading-none tracking-tight text-foreground">
        {value}
        {unit && <span className="text-sm font-medium text-muted-foreground">{unit}</span>}
        {note && <span className="font-mono-data text-sm font-medium text-muted-foreground">· {note}</span>}
      </p>
      <p className="mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">{caption}</p>
    </div>
  );
}

/** Prozentangaben der Durchschnitts-VM beziehen sich immer auf deren Ø konfigurierte CPU-Kapazität. */
function hasCapacity(workload: AverageVmWorkload): boolean {
  return workload.configuredCpuCapacityMHz !== null && workload.configuredCpuCapacityMHz > 0;
}

function capacityPct(workload: AverageVmWorkload, valueMHz: number | null): string | undefined {
  const pct = toCapacityPct(valueMHz, workload.configuredCpuCapacityMHz);
  return pct === null ? undefined : formatDemandPct(pct, 1);
}

interface UsageBarProps {
  label: string;
  valueMiB: number;
  totalMiB: number;
  /** Warnstufen greifen nur dort, wo eine hohe Belegung ein Risiko ist (Partitionen). */
  thresholds?: { warn: number; critical: number };
}

/** Anteilsbalken auf gemeinsamer Prozentskala – beide Belegungen sind so direkt vergleichbar. */
function UsageBar({ label, valueMiB, totalMiB, thresholds }: UsageBarProps) {
  const pct = totalMiB > 0 ? Math.min(100, Math.max(0, (valueMiB / totalMiB) * 100)) : 0;
  const tone = !thresholds
    ? "bg-primary"
    : pct >= thresholds.critical
      ? "bg-destructive"
      : pct >= thresholds.warn
        ? "bg-warning"
        : "bg-primary";
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono-data text-foreground/90">
          {formatBytes(valueMiB)} <span className="text-muted-foreground">· {percent(pct)}</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none", tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatTile({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
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

export interface AverageVmPanelProps {
  avg: AverageVm | null;
  /** Beobachtete Last derselben Auswahl; `null`, solange keine passende vROps-Zeitreihe vorliegt. */
  workload: AverageVmWorkload | null;
  /** Unterscheidet „kein Import vorhanden" von „Import ohne Treffer im Filter". */
  hasVropsImport: boolean;
}

export function AverageVmPanel({ avg, workload, hasVropsImport }: AverageVmPanelProps) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/30 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <InfoTooltip entry={OVERVIEW_SECTIONS.averageVm} side="bottom">
          <h3 className="w-fit cursor-help text-sm font-semibold text-muted-foreground">Durchschnittliche VM</h3>
        </InfoTooltip>
        {avg && <span className="font-mono-data text-xs text-muted-foreground">⌀ über {formatNum(avg.vmCount)} VMs</span>}
      </div>

      {!avg ? (
        <p className="py-10 text-center text-sm italic text-muted-foreground">Keine VMs im aktuellen Filter.</p>
      ) : (
        <div className="space-y-5">
          <section className="space-y-4">
            <SectionLabel title="Zugeteilt" source="RVTools" />
            <div className="grid gap-x-6 gap-y-5 lg:grid-cols-3">
              <div className="space-y-3">
                <Hero value={decimal(avg.cpuCores)} unit="vCPU" caption="Kerne je VM" />
                <DistributionStrip
                  label="Verteilung über die VMs"
                  stats={avg.cpuCoreDistribution}
                  format={(value) => `${decimal(value, 0)}`}
                  info={OVERVIEW_SECTIONS.averageVmDistribution}
                  emptyHint="Keine vCPU-Angaben im Filter."
                />
              </div>
              <div className="space-y-3">
                <Hero value={formatBytes(avg.memorySizeMiB)} caption="Arbeitsspeicher je VM" />
                <DistributionStrip
                  label="Verteilung über die VMs"
                  stats={avg.memorySizeDistribution}
                  format={formatBytes}
                  info={OVERVIEW_SECTIONS.averageVmDistribution}
                  emptyHint="Keine RAM-Angaben im Filter."
                />
              </div>
              <div className="flex flex-col justify-center gap-3">
                <UsageBar label="RAM belegt" valueMiB={avg.memoryConsumedMiB} totalMiB={avg.memorySizeMiB} />
                <UsageBar
                  label="Partitionen belegt"
                  valueMiB={avg.partitionConsumedMiB}
                  totalMiB={avg.partitionCapacityMiB}
                  thresholds={{ warn: 85, critical: 95 }}
                />
                <p className="font-mono-data text-[11px] leading-relaxed text-muted-foreground">
                  {formatBytes(avg.partitionFreeMiB)} frei von {formatBytes(avg.partitionCapacityMiB)}
                  {avg.partitionFreePct !== null && ` · ${percent(avg.partitionFreePct)} frei`}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatTile icon={<HardDrive className="h-3.5 w-3.5" />} value={decimal(avg.disksPerVm)} label="Disks" />
              <StatTile icon={<Database className="h-3.5 w-3.5" />} value={formatBytes(avg.diskProvisionedMiB)} label="Provisioniert" />
              <StatTile icon={<Layers className="h-3.5 w-3.5" />} value={decimal(avg.partitionsPerVm)} label="Partitionen" />
              <StatTile icon={<Network className="h-3.5 w-3.5" />} value={decimal(avg.nicsPerVm, 2)} label="NICs" />
            </div>
          </section>

          <section className="space-y-4 border-t border-border/50 pt-5">
            <SectionLabel
              title="Beansprucht"
              source="vROps · stündlich"
              meta={
                workload
                  ? `${formatNum(workload.vmCount)} von ${formatNum(workload.scopedVmCount)} VMs · Abdeckung ${percent(workload.coverageRatio * 100)} · ${formatRange(workload)}`
                  : undefined
              }
            />
            {workload ? (
              <>
                <div className="grid gap-x-6 gap-y-5 lg:grid-cols-3">
                  <div className="space-y-3">
                    <Hero
                      value={formatDemandMHz(workload.timeline.average)}
                      caption="Ø CPU Demand je VM"
                      note={capacityPct(workload, workload.timeline.average)}
                    />
                    <p className="font-mono-data text-[11px] leading-relaxed text-muted-foreground">
                      <span className="text-foreground/80">
                        P95 {formatDemandMHz(workload.timeline.p95)}
                        {hasCapacity(workload) && ` · ${capacityPct(workload, workload.timeline.p95)}`}
                      </span>
                      <br />
                      Max {formatDemandMHz(workload.timeline.max)}
                      {hasCapacity(workload) && ` · ${capacityPct(workload, workload.timeline.max)}`}
                      <br />
                      {hasCapacity(workload)
                        ? `Anteil von Ø ${formatDemandMHz(workload.configuredCpuCapacityMHz)} zugeteilter CPU je VM`
                        : "Auslastungsanteil ohne Hostfrequenz nicht berechenbar"}
                    </p>
                  </div>
                  <div className="space-y-4 lg:col-span-2">
                    <DistributionStrip
                      label="Ø CPU Demand je VM"
                      stats={workload.demandPerVm}
                      format={formatDemandMHz}
                      secondaryFormat={hasCapacity(workload) ? (value) => formatDemandPct(toCapacityPct(value, workload.configuredCpuCapacityMHz), 1) : undefined}
                      info={OVERVIEW_SECTIONS.averageVmDemandDistribution}
                      emptyHint="Keine Demand-Messwerte im Filter."
                    />
                    <DistributionStrip
                      label="CPU Ready P95 je VM"
                      stats={workload.readyP95PerVm}
                      format={(value) => percent(value, 1)}
                      info={OVERVIEW_SECTIONS.averageVmReadyDistribution}
                      exceedsThreshold={(stats) => stats.p95 > 5}
                      emptyHint="Keine Ready-Messwerte im Filter."
                    />
                  </div>
                </div>
                <AverageVmWeekProfile workload={workload} />
              </>
            ) : (
              <div className="flex items-start gap-2.5 rounded-md border border-dashed border-border/60 bg-background/30 px-3 py-3">
                <Activity className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {hasVropsImport ? (
                    <>
                      Für die gefilterten VMs enthält der vROps-Zeitreihenimport keine Messwerte. Streuung und
                      Wochenprofil erscheinen, sobald der Filter VMs des Imports einschließt.
                    </>
                  ) : (
                    <>
                      Noch kein vROps-Zeitreihenimport vorhanden. Mit einem stündlichen Dateisatz kommen CPU-Demand-Streuung,
                      Wochenverlauf und Wochenraster hinzu –{" "}
                      <Link to="/planning" className="text-primary underline-offset-2 hover:underline">
                        in der Planung importieren
                      </Link>
                      .
                    </>
                  )}
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/** Erste bis letzte gemessene Stunde in der Zeitzone des Imports. */
function formatRange(workload: AverageVmWorkload): string {
  const first = workload.slots[0]?.timestampUtc;
  const last = workload.slots[workload.slots.length - 1]?.timestampUtc;
  if (first === undefined || last === undefined) return "—";
  const formatter = new Intl.DateTimeFormat("de-DE", {
    timeZone: workload.timezone,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
  return `${formatter.format(new Date(first))}–${formatter.format(new Date(last))}`;
}
