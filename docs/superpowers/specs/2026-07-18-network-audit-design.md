# Netzwerk-Kontrolle: Switch-Port-Audit über CDP/Switch/RVTools/TechInfo/IPAM — Design

**Datum:** 2026-07-18
**Status:** Freigegeben

## Ziel

Mit CDP-, Switch-, IPAM-, RVTools- und TechInfo-Daten liegen jetzt fünf unabhängige
Quellen vor, die sich gegenseitig bestätigen oder widersprechen können. Ein neuer
Tab „Kontrolle" im Netzwerk-Bereich führt sie zu einer Port-zentrierten Ansicht
zusammen und deckt konkret auf:

1. **Abgebaute/unbekannte Hosts** — ein Switch-Port ist laut Beschriftung noch
   einem Host zugeordnet, der in der aktuellen RVTools-Inventur nicht mehr existiert.
2. **Falsch dokumentierte Hosts** — die Port-Beschriftung nennt einen anderen Host
   als den, der laut CDP tatsächlich an diesem Port hängt.
3. **Status-Widersprüche** — der Switch meldet `notconnec`, obwohl CDP den
   zugehörigen Host-Adapter als verbunden zeigt (oder umgekehrt).

Alles wird clientseitig aus den bereits importierten `*_latest`-Stores berechnet —
kein neuer IndexedDB-Store, keine DB-Versionsänderung.

## Warum clientseitig statt vorberechnet

Der Abgleich hängt von vier unabhängig importierbaren Quellen ab (RVTools, TechInfo,
IPAM, Switch; CDP kommt im RVTools-Export mit). Eine beim Import vorberechnete und
persistierte Auswertung müsste bei jedem einzelnen dieser vier Imports neu angestoßen
werden, sonst driftet sie unbemerkt vom aktuellen Datenstand weg. Bei den realistischen
Datenmengen (Hunderte Switch-Ports) ist eine On-the-fly-Berechnung pro Seitenaufruf
trivial schnell und immer konsistent — das bestehende Muster, das CDP-, IPAM- und
Security-Panel bereits nutzen (Rohdaten aus IndexedDB laden, Ableitung per `useMemo`).

## Normalisierung & Matching-Algorithmus

Neues Modul `src/lib/networkAudit.ts`, reine Funktionen, kein React/DB-Zugriff.

### Hilfsfunktionen

```ts
/** "esxxsrv2270.rbgooe.at" → "esxxsrv2270"; "esxxsrv2270" → "esxxsrv2270" */
function shortHostname(name: string): string

/** "esxxsrv2270_Port2" → "esxxsrv2270"; "esxxsrv2270" (kein Suffix) → unverändert */
function stripPortSuffix(description: string): string

/** "grznx93oc18-8.domain.at(FDO26040UFF)" → "grznx93oc18" — Seriennummer in Klammern
 *  und Domain-Suffix abschneiden, dann shortHostname */
function extractCdpDeviceHostname(cdpDeviceId: string): string

/** "Ethernet1/13" → "eth1/13"; "Eth1/1" → "eth1/1" — für den Vergleich
 *  CDP-`cdpPortId` ↔ Switch-`interface` */
function normalizeInterfaceName(raw: string): string
```

Alle Vergleiche laufen über `normalizeVmNameForMatch` (bestehend, trim+lowercase)
auf den bereits kürzeren Strings — kein neuer Fuzzy-/Levenshtein-Algorithmus.

### Schritt 1: CDP ↔ Switch strukturell verknüpfen

Index `Map<"${switchHostnameNorm}::${interfaceNorm}", CdpLatest>` aus allen
`CdpLatest`-Einträgen mit `cdpAvailable === true` aufbauen (Key aus
`extractCdpDeviceHostname(cdpDeviceId)` + `normalizeInterfaceName(cdpPortId)`).
Für jeden `SwitchLatest`-Eintrag wird per gleichem Key nachgeschlagen — Treffer heißt
„dieser Port ist über CDP mit Host X, Adapter Y bestätigt".

### Schritt 2: Match-Status je Switch-Port

Zuerst wird für jeden Port die Kandidaten-Variable `candidate = stripPortSuffix(description)`
gebildet (einmalig, wird auch in Schritt 3 wiederverwendet). Danach, Reihenfolge,
erster Treffer gewinnt — `confirmed-cdp` steht bewusst vor `no-target`: ein
unbeschrifteter, aber über CDP strukturell bestätigter Port ist kein Sonderfall,
sondern schlicht bestätigt:

| Status | Bedingung |
|---|---|
| `confirmed-cdp` | Schritt 1 liefert einen CDP-Treffer für diesen Port (unabhängig von `description`) |
| `no-target` | kein CDP-Treffer **und** `description` leer oder `--` (z. B. `mgmt0` ohne CDP-Nachbarschaft) |
| `text-match` | kein CDP-Treffer, `candidate` vorhanden, `shortHostname(candidate)` matcht `shortHostname(host)` eines Hosts aus der **aktiven RVTools-Inventur** (`NormalizedHost.host`) |
| `documented-only` | kein RVTools-Match, aber Match gegen `TechInfoLatest.vmName` (Priorität) oder — falls dort kein Treffer — `IpamLatest.name` |
| `unknown` | kein Match in keiner der drei Quellen |

Die TechInfo-vor-IPAM-Priorität ist willkürlich, aber deterministisch nötig, falls
ein Name in beiden Quellen vorkommt (`matchedSource` zeigt an, welche Quelle den
Treffer geliefert hat). `documented-only` ist der Kern der „abgebaute Hosts"-
Erkennung: der Name ist irgendwo dokumentiert, aber nicht mehr Teil der aktuellen
RVTools-Inventur.

### Schritt 3: Zusatz-Flags (nur wenn `confirmed-cdp`)

- **Beschriftungs-Konflikt** (`labelConflict`): `shortHostname(candidate)` (aus
  Schritt 2) ≠ `shortHostname(cdp.host)`. Beschriftung und CDP-Wahrheit zeigen auf
  unterschiedliche Hosts. Ist `candidate` leer (`no-target`), wird kein
  Beschriftungs-Konflikt geprüft — ein unbeschrifteter, aber CDP-bestätigter Port
  ist kein Widerspruch.
- **Status-Konflikt** (`statusConflict`): `switch.status === "connected"` und
  `cdp.linkStatus` ≠ `"Up"` (case-insensitiv) — oder umgekehrt, `switch.status`
  ≠ `"connected"` und `cdp.linkStatus === "Up"`.

Beide sind reine Review-Hinweise (keine harten Fehler) — CDP- und Switch-Export
können zu unterschiedlichen Zeitpunkten gezogen worden sein.

## Datenmodell (nur TypeScript, keine DB-Änderung)

```ts
export type PortMatchStatus = "no-target" | "confirmed-cdp" | "text-match" | "documented-only" | "unknown";
export type MatchedSource = "cdp" | "rvtools" | "techinfo" | "ipam";

export interface PortAuditRow {
  switchInterfaceKey: string;
  switchHostname: string;
  interface: string;
  description: string | null;
  status: string | null;              // roh aus SwitchLatest (connected/notconnec/notconnect)
  matchStatus: PortMatchStatus;
  matchedHost: string | null;
  matchedSource: MatchedSource | null;
  labelConflict: boolean;
  labelConflictHost: string | null;   // der CDP-bestätigte Host, wenn labelConflict
  statusConflict: boolean;
}

export function buildPortAuditRows(input: {
  switchRows: SwitchLatest[];
  cdpRows: CdpLatest[];
  hosts: NormalizedHost[];
  techInfo: TechInfoLatest[];
  ipam: IpamLatest[];
}): PortAuditRow[]
```

`buildPortAuditRows` ist die einzige exportierte Einstiegsfunktion; die
Hilfsfunktionen bleiben modul-intern (bis auf Testbarkeit — werden für Unit-Tests
mitexportiert).

## Hook & Panel

- **`useNetworkAudit()`** (neu, `src/hooks/useActiveSnapshots.ts`): kombiniert
  `useAllSwitchLatest`, `useAllCdpLatest`, `useHosts()` (aktive RVTools-Hosts,
  respektiert bestehenden vCenter-Filter), `useAllTechInfoLatest`, `useAllIpamLatest`;
  ruft `buildPortAuditRows` per `useMemo` auf.
- **`src/pages/NetworkAuditPanel.tsx`** (neu, Muster `SwitchPanel`/`IpamPanel`):
  - KPI-Zeile: Ports gesamt, CDP-bestätigt, Nur dokumentiert (⚠), Unbekannt (⚠),
    Status-Konflikte (⚠), Beschriftungs-Konflikte (⚠).
  - `VirtualTable`: Switch | Interface | Beschreibung | Status | Match-Status
    (Badge) | Vermuteter Host | Auffälligkeit (Freitext, z. B. „Beschriftung nennt
    esxxsrv2270, CDP zeigt esxxsrv2281" oder „Switch meldet notconnec, CDP zeigt
    Host als verbunden").
  - Toggle „Nur Auffälligkeiten" (Default an): blendet Zeilen mit
    `matchStatus ∈ {confirmed-cdp}` ohne Konflikt-Flags und `no-target` aus, damit
    nicht durch hunderte unauffällige Zeilen gescrollt werden muss.
  - `EmptyState`, falls weder Switch- noch CDP-Daten vorhanden sind (Link zum Upload).

## Netzwerk-Seite

`src/pages/Networking.tsx`: sechster Tab `value="audit"`, Label „Kontrolle",
`NetworkTab`-Typ erweitern, Panel `NetworkAuditPanel` importieren.

## Edge-Cases

| Fall | Verhalten |
|---|---|
| Kein Switch-Import vorhanden | `EmptyState` mit Upload-Link |
| Switch-Import vorhanden, aber kein CDP-Import | alle Ports maximal `text-match`/`documented-only`/`unknown`, kein `confirmed-cdp`, keine Konflikt-Flags berechenbar |
| CDP-Eintrag mit `cdpAvailable = false` | fließt nicht in den CDP↔Switch-Index ein (Schritt 1) |
| Mehrere RVTools-Snapshots/vCenter aktiv | `useHosts()` liefert bereits nur die per Filter aktiven Hosts — Verhalten konsistent mit übrigen Panels |
| Name kommt sowohl in RVTools als auch TechInfo/IPAM vor | zählt als `confirmed-cdp`/`text-match` (RVTools hat Vorrang) — kein Konflikt |
| `description` „--" oder leer (z. B. `mgmt0`) | `no-target`, wird per Default aus der gefilterten Ansicht ausgeblendet |
| Zwei Switch-Ports mit identischer Beschreibung (z. B. Portname-Tippfehler dupliziert) | jeder Port wird unabhängig ausgewertet — kein Dubletten-Check in v1 |

## Tests

- `src/test/networkAudit.test.ts` (neu): Hilfsfunktionen (`shortHostname`,
  `stripPortSuffix`, `extractCdpDeviceHostname`, `normalizeInterfaceName`) sowie
  `buildPortAuditRows` mit synthetischen Kleindatensätzen für jeden `matchStatus`-Wert
  und beide Konflikt-Flags (inkl. FQDN- vs. non-FQDN-Fall aus der Aufgabenstellung).
- Kein Persistenz-/Import-Test nötig (keine DB-Änderung).
- Manuell: mit den echten Referenzdaten (`referenzdaten/switch.txt`, `ipam.csv`,
  Server-Doku) End-to-End im Browser prüfen, dass die KPI-Zahlen und Beispiel-Konflikte
  plausibel sind.

## Nicht im Scope (YAGNI)

- Doppelte-IP-Erkennung (IPAM).
- VLAN-Konsistenz zwischen RVTools-Portgroups und Switch-Mode.
- Verlaufs-/Historienvergleich über mehrere Importe hinweg („wann wurde der Host abgebaut").
- Persistente Bestätigung/Dismiss einzelner Findings.
- Glossar-Tooltips (`NET_AUDIT_*`) — optionaler Folge-Schritt, analog IPAM/CDP.
