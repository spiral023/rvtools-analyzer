import { describe, it, expect } from "vitest";
import cdpScriptSource from "@/../scripts/Get-CdpNetworkInfo.ps1?raw";

describe("CDP-Abruf-Skript-Quelle", () => {
  it("wird als nicht-leerer Text eingebunden", () => {
    expect(typeof cdpScriptSource).toBe("string");
    expect(cdpScriptSource.length).toBeGreaterThan(500);
  });

  it("enthält die zentralen PowerCLI-Bausteine", () => {
    expect(cdpScriptSource).toContain("QueryNetworkHint");
    expect(cdpScriptSource).toContain("Connect-VIServer");
  });

  it("erzeugt Spalten, die der CDP-Import erwartet", () => {
    for (const header of ["VMHost", "PhysicalAdapter", "CDPDeviceID", "CDPAvailable"]) {
      expect(cdpScriptSource).toContain(header);
    }
  });
});
