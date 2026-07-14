# Hardware Variant Markdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to copy the hardware-variant detail view as Markdown.

**Architecture:** A pure Markdown builder in `detailMarkdown.ts` receives the selected `HardwareModelGroup` and uses the existing variant-summary service to produce the dialog's inventory data. `VariantDetailDialog` uses the same clipboard and toast pattern as `HostDetailDialog`, leaving presentation and export formatting independent.

**Tech Stack:** React 18, TypeScript, Vitest, Sonner.

---

### Task 1: Build hardware-variant Markdown

**Files:**
- Modify: `src/lib/detailMarkdown.ts:1-340`
- Modify: `src/test/detailMarkdown.test.ts:1-215`

- [x] **Step 1: Write the failing Markdown-builder test**

```ts
const markdown = buildHardwareVariantMarkdown(variant);

expect(markdown).toContain("# Hardware-Variante PowerEdge R750");
expect(markdown).toContain("| Hosts | 2 |");
expect(markdown).toContain("## Cluster-Aufschlüsselung");
expect(markdown).toContain("| Cluster-A | 2 | 96 | 1.0 TiB | 40 |");
expect(markdown).toContain("## Hosts");
expect(markdown).toContain("| esx01.local | Cluster-A | 48 | 512.0 GiB | 20 |");
```

- [x] **Step 2: Run the focused test to verify it fails**

Run: `npm run test -- src/test/detailMarkdown.test.ts`

Expected: FAIL because `buildHardwareVariantMarkdown` is not exported.

- [x] **Step 3: Add the pure Markdown builder**

```ts
export function buildHardwareVariantMarkdown(group: HardwareModelGroup): string {
  const summary = buildVariantSummary(group);
  return [
    `# Hardware-Variante ${group.modelLabel}`,
    section("Konfiguration", [/* Modell, CPU und Summen */]),
    "## Cluster-Aufschlüsselung",
    markdownTable(/* cluster rows */),
    "## Hosts",
    markdownTable(/* sorted host rows */),
  ].join("\\n");
}
```

- [x] **Step 4: Run the focused test to verify it passes**

Run: `npm run test -- src/test/detailMarkdown.test.ts`

Expected: all detail-markdown tests pass.

### Task 2: Add the copy control to the variant dialog

**Files:**
- Modify: `src/pages/Hardware.tsx:414-540`

- [x] **Step 1: Add a Markdown copy handler**

```tsx
const copyMarkdown = async () => {
  try {
    await navigator.clipboard.writeText(buildHardwareVariantMarkdown(group));
    toast.success("Varianten-Details als Markdown kopiert.");
  } catch {
    toast.error("Varianten-Details konnten nicht kopiert werden.");
  }
};
```

- [x] **Step 2: Add the accessible copy button**

```tsx
<Button aria-label="Varianten-Details als Markdown kopieren" onClick={() => void copyMarkdown()}>
  <Copy className="h-4 w-4" />
</Button>
```

- [x] **Step 3: Run project verification**

Run: `npm run test && npm run lint && npm run build`

Expected: all checks exit with code 0.
