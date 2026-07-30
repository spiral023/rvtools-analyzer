import { formatNum } from "@/lib/xlsx/parseHelpers";

interface SearchScopeNoticeProps {
  /** Der rohe Suchbegriff der Filterleiste; bei leerem Begriff erscheint kein Hinweis. */
  search: string;
  /** Die durchsuchten Merkmale in Anzeigeform, etwa „VM, Cluster und Host“. */
  fields: string;
  matched: number;
  total: number;
}

/**
 * Macht sichtbar, dass die Textsuche den gesamten Tab einschränkt – nicht nur die Tabelle.
 * Ohne diesen Hinweis bleibt unklar, warum Kennzahlen und Diagramme plötzlich kleine Werte
 * zeigen, sobald ein Suchbegriff im globalen Filter steht.
 */
export function SearchScopeNotice({ search, fields, matched, total }: SearchScopeNoticeProps) {
  const term = search.trim();
  if (term === "") return null;
  return (
    <p className="font-mono-data text-xs text-muted-foreground">
      Suche „{term}“ über {fields} ·{" "}
      <span className="text-foreground/80">{formatNum(matched)} von {formatNum(total)} VMs</span>
      {" "}– Kennzahlen, Diagramme und Tabellen zeigen nur diesen Ausschnitt.
    </p>
  );
}
