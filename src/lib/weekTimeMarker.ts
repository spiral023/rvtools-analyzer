/**
 * Ein vROps-Import liegt fast immer in der Vergangenheit, „jetzt“ fällt also nicht in
 * das dargestellte Zeitfenster. Für den „Jetzt“-Marker in Zeitverläufen wird deshalb
 * die Wochenzeit gesucht: derselbe Wochentag und dieselbe Stunde. Dieselbe Semantik
 * nutzt der Wochenraster-Marker der Durchschnitts-VM
 * (siehe `nowSlotIndex` in `averageVmWorkloadService`).
 *
 * Deckt das Fenster mehrere Wochen ab, gewinnt die jüngste passende Stunde – sie liegt
 * am nächsten an der Gegenwart.
 *
 * @returns Zeitstempel des Markers oder `null`, wenn keine Stunde passt.
 */
export function findWeekTimeMarkerTimestamp(timestampsMs: readonly number[], now: Date = new Date()): number | null {
  const weekday = now.getDay();
  const hour = now.getHours();
  return timestampsMs.reduce<number | null>((match, timestampMs) => {
    const date = new Date(timestampMs);
    if (date.getDay() !== weekday || date.getHours() !== hour) return match;
    return match === null || timestampMs > match ? timestampMs : match;
  }, null);
}
