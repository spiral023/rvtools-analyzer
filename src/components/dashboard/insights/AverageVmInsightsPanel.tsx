import { Link } from "react-router-dom";
import { Activity, AlertTriangle, ArrowDownRight, CheckCircle2, Users } from "lucide-react";
import { CapacityLadder, type CapacityLadderRow } from "@/components/dashboard/insights/CapacityLadder";
import { ladderExample } from "@/components/dashboard/insights/ladderExample";
import { DemandBandChart } from "@/components/dashboard/insights/DemandBandChart";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { AverageVmInsights } from "@/domain/services/averageVmInsightsService";
import { INSIGHTS_GLOSSARY } from "@/lib/glossaries/averageVmInsights";
import { formatDemandMHz, formatDemandPct, toCapacityPct } from "@/lib/formatDemand";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import { cn } from "@/lib/utils";

/** Ab diesem Anteil des Demands auf dem aktivsten Zehntel gilt die Last als konzentriert. */
const CONCENTRATION_ALERT_PCT = 40;

function percent(value: number, digits = 0): string {
  return `${value.toLocaleString("de-DE", { maximumFractionDigits: digits })} %`;
}

/**
 * Sektionsmarke im Stil der übrigen Panels: Titel, Datenherkunft, Trennlinie, Meta rechts.
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

export interface AverageVmInsightsPanelProps {
  insights: AverageVmInsights | null;
  hasVropsImport: boolean;
}

/**
 * Lastverteilung der gefilterten VMs.
 *
 * Gegenentwurf zur „Durchschnittlichen VM": Statt einer Mittelwertzahl und eines
 * gemittelten Verlaufs zeigt die Ansicht durchgehend Verteilungen. Der Grund ist
 * messbar – über einen realen Bestand liegt der Mittelwert zur Spitzenstunde bei
 * 11,2 % der Kapazität, der Median bei 3,1 % und der P95 bei 49,5 %. Eine einzelne
 * Zahl kann das nicht beschreiben, egal welche.
 */
export function AverageVmInsightsPanel({ insights, hasVropsImport }: AverageVmInsightsPanelProps) {
  if (!insights) {
    return (
      <div className="rounded-lg border border-border/50 bg-card/30 p-4">
        <div className="flex items-start gap-2.5 rounded-md border border-dashed border-border/60 bg-background/30 px-3 py-3">
          <Activity className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {hasVropsImport ? (
              <>
                Für die gefilterten VMs enthält der vROps-Zeitreihenimport keine Messwerte. Die Verteilung
                erscheint, sobald der Filter VMs des Imports einschließt.
              </>
            ) : (
              <>
                Noch kein vROps-Zeitreihenimport vorhanden. Mit einem stündlichen Dateisatz zeigt diese Ansicht
                Lastverteilung, Wochenverlauf und Auffälligkeiten –{" "}
                <Link to="/planning" className="text-primary underline-offset-2 hover:underline">
                  in der Planung importieren
                </Link>
                .
              </>
            )}
          </p>
        </div>
      </div>
    );
  }

  const capacityMHz = insights.configuredCpuCapacityMHz;
  const heroStats = insights.demandP95PerVm.stats;
  const heroPct = toCapacityPct(heroStats?.p50, capacityMHz);
  const hasCapacity = capacityMHz !== null && capacityMHz > 0;

  const rows: CapacityLadderRow[] = [
    {
      label: "Ø",
      spread: insights.demandAvgPerVm,
      info: INSIGHTS_GLOSSARY.ladderAverage,
      example: ladderExample(insights.demandAvgPerVm, capacityMHz, insights.vmCount, "im Mittel"),
    },
    {
      label: "P95",
      spread: insights.demandP95PerVm,
      info: INSIGHTS_GLOSSARY.ladderP95,
      example: ladderExample(insights.demandP95PerVm, capacityMHz, insights.vmCount, "in ihrer P95-Stunde"),
    },
    {
      label: "Spitze",
      spread: insights.demandPeakPerVm,
      info: INSIGHTS_GLOSSARY.ladderPeak,
      example: ladderExample(insights.demandPeakPerVm, capacityMHz, insights.vmCount, "in der Spitze"),
    },
  ];

  return (
    <div className="rounded-lg border border-border/50 bg-card/30 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <InfoTooltip entry={INSIGHTS_GLOSSARY.panel} side="bottom">
          <h3 className="w-fit cursor-help text-sm font-semibold text-muted-foreground">Lastverteilung</h3>
        </InfoTooltip>
        <InfoTooltip entry={INSIGHTS_GLOSSARY.coverage} side="bottom" align="end">
          <span className="cursor-help font-mono-data text-xs text-muted-foreground">
            {formatNum(insights.vmCount)} von {formatNum(insights.scopedVmCount)} VMs · Abdeckung{" "}
            {percent(insights.coverageRatio * 100)} · {formatRange(insights)}
          </span>
        </InfoTooltip>
      </div>

      <div className="space-y-5">
        <section className="space-y-4">
          <SectionLabel title="Typische VM" source="vROps · stündlich" />
          <div className="grid gap-x-6 gap-y-5 lg:grid-cols-3">
            <div className="space-y-2">
              <div>
                <p className="flex items-baseline gap-1.5 font-mono-data text-[2.25rem] font-bold leading-none tracking-tight text-foreground">
                  {hasCapacity ? formatDemandPct(heroPct, 1) : formatDemandMHz(heroStats?.p50)}
                </p>
                <p className="mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Median des P95 je VM
                </p>
              </div>
              <p className="font-mono-data text-[11px] leading-relaxed text-muted-foreground">
                <span className="text-foreground/80">{formatDemandMHz(heroStats?.p50)}</span>
                {hasCapacity && <> von Ø {formatDemandMHz(capacityMHz)} zugeteilt</>}
                <br />
                Die Hälfte der VMs bleibt darunter.
              </p>
            </div>

            <div className="lg:col-span-2">
              <InfoTooltip entry={INSIGHTS_GLOSSARY.ladder} side="top">
                <p className="mb-2 w-fit cursor-help text-[10px] uppercase tracking-wider text-muted-foreground">
                  Kapazitätsleiter · Streuung über {formatNum(insights.vmCount)} VMs
                </p>
              </InfoTooltip>
              <CapacityLadder rows={rows} capacityMHz={capacityMHz} />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <ConcentrationTile insights={insights} />
            <FindingsTile insights={insights} />
          </div>
        </section>

        <section className="border-t border-border/50 pt-5">
          <DemandBandChart insights={insights} />
        </section>
      </div>
    </div>
  );
}

/**
 * Ohne die Konzentration lässt sich der Median nicht einordnen: Tragen wenige VMs die
 * Last, beschreibt jede Aggregatzahl die Mehrheit richtig und den Bestand trotzdem falsch.
 */
function ConcentrationTile({ insights }: { insights: AverageVmInsights }) {
  const { concentration, vmCount } = insights;
  if (!concentration) return <div />;

  const alert = concentration.topDecileSharePct >= CONCENTRATION_ALERT_PCT;
  const share = Math.min(100, Math.max(0, concentration.topDecileSharePct));

  return (
    <InfoTooltip
      entry={INSIGHTS_GLOSSARY.concentration}
      side="top"
      example={
        <>
          {concentration.vmsForHalfOfDemand === 1
            ? <>Eine einzelne VM stellt bereits die Hälfte des Demands.</>
            : <>{formatNum(concentration.vmsForHalfOfDemand)} von {formatNum(vmCount)} VMs stellen zusammen die Hälfte des Demands.</>}
          {" "}Die aktivste allein trägt {percent(concentration.topVmSharePct, 1)}.
        </>
      }
    >
      <div className="cursor-help rounded-md border border-border/40 bg-background/40 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <span className="text-[10px] uppercase tracking-wide">Lastkonzentration</span>
        </div>
        <p className="mt-1 font-mono-data text-[13px] leading-snug text-foreground">
          <span className={cn("font-semibold", alert && "text-warning")}>
            {formatNum(concentration.vmsForHalfOfDemand)}
          </span>{" "}
          <span className="text-muted-foreground">
            {concentration.vmsForHalfOfDemand === 1 ? "VM trägt" : "VMs tragen"} die Hälfte der Last
          </span>
        </p>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none", alert ? "bg-warning" : "bg-primary")}
              style={{ width: `${share}%` }}
            />
          </div>
          <span className="font-mono-data text-[10px] text-muted-foreground">
            Top 10 % = {percent(concentration.topDecileSharePct)}
          </span>
        </div>
      </div>
    </InfoTooltip>
  );
}

/** Nennt nur, was zutrifft – eine Zeile „alles unauffällig" ist wertvoller als drei Nullen. */
function FindingsTile({ insights }: { insights: AverageVmInsights }) {
  const { findings, vmCount } = insights;
  const items: { icon: React.ReactNode; text: React.ReactNode; tone: "warn" | "info" }[] = [];

  if (findings.lowUtilizationCount > 0) {
    items.push({
      icon: <ArrowDownRight className="h-3.5 w-3.5 shrink-0" />,
      tone: "info",
      text: (
        <>
          <span className="font-semibold text-foreground">{formatNum(findings.lowUtilizationCount)}</span> VMs unter 10 %
          {findings.ratedCount > 0 && <span className="text-muted-foreground"> · {percent((findings.lowUtilizationCount / findings.ratedCount) * 100)} der bewerteten</span>}
        </>
      ),
    });
  }
  if (findings.nearCapacityCount > 0) {
    items.push({
      icon: <AlertTriangle className="h-3.5 w-3.5 shrink-0" />,
      tone: "warn",
      text: (
        <>
          <span className="font-semibold text-warning">{formatNum(findings.nearCapacityCount)}</span> VMs mit Stunden über 90 % Kapazität
        </>
      ),
    });
  }
  if (findings.readyAlertCount > 0) {
    items.push({
      icon: <AlertTriangle className="h-3.5 w-3.5 shrink-0" />,
      tone: "warn",
      text: (
        <>
          <span className="font-semibold text-warning">{formatNum(findings.readyAlertCount)}</span> VMs mit CPU Ready über 5 %
        </>
      ),
    });
  }

  return (
    <InfoTooltip
      entry={INSIGHTS_GLOSSARY.findings}
      side="top"
      align="end"
      example={
        <>
          Geprüft an {formatNum(vmCount)} VMs: {formatNum(findings.lowUtilizationCount)} dauerhaft unter 10 %,{" "}
          {formatNum(findings.nearCapacityCount)} zeitweise über 90 %, {formatNum(findings.readyAlertCount)} mit Ready über 5 %.
        </>
      }
    >
      <div className="cursor-help rounded-md border border-border/40 bg-background/40 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span className="text-[10px] uppercase tracking-wide">Auffälligkeiten</span>
        </div>
        {items.length === 0 ? (
          <p className="mt-1 flex items-center gap-1.5 font-mono-data text-[13px] leading-snug text-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
            <span className="text-muted-foreground">Keine – Auslastung und Ready unauffällig</span>
          </p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {items.map((item, index) => (
              <li key={index} className={cn("flex items-center gap-1.5 font-mono-data text-[12px] leading-snug", item.tone === "warn" ? "text-warning" : "text-muted-foreground")}>
                {item.icon}
                <span className="text-muted-foreground">{item.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </InfoTooltip>
  );
}

const rangeFormatterByTimezone = new Map<string, Intl.DateTimeFormat>();

/** Erste bis letzte gemessene Stunde in der Zeitzone des Imports. */
function formatRange(insights: AverageVmInsights): string {
  let formatter = rangeFormatterByTimezone.get(insights.timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("de-DE", {
      timeZone: insights.timezone, day: "2-digit", month: "2-digit", year: "2-digit",
    });
    rangeFormatterByTimezone.set(insights.timezone, formatter);
  }
  return `${formatter.format(new Date(insights.rangeStartUtc))}–${formatter.format(new Date(insights.rangeEndUtc))}`;
}
