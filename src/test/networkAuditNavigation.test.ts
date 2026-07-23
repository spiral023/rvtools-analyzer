import { describe, expect, it } from "vitest";
import {
  parseNetworkAuditLocation,
  parseNetworkTab,
  updateNetworkAuditSearch,
} from "@/lib/networkAuditNavigation";

describe("network audit navigation", () => {
  it("uses the supplied tab fallback and the default audit location for empty search params", () => {
    const params = new URLSearchParams();

    expect(parseNetworkTab(params, "security")).toBe("security");
    expect(parseNetworkAuditLocation(params)).toEqual({ check: "overview", scope: "attention" });
  });

  it("parses valid audit tab, check, and scope params", () => {
    const params = new URLSearchParams("tab=audit&check=mac&scope=passed");

    expect(parseNetworkTab(params, "security")).toBe("audit");
    expect(parseNetworkAuditLocation(params)).toEqual({ check: "mac", scope: "passed" });
  });

  it("falls back for invalid tab, check, and scope params", () => {
    const params = new URLSearchParams("tab=wrong&check=wrong&scope=wrong");

    expect(parseNetworkTab(params, "host")).toBe("host");
    expect(parseNetworkAuditLocation(params)).toEqual({ check: "overview", scope: "attention" });
  });

  it("preserves unrelated params while updating the audit state", () => {
    const result = updateNetworkAuditSearch(
      new URLSearchParams("foo=bar&tab=security"),
      { tab: "audit", check: "mac", scope: "passed" },
    );

    expect(result.toString()).toBe("foo=bar&tab=audit&check=mac&scope=passed");
  });

  it("updates only the supplied audit field without mutating the current params", () => {
    const current = new URLSearchParams("foo=bar&tab=audit&check=mac&scope=attention");
    const result = updateNetworkAuditSearch(current, { scope: "passed" });

    expect(result.get("tab")).toBe("audit");
    expect(result.get("check")).toBe("mac");
    expect(result.get("foo")).toBe("bar");
    expect(result.get("scope")).toBe("passed");
    expect(current.toString()).toBe("foo=bar&tab=audit&check=mac&scope=attention");
  });
});
