import { describe, expect, it } from "vitest";
import type { NormalizedVm, TechInfoClientLatest, TechInfoLatest } from "@/domain/models/types";
import { partitionTechInfoByActiveVms } from "@/lib/techInfoVmScope";

const vm = (vmName: string) => ({ vmName }) as NormalizedVm;
const server = (vmName: string) => ({ vmName, vmNameNorm: vmName.trim().toLowerCase() }) as TechInfoLatest;
const client = (clientName: string) => ({ clientName, clientNameNorm: clientName.trim().toLowerCase() }) as TechInfoClientLatest;

describe("partitionTechInfoByActiveVms", () => {
  it("ordnet nur aktive VMs zu und normalisiert Leerzeichen und Groß-/Kleinschreibung", () => {
    const result = partitionTechInfoByActiveVms(
      [vm(" APP-01 "), vm("VDI-01"), vm("UNASSIGNED-01"), vm("BOTH-01")],
      [server("app-01"), server("both-01"), server("stale-server")],
      [client("vdi-01"), client(" BOTH-01 "), client("stale-client")],
    );

    expect(result.serverVms.map((entry) => entry.vmName)).toEqual([" APP-01 ", "BOTH-01"]);
    expect(result.clientRows.map((entry) => entry.clientName)).toEqual(["vdi-01", " BOTH-01 "]);
    expect(result.vmsWithoutTechInfo.map((entry) => entry.vmName)).toEqual(["UNASSIGNED-01"]);
  });
});
