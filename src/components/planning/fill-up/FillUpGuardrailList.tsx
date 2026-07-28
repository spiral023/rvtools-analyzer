import { Badge } from "@/components/ui/badge";
import type { FillUpGuardrailHeadroom } from "@/domain/models/types";
import { formatFillUpValue } from "@/lib/fillUpUnits";

export function FillUpGuardrailList({ guardrails, consumptionByMetric }: { guardrails: readonly FillUpGuardrailHeadroom[]; consumptionByMetric?: ReadonlyMap<FillUpGuardrailHeadroom["metricKey"], string> }) {
  if (!guardrails.length) return <p className="text-sm text-muted-foreground">Für dieses Profil sind keine berechenbaren Guardrails verfügbar.</p>;
  return <div className="divide-y rounded-md border">{guardrails.map((guardrail) => {
    const consumption = consumptionByMetric?.get(guardrail.metricKey);
    return <div key={`${guardrail.scenarioId}:${guardrail.metricKey}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
      <div>
        <p className="font-medium">{guardrail.label}</p>
        <p className="text-xs text-muted-foreground">{guardrail.scenarioId} · {guardrail.workloadScope === "high" ? "HIGH" : "Alle Workloads"}</p>
        {consumption ? <p className="mt-0.5 font-mono-data text-[11px] text-muted-foreground">Ansatz/VM: {consumption}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono tabular-nums">{guardrail.available === null ? "—" : formatFillUpValue(Math.max(0, guardrail.available), guardrail.unit)}</span>
        <Badge variant={guardrail.hardLimit ? "outline" : "secondary"}>{guardrail.hardLimit ? "hart" : "Info"}</Badge>
      </div>
    </div>;
  })}</div>;
}
