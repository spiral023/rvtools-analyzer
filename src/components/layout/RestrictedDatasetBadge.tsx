import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useRestrictedDataset } from "@/hooks/useRestrictedDataset";

/** Zentraler, persistenter Hinweis, wenn der aktive Analysedatensatz aus einem SysV-Paket stammt. */
export function RestrictedDatasetBadge() {
  const { isRestricted, sources } = useRestrictedDataset();

  if (!isRestricted) return null;

  const scopeLabels = sources.map((source) => source.scopeLabel);
  const visibleScopes = scopeLabels.slice(0, 10).join(" · ");
  const sourceLabel = sources.length > 1
    ? `Eingeschränkter SysV-Datensatz · ${sources.length.toLocaleString("de-DE")} Pakete`
    : "Eingeschränkter SysV-Datensatz";

  return (
    <Badge
      variant="outline"
      className="gap-1.5 border-primary/40 text-primary"
      title={`Eingeschränkter SysV-Datensatz: ${visibleScopes}${sources.length > 10 ? " · weitere Scopes gekürzt" : ""}. Dieser Datensatz ist physisch auf importierte SysV-Pakete begrenzt.`}
    >
      <ShieldCheck className="size-3.5" aria-hidden="true" />
      <span className="hidden lg:inline">{sourceLabel}</span>
      <span className="lg:hidden">SysV-Scope</span>
    </Badge>
  );
}
