import type { ColumnDef, Row } from "@tanstack/react-table";

type SearchAccessor<TData> = (row: TData, index: number) => unknown;

function collectSearchAccessors<TData>(
  columns: ColumnDef<TData, unknown>[],
  accessors: SearchAccessor<TData>[],
): void {
  for (const column of columns) {
    if ("columns" in column && column.columns?.length) {
      collectSearchAccessors(column.columns, accessors);
      continue;
    }
    if (column.enableGlobalFilter === false) continue;

    if ("accessorFn" in column && typeof column.accessorFn === "function") {
      accessors.push(column.accessorFn);
      continue;
    }
    if (!("accessorKey" in column) || typeof column.accessorKey !== "string") continue;

    const path = column.accessorKey.split(".");
    if (path.length === 1) {
      const key = path[0];
      accessors.push((row) => (row as Record<string, unknown>)[key]);
      continue;
    }

    accessors.push((row) => {
      let value: unknown = row;
      for (const key of path) {
        if (value == null) return undefined;
        value = (value as Record<string, unknown>)[key];
      }
      return value;
    });
  }
}

/** Hex-Zifferngruppen, getrennt durch die gebräuchlichen MAC-Trenner. */
const MAC_SHAPED = /^[0-9a-f]+(?:[:.\-\s][0-9a-f]+)*$/i;
/** Drei Oktette – darunter steckt eine Ziffernfolge in zu vielen fremden MACs. */
const MAC_SEARCH_MIN_HEX = 6;
const FULL_MAC_HEX = 12;

function hexOnly(value: string): string {
  return value.replace(/[^0-9a-f]/g, "");
}

/**
 * Kanonische Hex-Form eines Suchbegriffs, der wie eine MAC-Adresse aussieht – sonst `null`.
 *
 * MAC-Adressen erreichen die Anwendung in drei Schreibweisen: RVTools liefert
 * `00:50:56:6a:1b:2c`, Cisco-Switches `0050.566a.1b2c`, manche Exporte
 * `00-50-56-6a-1b-2c`. Wer die eine Form kopiert und in der anderen sucht, fand
 * bisher nichts, obwohl die Zeile in der Tabelle steht.
 *
 * Eine reine Ziffernfolge ohne Trenner bleibt eine Zahl und keine MAC – sonst
 * fände die Suche nach einer Portnummer plötzlich Adressen. Ausnahme ist die
 * volle Länge von zwölf Hex-Ziffern, die nur eine MAC haben kann.
 */
export function macSearchNeedle(globalFilter: string): string | null {
  const trimmed = globalFilter.trim();
  if (!MAC_SHAPED.test(trimmed)) return null;

  const hex = hexOnly(trimmed.toLowerCase());
  if (hex.length < MAC_SEARCH_MIN_HEX) return null;
  return /[:.\-\s]/.test(trimmed) || hex.length === FULL_MAC_HEX ? hex : null;
}

/**
 * Bereitet einen Suchbegriff einmal auf und liefert den Zellenvergleich. Die
 * MAC-Analyse hängt allein am Suchbegriff und darf nicht je Zelle anfallen.
 */
export function buildTableSearchMatcher(globalFilter: string): (value: unknown) => boolean {
  const search = globalFilter.toString().toLowerCase();
  const macNeedle = macSearchNeedle(search);

  return (value: unknown) => {
    const text = value?.toString()?.toLowerCase();
    if (text === undefined) return false;
    if (text.includes(search)) return true;
    return macNeedle !== null && hexOnly(text).includes(macNeedle);
  };
}

/**
 * Globaler Tabellenfilter für TanStack. Ersetzt dessen `includesString`, damit
 * die Schreibweise einer MAC-Adresse nicht über den Treffer entscheidet.
 *
 * Der Matcher wird über einen einzelnen Eintrag zwischengespeichert: TanStack ruft
 * die Filterfunktion je Zelle auf, der Suchbegriff bleibt dabei derselbe.
 */
let cachedFilter: string | undefined;
let cachedMatcher: ((value: unknown) => boolean) | undefined;

export function tableGlobalFilterFn<TData>(row: Row<TData>, columnId: string, filterValue: unknown): boolean {
  const search = String(filterValue ?? "");
  if (!search) return true;
  if (search !== cachedFilter || cachedMatcher === undefined) {
    cachedFilter = search;
    cachedMatcher = buildTableSearchMatcher(search);
  }
  return cachedMatcher(row.getValue(columnId));
}

/**
 * Zählt Zeilen mit derselben Semantik wie {@link tableGlobalFilterFn}. Der direkte
 * Durchlauf spart ein zweites Tabellenmodell neben `VirtualTable`.
 */
export function countTableSearchRows<TData>(
  data: TData[],
  columns: ColumnDef<TData, unknown>[],
  globalFilter: string,
): number {
  if (!globalFilter) return data.length;

  const matches = buildTableSearchMatcher(globalFilter);
  const accessors: SearchAccessor<TData>[] = [];
  collectSearchAccessors(columns, accessors);

  let count = 0;
  for (let index = 0; index < data.length; index += 1) {
    const row = data[index];
    for (const accessor of accessors) {
      if (matches(accessor(row, index))) {
        count += 1;
        break;
      }
    }
  }

  return count;
}
