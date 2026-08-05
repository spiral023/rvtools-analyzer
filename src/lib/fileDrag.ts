/**
 * `dragover` feuert laut Spezifikation fortlaufend (mindestens alle 350 ms), solange ein Drag über
 * dem Fenster liegt. Bleibt es länger aus, ist der Drag beendet. Der Timer ist der Fallback für die
 * Fälle, in denen Browser kein abschließendes `dragleave`/`dragend` liefern (Drag aus dem Fenster
 * heraus, abgebrochener Drag) – ohne ihn bliebe ein Drop-Overlay stehen.
 */
export const DRAG_IDLE_TIMEOUT_MS = 700;

/**
 * Unterscheidet echte Datei-Drags von den anwendungsinternen Drags (Spaltensortierung in
 * `VirtualTable`, Sortierung im Export-Studio). Nur Datei-Drags setzen den Typ `Files`; interne
 * Drags dürfen ein globales Drop-Overlay niemals auslösen.
 */
export function dragContainsFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer?.types) return false;
  return Array.from(dataTransfer.types).includes("Files");
}
