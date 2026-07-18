import { describe, it, expect } from "vitest";
import { isSwitchTxtContent, parseSwitchTxt } from "@/lib/switchParser";

const SAMPLE_TXT = [
  "agrznx93oc18-10# sh int statu | in connected",
  "",
  "mgmt0         --                 connected routed    full    1000    --        ",
  "",
  "Eth1/1        esxxsrv2270_Port2(T connected trunk     full    25G     SFP-H25GB-CU3M",
  "",
  " ",
  "",
  "agrznx93oc18-9# sh int statu | in notconnec",
  "",
  "Eth1/7        esxxvdi2215_Port0(T notconnec trunk     auto    auto    SFP-H25GB-CU3M",
  "",
  "agrznx93oc18-10# sh int statu | in notconnec",
  "",
  "Eth1/5        esxxsrv2275_Port2(T notconnec trunk     auto    auto    SFP-H25GB-CU3M",
].join("\n");

describe("isSwitchTxtContent", () => {
  it("erkennt eine gültige Cisco-Switch-CLI-Ausgabe", () => {
    expect(isSwitchTxtContent(SAMPLE_TXT)).toBe(true);
  });

  it("erkennt die alternative Langform (show interface status | include)", () => {
    expect(isSwitchTxtContent("sw01# show interface status | include connected\n\nEth1/1 -- connected trunk full 10G --")).toBe(true);
  });

  it("lehnt beliebigen Text ohne Prompt-Zeile ab", () => {
    expect(isSwitchTxtContent("Irgendein Text ohne Cisco-Prompt.\nZeile 2.")).toBe(false);
  });
});

describe("parseSwitchTxt", () => {
  it("gruppiert Abschnitte nach Hostname und zählt Interfaces korrekt", () => {
    const result = parseSwitchTxt(SAMPLE_TXT);

    expect(result.switches.size).toBe(2);
    expect(result.totalInterfaceCount).toBe(4);
    expect(result.warnings).toHaveLength(0);

    const oc18_10 = result.switches.get("agrznx93oc18-10");
    expect(oc18_10).toHaveLength(2);
    expect(oc18_10?.[0].filter).toBe("connected");
    expect(oc18_10?.[0].interfaces.map((i) => i.interface)).toEqual(["mgmt0", "Eth1/1"]);
    expect(oc18_10?.[1].filter).toBe("notconnec");
    expect(oc18_10?.[1].interfaces.map((i) => i.interface)).toEqual(["Eth1/5"]);

    const oc18_9 = result.switches.get("agrznx93oc18-9");
    expect(oc18_9).toHaveLength(1);
    expect(oc18_9?.[0].interfaces).toHaveLength(1);
  });

  it("bereinigt Description: '--' wird leer, Klammer-Suffix wird abgeschnitten", () => {
    const result = parseSwitchTxt(SAMPLE_TXT);
    const mgmt = result.switches.get("agrznx93oc18-10")?.[0].interfaces[0];
    const eth1 = result.switches.get("agrznx93oc18-10")?.[0].interfaces[1];

    expect(mgmt?.description).toBe("");
    expect(mgmt?.mode).toBe("routed");
    expect(mgmt?.transceiver).toBe("--");
    expect(eth1?.description).toBe("esxxsrv2270_Port2");
  });

  it("überspringt Zeilen vor dem ersten Prompt und unbekannte Zeilenformate mit Warning", () => {
    const withJunk = [
      "Some banner text before the first prompt",
      "sw01# sh int statu | in connected",
      "",
      "this line matches no known format",
      "Eth1/1        --                 connected trunk     full    10G     --",
    ].join("\n");

    const result = parseSwitchTxt(withJunk);
    expect(result.totalInterfaceCount).toBe(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Zeile 4");
  });

  it("liefert eine leere Map, wenn keine Prompt-Zeile gefunden wird", () => {
    const result = parseSwitchTxt("Kein Prompt hier.\nNoch eine Zeile.");
    expect(result.switches.size).toBe(0);
    expect(result.totalInterfaceCount).toBe(0);
  });
});
