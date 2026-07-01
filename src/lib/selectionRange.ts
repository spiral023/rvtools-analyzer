/**
 * Berechnet die VM-Keys, die bei einem Shift-Click zwischen dem letzten
 * angeklickten Index und dem aktuellen Index liegen.
 *
 * @param allKeys Geordnete Liste aller sichtbaren VM-Keys (nach Filter/Sortierung).
 * @param anchorIndex Index des letzten angeklickten Elements (-1 wenn keiner).
 * @param currentIndex Index des aktuell angeklickten Elements.
 * @returns Array der VM-Keys im Bereich [min, max].
 */
export function getRangeKeys(
  allKeys: string[],
  anchorIndex: number,
  currentIndex: number,
): string[] {
  if (anchorIndex < 0 || currentIndex < 0) return [];
  if (anchorIndex >= allKeys.length || currentIndex >= allKeys.length) return [];
  const start = Math.min(anchorIndex, currentIndex);
  const end = Math.max(anchorIndex, currentIndex);
  return allKeys.slice(start, end + 1);
}