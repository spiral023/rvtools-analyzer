# CDP Host Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the existing ESXi host detail dialog when a user clicks a host in the CDP/Switch-Ports table.

**Architecture:** `CdpPanel` will use the shared `useHostDetailDialog` hook already used by the other network panels. The Host column becomes a button that forwards its CDP row to the hook, which resolves the matching RVTools host and renders the shared dialog.

**Tech Stack:** React 18, TypeScript, TanStack Table, Vitest, Testing Library.

---

### Task 1: Connect CDP host clicks to the shared host dialog

**Files:**
- Create: `src/pages/CdpSwitchPorts.test.tsx`
- Modify: `src/pages/CdpSwitchPorts.tsx:1-115`

- [x] **Step 1: Write the failing component test**

```tsx
it("opens the ESXi detail dialog when a CDP host is clicked", async () => {
  render(<CdpPanel />);

  await userEvent.click(screen.getByRole("button", { name: "esx01.lab.local" }));

  expect(openHostDetail).toHaveBeenCalledWith(expect.objectContaining({ host: "esx01.lab.local" }));
});
```

Mock `useActiveSnapshotIds`, `useAllCdpLatest`, and `useHostDetailDialog` so the panel receives one CDP row and exposes the hook callback for the assertion.

- [x] **Step 2: Run the focused test to verify it fails**

Run: `npm run test -- src/pages/CdpSwitchPorts.test.tsx`

Expected: FAIL because the Host cell is plain text and has no button labelled with the host name.

- [x] **Step 3: Wire the shared dialog hook into the Host column**

```tsx
function createColumns(onOpenHostDetail: (row: CdpLatest) => void): ColumnDef<CdpLatest, unknown>[] {
  return [
    {
      accessorKey: "host",
      header: "Host",
      cell: ({ row }) => (
        <button type="button" onClick={() => onOpenHostDetail(row.original)}>
          {row.original.host}
        </button>
      ),
    },
  ];
}

const { openHostDetail, hostDetailDialog } = useHostDetailDialog();
const columns = useMemo(() => createColumns(openHostDetail), [openHostDetail]);
```

Render `hostDetailDialog` alongside the CDP table.

- [x] **Step 4: Run the focused test to verify it passes**

Run: `npm run test -- src/pages/CdpSwitchPorts.test.tsx`

Expected: one passing test that proves the selected CDP row reaches the shared dialog hook.

- [x] **Step 5: Run project verification**

Run: `npm run test && npm run lint && npm run build`

Expected: all checks exit with code 0.
