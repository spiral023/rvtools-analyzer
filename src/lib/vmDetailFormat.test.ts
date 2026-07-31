import { describe, expect, it } from "vitest";
import { compactValue, lastPathSegment } from "@/lib/vmDetailFormat";

describe("lastPathSegment", () => {
  it("reduziert Ordner- und Resource-Pool-Pfade auf das Blatt", () => {
    expect(lastPathSegment("/LNZ9910/RAITEC/FOLDERXY")).toBe("FOLDERXY");
    expect(lastPathSegment("/LNZ9910/CLUSTERNAME/Resources/HIGH")).toBe("HIGH");
  });

  it("lässt Werte ohne Pfadtrenner unverändert", () => {
    expect(lastPathSegment("FOLDERXY")).toBe("FOLDERXY");
  });

  it("ignoriert überzählige Trenner und Leerraum", () => {
    expect(lastPathSegment("/DC/Cluster/Resources/HIGH/")).toBe("HIGH");
    expect(lastPathSegment("/DC// Prod ")).toBe("Prod");
  });

  it("gibt null zurück, wenn kein Segment übrig bleibt – daraus wird in der Ansicht „—“", () => {
    expect(lastPathSegment(null)).toBeNull();
    expect(lastPathSegment(undefined)).toBeNull();
    expect(lastPathSegment("")).toBeNull();
    expect(lastPathSegment("/")).toBeNull();
    expect(compactValue(lastPathSegment("/"))).toBe("—");
  });
});
