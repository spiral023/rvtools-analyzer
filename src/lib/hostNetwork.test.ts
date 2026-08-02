import { describe, expect, it } from "vitest";
import type { SheetRow } from "@/domain/models/types";
import { buildDvsRows } from "@/lib/hostNetwork";

function row(data: SheetRow["data"], rowIndex = 0): SheetRow {
  return { snapshotId: "snap-1", sheetName: "dvSwitch", rowIndex, data };
}

describe("buildDvsRows", () => {
  it("fällt bei einem nicht numerischen Host-members-Wert auf die vNIC-Hosts zurück", () => {
    const [result] = buildDvsRows(
      [row({ Switch: "dvs-prod", "Host members": "N/A", "# Ports": "128", "Max MTU": "9000" })],
      [
        row({ Switch: "dvs-prod", Host: "esx-01" }, 1),
        row({ Switch: "dvs-prod", Host: "esx-02" }, 2),
        row({ Switch: "dvs-prod", Host: "esx-02" }, 3),
      ],
    );

    expect(result.members).toBe(2);
    expect(Number.isNaN(result.members)).toBe(false);
    expect(result.ports).toBe(128);
    expect(result.maxMtu).toBe(9000);
    expect(result.uplinksPerHost).toBe("1–2");
  });

  it("übernimmt einen gültigen Host-members-Wert", () => {
    const [result] = buildDvsRows(
      [row({ Switch: "dvs-prod", "Host members": 4 })],
      [],
    );

    expect(result.members).toBe(4);
  });
});
