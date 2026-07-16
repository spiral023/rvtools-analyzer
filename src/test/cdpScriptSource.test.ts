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

  it("verwendet den vCenter-Kurznamen im CSV-Dateinamen", () => {
    expect(cdpScriptSource).toContain('$vCenterShortName = ($vCenter -split "\\.")[0]');
    expect(cdpScriptSource).toContain('${vCenterShortName}_ESXi_CDP_Information_$timestamp.csv');
  });

  it("schreibt Statusmeldungen in den Informationsstrom", () => {
    expect(cdpScriptSource).toContain("Write-Information");
    expect(cdpScriptSource).not.toContain("Write-Host");
  });
});
