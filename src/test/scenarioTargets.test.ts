import { describe, expect, it } from "vitest";
import { getScenarioTargetDisplay } from "@/lib/scenarioTargets";

describe("getScenarioTargetDisplay", () => {
  it("kennzeichnet einen nicht eindeutig migrierten Legacy-Zielcluster als verwaist", () => {
    expect(getScenarioTargetDisplay("Production::vc-1", new Map())).toEqual({
      label: "Verwaistes Ziel",
      warning: "Zielcluster „Production“ in vCenter „vc-1“ konnte nicht eindeutig zugeordnet werden.",
    });
  });
});
