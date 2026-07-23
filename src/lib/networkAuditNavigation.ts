import type { NetworkAuditCheckRoute, NetworkAuditScope } from "@/lib/networkAuditViewModel";

export type NetworkTab = "security" | "host" | "vlan" | "cdp" | "ipam" | "eramon-iface" | "eramon-l2" | "audit";

const NETWORK_TABS: readonly NetworkTab[] = [
  "security",
  "host",
  "vlan",
  "cdp",
  "ipam",
  "eramon-iface",
  "eramon-l2",
  "audit",
];
const NETWORK_AUDIT_CHECKS: readonly NetworkAuditCheckRoute[] = ["overview", "ports", "hosts", "mac", "discovery"];
const NETWORK_AUDIT_SCOPES: readonly NetworkAuditScope[] = ["attention", "passed", "all"];

function includes<T extends string>(values: readonly T[], value: string | null): value is T {
  return value !== null && values.includes(value as T);
}

export function isNetworkTab(value: string): value is NetworkTab {
  return includes(NETWORK_TABS, value);
}

export function parseNetworkTab(params: URLSearchParams, fallback: NetworkTab): NetworkTab {
  const tab = params.get("tab");
  return tab !== null && isNetworkTab(tab) ? tab : fallback;
}

export function parseNetworkAuditLocation(params: URLSearchParams): {
  check: NetworkAuditCheckRoute;
  scope: NetworkAuditScope;
} {
  const check = params.get("check");
  const scope = params.get("scope");

  return {
    check: includes(NETWORK_AUDIT_CHECKS, check) ? check : "overview",
    scope: includes(NETWORK_AUDIT_SCOPES, scope) ? scope : "attention",
  };
}

export function updateNetworkAuditSearch(
  current: URLSearchParams,
  patch: Partial<{ tab: NetworkTab; check: NetworkAuditCheckRoute; scope: NetworkAuditScope }>,
): URLSearchParams {
  const next = new URLSearchParams(current);

  if (patch.tab !== undefined) next.set("tab", patch.tab);
  if (patch.check !== undefined) next.set("check", patch.check);
  if (patch.scope !== undefined) next.set("scope", patch.scope);

  return next;
}
