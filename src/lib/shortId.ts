/**
 * Erzeugt eine kurze, kollisionssichere ID aus Krypto-Zufall.
 *
 * Standardmäßig 10 Zeichen Base36 (~51 Bit Entropie) – deutlich kürzer als eine
 * UUID (36 Zeichen), aber für die wenigen pro Import erzeugten Snapshots/Imports
 * praktisch kollisionsfrei. Wird als interner Schlüssel verwendet und nirgends
 * vom Benutzer gelesen, daher ist die Form unkritisch.
 */
export function shortId(length = 10): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let id = "";
  for (let i = 0; i < length; i++) {
    id += alphabet[bytes[i] % alphabet.length];
  }
  return id;
}
