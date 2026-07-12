# Uplink-Namen im Netzwerkdiagramm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Im Netzwerkdiagramm zeigt jede vmnic ihren Uplink-Namen statt der Link-Geschwindigkeit.

**Architecture:** Eine kleine reine Formatierungsfunktion liefert entweder den Uplink-Namen oder `nicht zugewiesen`. `VariantDetailDialog` nutzt sie ausschließlich für die sichtbare zweite Zeile im Port-Kästchen; Tooltip und Legende bleiben unverändert.

**Tech Stack:** React 18, TypeScript, Vitest, SVG.

---

### Task 1: Uplink-Beschriftung testgetrieben bereitstellen

**Files:**

- Create: `src/lib/networkDiagram.ts`
- Create: `src/test/networkDiagram.test.ts`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

```ts
import { describe, expect, it } from "vitest";
import { getUplinkDiagramLabel } from "@/lib/networkDiagram";

describe("getUplinkDiagramLabel", () => {
  it("zeigt den Uplink-Namen oder eine klare Fallback-Beschriftung", () => {
    expect(getUplinkDiagramLabel("Uplink 1")).toBe("Uplink 1");
    expect(getUplinkDiagramLabel("")).toBe("nicht zugewiesen");
  });
});
```

- [ ] **Step 2: Den Test ausführen und das erwartete Fehlschlagen prüfen**

Run: `npm run test -- src/test/networkDiagram.test.ts`

Expected: FAIL, weil `@/lib/networkDiagram` noch nicht existiert.

- [ ] **Step 3: Die minimale Funktion implementieren**

```ts
export function getUplinkDiagramLabel(uplink: string): string {
  return uplink.trim() || "nicht zugewiesen";
}
```

- [ ] **Step 4: Den Unit-Test erneut ausführen**

Run: `npm run test -- src/test/networkDiagram.test.ts`

Expected: PASS mit einem erfolgreichen Test.

- [ ] **Step 5: Commit erstellen**

```bash
git add src/lib/networkDiagram.ts src/test/networkDiagram.test.ts
git commit -m "feat: add network uplink diagram labels"
```

### Task 2: Beschriftung im Diagramm verwenden

**Files:**

- Modify: `src/components/network/VariantDetailDialog.tsx:1-220`
- Verify: `src/test/networkDiagram.test.ts`

- [ ] **Step 1: Die reine, getestete Funktion importieren und nutzen**

```tsx
import { getUplinkDiagramLabel } from "@/lib/networkDiagram";

<text x={px} y={portY + 30} fontSize={9.5} textAnchor="middle" fill="hsl(var(--muted-foreground))">
  {getUplinkDiagramLabel(nic.uplink)}
</text>
```

Ersetze nur die bisherige sichtbare `speed`-Zeile im vmnic-Port-Kästchen. Den bestehenden SVG-`title`-Text mit Geschwindigkeit und die Legende nicht verändern.

- [ ] **Step 2: Unit-Test und TypeScript-Prüfung ausführen**

Run: `npm run test -- src/test/networkDiagram.test.ts; npm run typecheck`

Expected: Beide Befehle beenden sich mit Exit-Code 0.

- [ ] **Step 3: Commit erstellen**

```bash
git add src/components/network/VariantDetailDialog.tsx
git commit -m "feat: show uplink names in network diagram"
```

### Task 3: Gesamtprüfung

**Files:**

- Verify: `src/lib/networkDiagram.ts`
- Verify: `src/components/network/VariantDetailDialog.tsx`
- Verify: `src/test/networkDiagram.test.ts`

- [ ] **Step 1: Tests, Lint und Build ausführen**

Run: `npm run test; npm run lint; npm run build`

Expected: Alle Tests bestehen, ESLint meldet keine Fehler und Vite erstellt `dist` erfolgreich.
