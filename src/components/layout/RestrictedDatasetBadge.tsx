import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useRestrictedDataset } from "@/hooks/useRestrictedDataset";
import { formatSysvScopeLabel, sysvScopeKindPlural } from "@/lib/sysvDataPackageScope";

/**
 * Zentraler, persistenter Hinweis, wenn der aktive Analysedatensatz aus einem SysV-Paket stammt.
 *
 * Sichtbar steht der Scope selbst – „MUSTERMANN Max“, „Abteilung IN-VIA“, „Bereich IN“ – statt der
 * abstrakten Einordnung „Eingeschränkter SysV-Datensatz“: der konkrete Name sagt sofort, wessen
 * Ausschnitt man vor sich hat. Dass der Bestand physisch begrenzt ist, tragen Schild-Symbol und
 * Tooltip.
 */
export function RestrictedDatasetBadge() {
  const { isRestricted, sources } = useRestrictedDataset();

  if (!isRestricted) return null;

  const scopeLabels = sources.map((source) => formatSysvScopeLabel(source.scopeKind, source.scopeLabel));
  const scopeKinds = new Set(sources.map((source) => source.scopeKind));
  // Bei mehreren Paketen ist kein einzelner Name mehr wahr. Sind sie gleichartig, benennt die
  // Zusammenfassung wenigstens die Ebene; gemischte Vereinigungen bleiben neutral.
  const label = sources.length === 1
    ? scopeLabels[0]
    : scopeKinds.size === 1
      ? `${sources.length.toLocaleString("de-DE")} ${sysvScopeKindPlural(sources[0].scopeKind)}`
      : `${sources.length.toLocaleString("de-DE")} SysV-Scopes`;

  const visibleScopes = scopeLabels.slice(0, 10).join(" · ");

  return (
    <Badge
      variant="outline"
      className="max-w-[16rem] gap-1.5 border-primary/40 text-primary"
      title={`Eingeschränkter SysV-Datensatz: ${visibleScopes}${sources.length > 10 ? " · weitere Scopes gekürzt" : ""}. Dieser Datensatz ist physisch auf importierte SysV-Pakete begrenzt.`}
    >
      <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Badge>
  );
}
