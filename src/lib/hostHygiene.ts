import type { SheetRow } from "@/domain/models/types";

export interface HostHygieneRow {
  host: string;
  ntpServers: string;
  ntpdRunning: boolean;
  dnsServers: string;
  dhcp: boolean;
  issues: string;
}

export function buildHostHygieneRows(rawVHost: SheetRow[]): HostHygieneRow[] {
  return rawVHost.flatMap((row) => {
    const ntpServers = String(row.data["NTP Server(s)"] || "");
    const ntpdRunning = String(row.data["NTPD running"] || "").toLowerCase() === "true";
    const dnsServers = String(row.data["DNS Servers"] || "");
    const dhcp = String(row.data["DHCP"] || "").toLowerCase() === "true";
    const issues = [
      !ntpServers ? "Kein NTP" : "",
      !ntpdRunning ? "NTPD nicht aktiv" : "",
      !dnsServers ? "Kein DNS" : "",
      dhcp ? "DHCP aktiv" : "",
    ].filter(Boolean);

    return issues.length > 0
      ? [{
          host: String(row.data["Host"] || ""),
          ntpServers: ntpServers || "—",
          ntpdRunning,
          dnsServers: dnsServers || "—",
          dhcp,
          issues: issues.join(", "),
        }]
      : [];
  });
}
