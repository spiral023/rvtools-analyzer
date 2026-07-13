# VLAN-Nutzung pro Cluster — Design

**Datum:** 2026-07-13
**Status:** Freigegeben

## Ziel

Eine Ansicht, die zeigt, welche VLANs innerhalb eines Clusters **aktiv genutzt** werden —
gemessen daran, dass VM-Netzwerkadapter tatsächlich verbunden (`Connected = true`) sind.
Die bestehende „VLAN Verteilung" zeigt nur, wo VLANs *konfiguriert* sind (Portgruppen-Zählung),
nicht ob/wo laufende VMs sie nutzen und nicht nach Cluster aufgeschlüsselt.

## Datenquellen & Join

| Sheet | Genutzte Spalten | Rolle |
|-------|------------------|-------|
| `vNetwork` | `VM`, `Network`, `Connected`, `Cluster`, `Host` | VM↔Portgruppe-Verbindung, Aktiv-Status |
| `vPort` | `Port Group` → `VLAN` | Portgruppen-Name → VLAN-ID (Standard-vSwitch) |
| `dvPort` | `Port` → `VLAN` | Portgruppen-Name → VLAN-ID (Distributed-vSwitch) |
| `vInfo` | `VM` → `Cluster` | Fallback-Ableitung des Clusters, falls `vNetwork` keine `Cluster`-Spalte führt |

**Join-Key:** Portgruppen-Name (`vNetwork.Network` == `vPort."Port Group"` bzw. `dvPort.Port`).

## Aktiv-Kriterium

Nur Zeilen mit `Connected === true`. Power-State wird **nicht** berücksichtigt (bewusste Entscheidung).

## Architektur

Reine Aggregationsfunktion + Präsentations-Panel — Muster analog zu `src/lib/averageVm.ts`
(pure function) mit `src/test/averageVm.test.ts`.

### 1. `src/lib/vlanUsage.ts` (reine Funktion)

```ts
interface VlanUsageRow {
  cluster: string;
  vlan: string;        // "?" wenn Portgruppe nicht gemappt, "0 (untagged)" bei 0/leer
  portgroups: string;  // kommaseparierte, deduplizierte Portgruppen-Namen
  vmCount: number;     // distinct VMs
  hostCount: number;   // distinct Hosts
}

function buildVlanUsage(
  vNetwork: SheetRow[], vPort: SheetRow[], dvPort: SheetRow[], vInfo: SheetRow[]
): VlanUsageRow[]
```

`SheetRow` (aus `src/domain/models/types.ts`) hat `.data: Record<string, string | number | boolean | null>`.
`Connected` kann als Boolean **oder** String vorliegen — robust prüfen via
`row.data["Connected"] === true || String(row.data["Connected"]).toLowerCase() === "true"`
(analog `src/pages/DailyOps.tsx`).

Ablauf:
1. Map `portgroupName → vlanId` aus `vPort` (`Port Group`→`VLAN`) und `dvPort` (`Port`→`VLAN`).
2. Fallback-Map `vmName → cluster` aus `vInfo`.
3. Über `vNetwork` iterieren; nur `Connected === true`.
   - VLAN = Lookup über `Network`-Name; nicht gefunden → `"?"`; Wert `0`/leer → `"0 (untagged)"`.
   - Cluster = `vNetwork.Cluster`, sonst Fallback über `vInfo`; leer → `"Unbekannt"`.
4. Gruppieren nach `(cluster, vlan)`. Pro Gruppe: distinct `VM`, distinct `Host`, Portgruppen-Set.
5. Sortierung: Cluster ↑, dann `vmCount` ↓.

### 2. `src/pages/VlanUsage.tsx` — `VlanUsagePanel`

Muster wie `HostNetworkPanel` (exportiertes Panel, kein eigenes Routing).

- **KPI-Zeile:** *Aktive VLANs* (distinct VLAN-IDs), *Cluster*, *Verbundene VMs* (distinct),
  *Ohne Portgruppen-Match* (Zeilen mit `vlan === "?"` — Datenqualitäts-Indikator).
- **Tabelle:** `VirtualTable`, Spalten **Cluster | VLAN | Portgruppe(n) | # VMs | # Hosts**,
  sortierbar, `globalFilter={filters.search}`.
- Datenquelle über `useRawSheet("vNetwork" | "vPort" | "dvPort" | "vInfo")`, in `useMemo` an
  `buildVlanUsage` übergeben.

### 3. `src/pages/Networking.tsx`

Dritter Tab: `TabsTrigger value="vlan"` mit Label „VLAN-Nutzung" → `<VlanUsagePanel />`.
`NetworkTab`-Typ um `"vlan"` erweitern.

### 4. `src/lib/glossaries/networking.ts`

Neu: `NET_VLANUSAGE_KPI` (4 KPIs) und `NET_VLANUSAGE_COLUMNS` (5 Spalten) sowie ggf. ein
Sektions-Eintrag. Quellenattribution z. B.
`${RV} · vNetwork · „Connected"/„Network" · join vPort/dvPort`.

## Edge-Cases

| Fall | Verhalten |
|------|-----------|
| Portgruppe ohne VLAN-Match | Zeile bleibt, `vlan = "?"`; fließt in KPI „Ohne Portgruppen-Match" |
| VLAN `0` oder leer | Anzeige `"0 (untagged)"` |
| Fehlender Cluster | `"Unbekannt"` |
| VM mit mehreren Adaptern im selben (Cluster, VLAN) | einmal gezählt (distinct VM) |
| `vNetwork` ohne `Cluster`-Spalte | Fallback über `vInfo` VM→Cluster |
| Keine Daten geladen | Panel folgt bestehendem `EmptyState`-Verhalten der Netzwerk-Seite |

## Tests — `src/test/vlanUsage.test.ts`

- Standard-vSwitch-Join (`vPort`) liefert korrekte VLAN-Zuordnung.
- Distributed-vSwitch-Join (`dvPort`) liefert korrekte VLAN-Zuordnung.
- `Connected = false` wird ignoriert.
- VLAN `0`/leer → `"0 (untagged)"`.
- Unbekannte Portgruppe → `vlan = "?"`.
- Dieselbe VM mit zwei Adaptern im selben VLAN → `vmCount === 1`.
- Cluster-Fallback über `vInfo`, wenn `vNetwork.Cluster` fehlt.
- distinct `hostCount`.

## Nicht im Scope (YAGNI)

- VMkernel-/Host-VLAN-Nutzung (nur VM-Adapter).
- Power-State-Filter.
- Gruppierte/aufklappbare Darstellung (flache Tabelle gewählt).
- Zeitreihen/Snapshot-Vergleich.
