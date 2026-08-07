import { describe, expect, it } from "vitest";
import { isLazyImportFailure } from "@/lib/lazyImportRecovery";

describe("isLazyImportFailure", () => {
  it.each([
    "Failed to fetch dynamically imported module: https://example.test/assets/Overview.js",
    // Firefox formuliert denselben Fehler anders – das ist der Wortlaut aus den
    // Fehlerberichten der Produktivumgebung.
    "error loading dynamically imported module: https://example.test/assets/Vms-Mv7SLfMf.js",
    "Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of text/html.",
    "Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of text/html.",
    "Importing a module script failed.",
  ])("erkennt einen fehlerhaften Lazy-Import: %s", (message) => {
    expect(isLazyImportFailure(new Error(message))).toBe(true);
  });

  it("ignoriert fachliche Anwendungsfehler", () => {
    expect(isLazyImportFailure(new Error("IndexedDB konnte nicht geöffnet werden."))).toBe(false);
  });
});
