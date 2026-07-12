import { describe, expect, it } from "vitest";
import { getHotHostSeverity } from "@/lib/hotHostSeverity";

describe("getHotHostSeverity", () => {
  it("marks clusters without hot hosts as healthy", () => {
    expect(getHotHostSeverity(0, 8)).toBe("ok");
  });

  it("marks a cluster with up to half of its hosts hot as a warning", () => {
    expect(getHotHostSeverity(4, 8)).toBe("warn");
  });

  it("marks a cluster with more than half of its hosts hot as critical", () => {
    expect(getHotHostSeverity(5, 8)).toBe("crit");
  });
});
