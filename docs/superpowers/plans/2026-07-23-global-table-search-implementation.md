# Robuste globale Tabellensuche Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die globale Suche findet Werte in jeder accessor-basierten Tabellenspalte, auch wenn das Feld in der ersten Datenzeile leer ist.

**Architecture:** `VirtualTable` überschreibt die wertbasierte Standardentscheidung von TanStack Table. Jede Spalte mit Accessor kann am bestehenden globalen, teilstringbasierten String-Filter teilnehmen. Ein Komponententest reproduziert den Fehler mit einer in der ersten Zeile leeren optionalen Spalte.

**Tech Stack:** React 18, TypeScript, TanStack Table, Vitest, Testing Library.

---

### Task 1: Regressionstest für die gemeinsame Tabelle

**Files:**
- Create: `src/components/tables/VirtualTable.test.tsx`
- Modify: `src/components/tables/VirtualTable.tsx`

- [x] **Step 1: Write the failing test**

```tsx
it("findet Werte in einer optionalen Spalte, wenn die erste Zeile leer ist", () => {
  render(
    <VirtualTable
      data={[
        { ipAddress: "10.0.0.1", name: null, comment: null },
        { ipAddress: "10.0.0.2", name: "app-01", comment: "Produktivsystem" },
      ]}
      columns={[
        { accessorKey: "ipAddress", header: "IP" },
        { accessorKey: "name", header: "Name" },
        { accessorKey: "comment", header: "Comment" },
      ]}
      globalFilter="produktiv"
    />,
  );

  expect(screen.getByText("10.0.0.2")).toBeInTheDocument();
  expect(screen.queryByText("10.0.0.1")).not.toBeInTheDocument();
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/tables/VirtualTable.test.tsx`

Expected: The assertion for `10.0.0.2` fails because `comment` is not globally searchable when the first row has `null`.

- [x] **Step 3: Write minimal implementation**

```tsx
const table = useReactTable({
  // existing options
  getColumnCanGlobalFilter: (column) => Boolean(column.accessorFn),
});
```

Place the option in the existing `useReactTable` configuration in `src/components/tables/VirtualTable.tsx`. Keep the existing global filter function and all other table options unchanged.

- [x] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/tables/VirtualTable.test.tsx`

Expected: PASS. The second row is displayed from a comment match despite the first-row comment being empty.

- [x] **Step 5: Run affected checks**

Run: `npm run lint -- src/components/tables/VirtualTable.tsx src/components/tables/VirtualTable.test.tsx && npm run test && npm run build`

Expected: Lint, all tests, and production build pass.

- [x] **Step 6: Commit**

```bash
git add src/components/tables/VirtualTable.tsx src/components/tables/VirtualTable.test.tsx docs/superpowers/plans/2026-07-23-global-table-search-implementation.md
git commit -m "fix: search optional table fields globally"
```
