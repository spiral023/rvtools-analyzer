import type { NormalizedVm, TechInfoLatest } from "@/domain/models/types";
import { normalizeVmName } from "@/lib/globalFilter";

/**
 * Textsuche der Filterleiste über den VM-Bestand.
 *
 * Durchsucht werden genau die Merkmale, die die Tabelle „Virtuelle Maschinen“ als Spalte
 * zeigt: VM-Name, Cluster, Host, Betriebssystem und Systemverantwortliche:r. Sichtbar und
 * suchbar bleiben damit dasselbe – und weil jede Auswertung der Overview (KPIs,
 * Durchschnitts-VM, Wochenprofil) auf demselben gefilterten Bestand aufsetzt, ergibt eine
 * Suche nach einem Systemverantwortlichen, einem Host oder einem OS unmittelbar die
 * Durchschnitts-VM dieser Gruppe.
 *
 * `sysv` stammt nicht aus RVTools, sondern aus der Tech-Info-Zuordnung über den VM-Namen;
 * die Zuordnung wird deshalb als Map hereingegeben statt aus der VM gelesen.
 */
export function normalizeVmSearchTerm(value: string): string {
  return value.toLocaleLowerCase("de-DE");
}

/** VM-Name → Systemverantwortliche:r, kleingeschrieben und damit direkt vergleichbar. */
export function buildSysvSearchIndex(entries: readonly TechInfoLatest[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const entry of entries) {
    const sysv = entry.sysv?.trim();
    if (!sysv) continue;
    index.set(entry.vmNameNorm, normalizeVmSearchTerm(sysv));
  }
  return index;
}

/**
 * Trifft der – bereits normalisierte – Suchbegriff eines der Felder? Ein leerer Begriff
 * gilt als Treffer, damit Aufrufer die Suche bedingungslos anwenden können.
 */
export function matchesSearchFields(query: string, values: readonly (string | null | undefined)[]): boolean {
  if (query === "") return true;
  return values.some((value) => value != null && normalizeVmSearchTerm(value).includes(query));
}

export function matchesVmSearch(vm: NormalizedVm, query: string, sysvIndex: ReadonlyMap<string, string>): boolean {
  const sysv = sysvIndex.get(normalizeVmName(vm.vmName)) ?? null;
  return matchesSearchFields(query, [vm.vmName, vm.cluster, vm.host, vm.osConfig, vm.osTools, sysv]);
}
