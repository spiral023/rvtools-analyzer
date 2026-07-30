import type { NormalizedVm, TechInfoLatest } from "@/domain/models/types";
import { normalizeVmName } from "@/lib/globalFilter";

/**
 * Textsuche der Filterleiste über den VM-Bestand.
 *
 * Durchsucht werden genau die Merkmale, die die Tabelle „Virtuelle Maschinen“ als Spalte
 * zeigt: VM-Name, Cluster, Host, Betriebssystem, Systemverantwortliche:r und deren
 * Abteilung. Sichtbar und suchbar bleiben damit dasselbe – und weil jede Auswertung der
 * Overview (KPIs, Durchschnitts-VM, Wochenprofil) auf demselben gefilterten Bestand
 * aufsetzt, ergibt eine Suche nach einer Abteilung, einem Systemverantwortlichen, einem
 * Host oder einem OS unmittelbar die Durchschnitts-VM dieser Gruppe.
 *
 * Systemverantwortliche:r und Abteilung stammen nicht aus RVTools, sondern aus der
 * Tech-Info-Zuordnung über den VM-Namen; sie werden deshalb als Index hereingegeben statt
 * aus der VM gelesen.
 */
export function normalizeVmSearchTerm(value: string): string {
  return value.toLocaleLowerCase("de-DE");
}

/**
 * Die durchsuchbaren Tech-Info-Merkmale einer VM.
 *
 * `sysvDepartment` ist der Abteilungspfad in der Form „<Org>/<Bereich>-<Abteilung>“, also
 * z.B. „RAITEC/IN-VIA“. Weil die Suche eine Teilzeichenkette prüft, trifft sowohl die
 * Abteilung („VIA“) als auch der Bereich oder der vollständige Pfad – eine Zerlegung über
 * `parseOrgPath` ist dafür nicht nötig. Bewusst nur die primäre Verantwortung: eine Suche
 * nach einer Abteilung liefert deren eigene VMs, nicht zusätzlich die, für die sie lediglich
 * die Stellvertretung stellt.
 */
export interface VmTechInfoSearchFields {
  sysv: string | null;
  sysvDepartment: string | null;
}

/** Normalisierter VM-Name → durchsuchbare Tech-Info-Merkmale. */
export type VmTechInfoSearchIndex = ReadonlyMap<string, VmTechInfoSearchFields>;

/** Baut den Suchindex; VMs ohne jedes belegte Merkmal bleiben außen vor. */
export function buildTechInfoSearchIndex(entries: readonly TechInfoLatest[]): Map<string, VmTechInfoSearchFields> {
  const index = new Map<string, VmTechInfoSearchFields>();
  for (const entry of entries) {
    const sysv = entry.sysv?.trim() || null;
    const sysvDepartment = entry.sysvDepartment?.trim() || null;
    if (sysv === null && sysvDepartment === null) continue;
    index.set(entry.vmNameNorm, { sysv, sysvDepartment });
  }
  return index;
}

/**
 * Die durchsuchbaren Tech-Info-Werte einer VM als flache Liste – so ergänzen Aufrufer ihre
 * eigenen Felder um die Tech-Info-Merkmale, ohne den Feldbestand zu kennen.
 */
export function techInfoSearchValues(index: VmTechInfoSearchIndex, vmName: string): (string | null)[] {
  const fields = index.get(normalizeVmName(vmName));
  return [fields?.sysv ?? null, fields?.sysvDepartment ?? null];
}

/**
 * Trifft der – bereits normalisierte – Suchbegriff eines der Felder? Ein leerer Begriff
 * gilt als Treffer, damit Aufrufer die Suche bedingungslos anwenden können.
 */
export function matchesSearchFields(query: string, values: readonly (string | null | undefined)[]): boolean {
  if (query === "") return true;
  return values.some((value) => value != null && normalizeVmSearchTerm(value).includes(query));
}

export function matchesVmSearch(vm: NormalizedVm, query: string, techInfoIndex: VmTechInfoSearchIndex): boolean {
  return matchesSearchFields(query, [
    vm.vmName,
    vm.cluster,
    vm.host,
    vm.osConfig,
    vm.osTools,
    ...techInfoSearchValues(techInfoIndex, vm.vmName),
  ]);
}
