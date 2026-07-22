# Netzwerk-Kontrolle: Eramon ↔ CDP integrieren (Port-Join + MAC-Abgleich) — Design

**Datum:** 2026-07-23
**Status:** Freigegeben

## Ziel

Der Tab „Kontrolle" (`NetworkAuditPanel`) gleicht heute Cisco-Switch-TXT-Ports
gegen CDP-, RVTools-, TechInfo- und IPAM-Daten ab. Mit den beiden Eramon-Quellen
(iface = physisches Port-Inventar, L2 = MAC-Tabelle) kommen zwei weitere
unabhängige Sichten hinzu. Dieser Ausbau integriert sie in die Kontrolle:

1. **Teil A — Port-Join CDP ↔ Eramon-iface:** Eramon-iface ist funktional
   dieselbe Datenart wie die Cisco-TXT (Port-Inventar aus Switch-Sicht). Beide
   Quellen werden in **einer** Port-Tabelle über `switchNorm::interfaceNorm`
   zusammengeführt. Reine Eramon-Ports durchlaufen automatisch die bestehende
   CDP-Bestätigung — genau der gewünschte Join ESX-vmnic ↔ physischer Port.
2. **Teil B — MAC-Abgleich CDP ↔ Eramon-L2:** Eine zweite, MAC-basierte Achse.
   Zwei Perspektiven: CDP-Adapter über die L2-MAC-Tabelle bestätigen, und
   L2-Discovery (welche MAC/IP hängt an welchem Port, bekannt oder fremd).

Alles clientseitig aus den bestehenden `*_latest`-Stores, per `useMemo`
abgeleitet — **kein neuer IndexedDB-Store, keine DB-Versionsänderung**,
konsistent mit dem heutigen Kontrolle-Muster.

## Warum clientseitig (unverändert)

Der Abgleich hängt von mehreren unabhängig importierbaren Quellen ab. Eine beim
Import vorberechnete Auswertung müsste bei jedem der Importe neu angestoßen
werden, sonst driftet sie vom Datenstand weg. Bei realistischen Mengen (hunderte
Ports, tausende L2-Einträge) ist die On-the-fly-Berechnung pro Seitenaufruf
trivial schnell und immer konsistent — dasselbe Muster wie heute.

## Teil A: Port-Join CDP ↔ Eramon-iface

### Zusammenführung der Port-Basis

`buildPortAuditRows` (in `src/lib/networkAudit.ts`) erhält einen zusätzlichen
Eingang `eramonIfaceRows: EramonIfaceLatest[]`. Die Port-Basis wird zur
**Vereinigungsmenge über `${switchNorm}::${interfaceNorm}`**:

- `switchNorm`: bei Cisco `shortHostname(port.hostname)`, bei Eramon
  `shortHostname(iface.deviceName)` — beide über `normalizeInterfaceName` bzw.
  `shortHostname` auf dieselbe Form gebracht.
- `interfaceNorm`: `normalizeInterfaceName(...)` (bestehend) auf `interface`
  (Cisco) bzw. `portName` (Eramon).
- Ein Port, der in beiden Quellen vorkommt, ergibt **eine** Zeile.

### Neue Felder auf `PortAuditRow`

```ts
sources: ("cisco" | "eramon")[];   // Herkunft (eine oder beide)
bandwidthBps: number | null;        // aus Eramon, via formatBandwidth angezeigt
sourceConflict: boolean;            // Cisco- und Eramon-Sicht widersprechen sich
```

- **`description`/`status` (Anzeige):** Cisco bevorzugt, sonst Eramon.
  Für Eramon werden `portDesc` (→ description) und `statusLabel`
  (`aktiv`/`down` → für Konfliktprüfung auf `connected`/nicht-`connected`
  gemappt) herangezogen.
- **`matchedSource` bleibt `{cdp, rvtools, techinfo, ipam}`** — Eramon ist
  switch-seitig und damit Teil der Basis, kein Label-Ziel. Ein reiner
  Eramon-Port bekommt seinen `candidate` aus `portDesc` und durchläuft die
  bestehende Matchkette unverändert.

### Quellen-Konflikt (`sourceConflict`)

Gesetzt, wenn Cisco- und Eramon-Sicht desselben Ports sich widersprechen:

- **Beschriftung:** beide Beschreibungen nicht leer und
  `shortHostname(cisco.description-candidate)` ≠ `shortHostname(eramon.portDesc-candidate)`.
- **Status:** Cisco `connected` vs. Eramon `down` (bzw. umgekehrt Cisco
  nicht-`connected` vs. Eramon `aktiv`).

Findings-Text z. B.: „Cisco-Beschriftung nennt X, Eramon-Beschriftung nennt Y"
bzw. „Cisco meldet connected, Eramon meldet down". Rein informativ (die Exporte
können zu unterschiedlichen Zeitpunkten gezogen worden sein).

### Automatischer CDP-Join

Da Eramon-Ports jetzt in der Basismenge liegen, greift der bestehende
CDP-Index (`cdpByPort`, Key `switchNorm::interfaceNorm`) automatisch auch auf
reine Eramon-Ports. Ein Eramon-Port mit CDP-Treffer wird `confirmed-cdp` — ohne
neue Match-Logik. Das ist der Join ESX-Host/vmnic ↔ physischer Switch-Port.

### Port-Tabelle (erweitert)

| Spalte | Quelle | Status |
|---|---|---|
| Switch, Port, Beschreibung, Status | wie heute (Beschreibung/Status Cisco-bevorzugt) | — |
| **Bandbreite** | Eramon `bandbreiteBps` → `formatBandwidth` | neu |
| **Quelle** | Badge „Cisco" / „Eramon" / „beide" | neu |
| Match-Status, Vermuteter Host, Auffälligkeit | wie heute; Auffälligkeit zeigt zusätzlich Quellen-Konflikte | erweitert |

KPI-Zeile ergänzt um **„Nur in Eramon"** (Ports ohne Cisco-Pendant) und
**„Quellen-Konflikte"** (⚠ bei > 0). Der „Nur Auffälligkeiten"-Toggle
berücksichtigt `sourceConflict` zusätzlich zu den bestehenden Kriterien.

## Teil B: MAC-Abgleich CDP ↔ Eramon-L2

### Neue Kanonisierung

```ts
/** "00:50:56:AB:CD:EF" | "0050.56ab.cdef" | "00-50-56-ab-cd-ef" → "005056abcdef";
 *  null oder < 12 Hex-Zeichen → null. */
function canonicalMac(raw: string | null): string | null
```

Nötig, weil CDP-MACs im VMware-Format (`00:50:56:…`) und Eramon-L2-MACs im
Cisco-Format (`0050.56ab.…`) roh gespeichert sind. Grundlage beider MAC-Tabellen.

### Neue reine Funktionen

```ts
export function buildCdpMacRows(input: {
  cdpRows: CdpLatest[];
  l2Rows: EramonL2Latest[];
}): CdpMacRow[]

export function buildL2DiscoveryRows(input: {
  l2Rows: EramonL2Latest[];
  cdpRows: CdpLatest[];
  ipam: IpamLatest[];
}): L2DiscoveryRow[]
```

Interner Index: `Map<canonicalMac, EramonL2Latest[]>` (eine MAC kann auf mehreren
VLANs/Ports gelernt sein), sowie `Set<canonicalMac>` der CDP-Adapter für die
Discovery-Klassifikation.

### Tabelle 3a — CDP-Adapter bestätigen

Zeile pro ESXi-vmnic **× L2-Treffer**. Adapter ohne L2-Treffer ergeben eine
Zeile mit „fehlt".

| Host | vmnic | MAC | In L2? | Switch/Port (L2) | VLAN | Gelernte IP | DNS | Auffälligkeit |
|---|---|---|---|---|---|---|---|---|

Findings:
- MAC nicht in L2 gelernt → ⚠ „MAC nicht in L2-Tabelle".
- L2 lernt MAC auf anderem Switch/Port als CDP meldet (Vergleich gegen
  `extractCdpDeviceHostname(cdp.cdpDeviceId)` + `normalizeInterfaceName(cdp.cdpPortId)`)
  → ⚠ „Topologie weicht ab" (weicher Hinweis — Trunk/Uplink möglich).

Toggle „Nur Auffälligkeiten" (Default an) blendet sauber bestätigte Adapter aus.

### Tabelle 3b — Netz-Discovery

Zeile pro L2-Eintrag.

| Switch/Port | VLAN | MAC | Gelernte IP | DNS | Klassifikation | Host (falls ESXi) |
|---|---|---|---|---|---|---|

Klassifikation (erster Treffer gewinnt):
1. `ESXi (CDP)` — `canonicalMac` = bekannter CDP-vmnic; Host wird angezeigt.
2. `IPAM-bekannt` — gelernte IP in IPAM vorhanden.
3. `Unbekannt/Fremd` — sonst.

Toggle „Nur Unbekannte" (Default an) fokussiert auf fremde/nicht zuordenbare
Geräte.

### Sektions-Rahmen

Beide Tabellen leben in einer neuen Sektion „MAC-Abgleich (Eramon L2)" im selben
Tab, aufgebaut wie die bestehende „Host-Datenabgleich"-Sektion (Kopf mit
Beschreibung + „X von Y"-Zähler pro Tabelle, eigener Toggle je Tabelle). Keine
eigenen KPI-Karten — schlank über Kopf-Zähler.

## Datenmodell (nur TypeScript)

```ts
export interface CdpMacRow {
  host: string;
  adapter: string;
  mac: string | null;              // Roh-Anzeige (CDP)
  macCanonical: string | null;
  inL2: boolean;
  l2Switch: string | null;
  l2Interface: string | null;
  vlan: string | null;
  learnedIp: string | null;
  dnsName: string | null;
  topologyMismatch: boolean;
  finding: string | null;
}

export type L2Classification = "esxi-cdp" | "ipam" | "unknown";

export interface L2DiscoveryRow {
  l2EntryKey: string;
  switchName: string;
  interface: string;
  vlan: string;
  mac: string;                     // Roh-Anzeige (L2)
  learnedIp: string | null;
  dnsName: string | null;
  classification: L2Classification;
  esxiHost: string | null;         // gesetzt bei classification === "esxi-cdp"
}
```

## Hook & Panel

- **`useNetworkAudit()`** ([useActiveSnapshots.ts](src/hooks/useActiveSnapshots.ts)):
  zusätzlich `useAllEramonIfaceLatest` + `useAllEramonL2Latest`; reicht sie in
  `buildPortAuditRows` (Eramon-iface) und die zwei neuen MAC-Build-Funktionen.
  Liefert `{ rows, hostQuality, cdpMacRows, l2DiscoveryRows, isLoading }`.
- **`NetworkAuditPanel`** ([NetworkAuditPanel.tsx](src/pages/NetworkAuditPanel.tsx)):
  Port-Tabelle um Bandbreite/Quelle erweitert; KPIs um „Nur in Eramon"/
  „Quellen-Konflikte"; neue Sektion „MAC-Abgleich (Eramon L2)" mit zwei
  `VirtualTable` + je einem Toggle.

## EmptyState

Heute an Cisco-Switch-Daten geknüpft. Künftig „keine Daten", wenn Cisco-Switch
**und** Eramon-iface **und** CDP alle leer sind — Eramon zählt als vollwertige
Switch-Quelle, damit der Tab auch ohne Cisco-TXT funktioniert.

## Glossar

[networking.ts](src/lib/glossaries/networking.ts):
- `NET_AUDIT_KPI`/`NET_AUDIT_COLUMNS` um Bandbreite, Quelle, „Nur in Eramon",
  „Quellen-Konflikte" ergänzen.
- Neu: `NET_MAC_CDP_COLUMNS` und `NET_MAC_DISCOVERY_COLUMNS`, mit
  `${ERAMON}`-Quellenattribution (Muster wie bestehende CDP-/IPAM-Einträge).

## Tests

[networkAudit.test.ts](src/test/networkAudit.test.ts) erweitern (reine Funktionen,
keine DB-/Import-Tests):

- `canonicalMac`: alle drei Formate → gleiche kanonische Form; null/zu kurz → null.
- Port-Union: derselbe Port aus Cisco+Eramon → eine Zeile, `sources = ["cisco","eramon"]`.
- Quellen-Konflikt: abweichende Beschreibung bzw. Status → `sourceConflict = true`.
- Reiner Eramon-Port mit CDP-Treffer → `matchStatus = "confirmed-cdp"`.
- MAC-Join: CDP-MAC `00:50:56:ab:cd:ef` findet L2-MAC `0050.56ab.cdef`.
- CDP-Adapter ohne L2-Eintrag → `inL2 = false`, Finding „MAC nicht in L2-Tabelle".
- Topologie-Abweichung: L2-Switch/Port ≠ CDP → `topologyMismatch = true`.
- Discovery-Klassifikation: je ein Fall `esxi-cdp`, `ipam`, `unknown`.

## Edge-Cases

| Fall | Verhalten |
|---|---|
| Weder Cisco noch Eramon noch CDP importiert | `EmptyState` mit Upload-Link |
| Nur Eramon-iface (keine Cisco-TXT) | Ports erscheinen, Quelle „Eramon", CDP-Bestätigung greift normal |
| MAC leer/ungültig in CDP oder L2 | `canonicalMac` → null, kein MAC-Join für diese Zeile |
| MAC auf mehreren VLANs/Ports in L2 | je Treffer eine Zeile in 3a; alle Einträge einzeln in 3b |
| Eramon-Port ohne `bandbreiteBps` | Bandbreite-Spalte „—" (via `formatBandwidth`) |
| Cisco- und Eramon-Beschreibung identisch | kein `sourceConflict` |

## Nicht im Scope (YAGNI)

- Teil C: RVTools-VM-Netzwerkadapter-MACs ↔ L2-Tabelle (VM-Ebene) — bewusst
  zurückgestellt, großer neuer vNetwork-Join.
- Verlaufs-/Historienvergleich über mehrere Importe.
- Persistentes Bestätigen/Dismiss einzelner Findings.
- Doppel-IP-Erkennung (IPAM).
- Änderungen an den übrigen Netzwerk-Tabs — nur „Kontrolle" wird ausgebaut.
