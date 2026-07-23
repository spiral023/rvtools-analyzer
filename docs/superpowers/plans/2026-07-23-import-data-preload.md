# Import Data Preload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep imported analysis data fresh in memory for one hour and provide a global, blocking preload action that loads every persisted import dataset with understandable progress.

**Architecture:** Central cache constants and canonical all-snapshot query keys let page hooks reuse one memory copy regardless of the active vCenter filter. A read-only IndexedDB inventory plus a sequential preload orchestrator fills TanStack Query and reports monotonic step/record progress to a global header control and modal overlay.

**Tech Stack:** React 18, TypeScript, TanStack Query 5, IndexedDB/idb, shadcn/ui, Tailwind CSS, Vitest, Testing Library.

---

### Task 1: Shared one-hour cache policy

**Files:**
- Create: `src/lib/queryCache.ts`
- Create: `src/lib/queryCache.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/hooks/useActiveSnapshots.ts`
- Modify: `src/hooks/useGlobalVmFilter.ts`
- Modify: `src/hooks/useFilterState.tsx`

- [ ] **Step 1: Write the failing cache-policy test**

```ts
import { describe, expect, it } from "vitest";
import { QUERY_CACHE_DURATION_MS } from "@/lib/queryCache";

describe("query cache policy", () => {
  it("keeps imported data fresh for exactly one hour", () => {
    expect(QUERY_CACHE_DURATION_MS).toBe(60 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Run RED**

Run: `npm run test -- src/lib/queryCache.test.ts`
Expected: FAIL because `@/lib/queryCache` does not exist.

- [ ] **Step 3: Implement the constant and replace all relevant five-minute literals**

```ts
export const QUERY_CACHE_DURATION_MS = 60 * 60 * 1000;
export const RAW_QUERY_GC_MS = QUERY_CACHE_DURATION_MS;
```

Use `QUERY_CACHE_DURATION_MS` as the QueryClient default `staleTime` and in snapshot/global-filter hooks. Use `RAW_QUERY_GC_MS` for raw-sheet `gcTime`.

- [ ] **Step 4: Run GREEN**

Run: `npm run test -- src/lib/queryCache.test.ts src/hooks/useActiveSnapshots.test.tsx`
Expected: PASS.

### Task 2: IndexedDB preload inventory

**Files:**
- Modify: `src/data/db/index.ts`
- Modify: `src/data/db/index.test.ts`

- [ ] **Step 1: Write failing tests for discovering every stored raw sheet and reading import stores**

```ts
expect(await getStoredRawSheetNames(["snapshot-a", "snapshot-b"])).toEqual(["vCPU", "vDisk"]);
expect(await getImportedStoreRecords("techinfo_rows")).toHaveLength(2);
expect(await hasImportedData()).toBe(true);
```

The test inserts compressed raw blobs in unsorted order and two Tech-Info history rows, proving unique sorted names and complete reads.

- [ ] **Step 2: Run RED**

Run: `npm run test -- src/data/db/index.test.ts`
Expected: FAIL because both read helpers are missing.

- [ ] **Step 3: Implement read-only helpers and an explicit imported-store union**

```ts
export const IMPORT_DATA_STORE_NAMES = [
  "techinfo_imports", "techinfo_rows",
  "techinfo_client_imports", "techinfo_client_rows",
  "cdp_imports", "cdp_rows", "ipam_imports", "ipam_rows",
  "eramon_iface_imports", "eramon_iface_rows",
  "eramon_l2_imports", "eramon_l2_rows",
] as const;

export async function getStoredRawSheetNames(snapshotIds: string[]): Promise<string[]>;
export async function getImportedStoreRecords(storeName: ImportedDataStoreName): Promise<unknown[]>;
export async function hasImportedData(): Promise<boolean>;
```

`getStoredRawSheetNames` reads blob keys, filters by the supplied snapshot ID set, deduplicates names, and sorts them. `hasImportedData` checks snapshot and import-metadata store counts so auxiliary-only imports also enable the action. None of the helpers mutates IndexedDB or changes `DB_VERSION`.

- [ ] **Step 4: Run GREEN**

Run: `npm run test -- src/data/db/index.test.ts`
Expected: PASS.

### Task 3: Sequential preload orchestrator and canonical query keys

**Files:**
- Create: `src/lib/preloadImportedData.ts`
- Create: `src/lib/preloadImportedData.test.ts`

- [ ] **Step 1: Write failing orchestrator tests**

```ts
const updates: PreloadProgress[] = [];
const result = await preloadImportedData(queryClient, {
  dependencies,
  onProgress: (progress) => updates.push(progress),
});

expect(dependencies.getRawSheetRows).toHaveBeenCalledWith(["s1", "s2"], "vCPU");
expect(dependencies.getImportedStoreRecords).toHaveBeenCalledTimes(12);
expect(updates.at(-1)).toMatchObject({ completedSteps: updates.at(-1)?.totalSteps, percent: 100 });
expect(result.processedRecords).toBe(expectedRecordCount);
```

Add separate tests proving steps execute sequentially, all canonical normalized/raw/latest query keys are populated, no active filter is consulted, and an error reports the failing label.

- [ ] **Step 2: Run RED**

Run: `npm run test -- src/lib/preloadImportedData.test.ts`
Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement inventory, steps and progress**

```ts
export interface PreloadProgress {
  phase: "preparing" | "loading";
  currentLabel: string;
  completedSteps: number;
  totalSteps: number;
  processedRecords: number;
  percent: number;
}

export async function preloadImportedData(
  queryClient: QueryClient,
  options: { onProgress?: (progress: PreloadProgress) => void; dependencies?: PreloadDependencies },
): Promise<{ processedRecords: number; totalSteps: number }>;
```

First read all snapshots and stored raw-sheet names, then build a deterministic list for normalized stores, every raw sheet, all auxiliary history stores, and all auxiliary latest views. Execute with a `for...of` loop and `await queryClient.fetchQuery(...)`; emit one update before and after every step. Wrap errors with the current German label.

- [ ] **Step 4: Run GREEN**

Run: `npm run test -- src/lib/preloadImportedData.test.ts`
Expected: PASS.

### Task 4: Reuse all-snapshot caches in analysis hooks

**Files:**
- Modify: `src/hooks/useActiveSnapshots.ts`
- Modify: `src/hooks/useGlobalVmFilter.ts`
- Modify: `src/pages/FleetCompare.tsx`
- Modify: `src/hooks/useActiveSnapshots.test.tsx`

- [ ] **Step 1: Write failing hook tests**

Render with two snapshots while one vCenter is selected. Assert the query function receives both snapshot IDs once, while returned VMs/hosts/raw rows contain only the selected snapshot. Change the selection and assert no second IndexedDB read occurs.

- [ ] **Step 2: Run RED**

Run: `npm run test -- src/hooks/useActiveSnapshots.test.tsx`
Expected: FAIL because current queries use the filtered ID list.

- [ ] **Step 3: Implement canonical all-snapshot reads with in-memory scoping**

`useActiveSnapshotIds` returns both `allSnapshotIds` and `activeSnapshotIds`. Entity and raw hooks query with `allSnapshotIds`, then expose only records whose `snapshotId` belongs to `activeSnapshotIds`. Global-filter raw/entity queries use the same all-snapshot keys. Fleet Compare adopts those canonical keys instead of duplicate `fleet-*` caches.

- [ ] **Step 4: Run GREEN**

Run: `npm run test -- src/hooks/useActiveSnapshots.test.tsx src/pages/FleetCompare.test.tsx`
Expected: PASS.

### Task 5: Header action and blocking progress overlay

**Files:**
- Create: `src/hooks/useImportedDataPreload.ts`
- Create: `src/components/layout/ImportedDataPreloadControl.tsx`
- Create: `src/components/layout/ImportedDataPreloadControl.test.tsx`
- Modify: `src/app/layout/AppLayout.tsx`

- [ ] **Step 1: Write failing UI tests**

```tsx
expect(screen.getByRole("button", { name: "Alle importierten Daten vorladen" })).toBeInTheDocument();
await user.click(screen.getByRole("button", { name: "Alle importierten Daten vorladen" }));
expect(screen.getByRole("dialog", { name: "Importierte Daten werden vorgeladen" })).toBeInTheDocument();
expect(screen.getByText(/1–3 Minuten/)).toBeInTheDocument();
expect(screen.getByText(/eine Stunde/)).toBeInTheDocument();
expect(screen.getByText(/Datensätze verarbeitet/)).toBeInTheDocument();
```

Add success and failure tests: success closes the dialog and emits a toast; failure keeps a retry action visible. Verify a second click cannot start a parallel run.

- [ ] **Step 2: Run RED**

Run: `npm run test -- src/components/layout/ImportedDataPreloadControl.test.tsx`
Expected: FAIL because the component is missing.

- [ ] **Step 3: Implement hook, icon and accessible modal**

Use a `DatabaseZap` icon button in the existing right header controls and a one-hour `useQuery(["hasImportedData"])` availability check so the action is disabled when no import exists. The hook owns `idle | running | error`, progress, result and retry. The modal uses the existing shadcn `Dialog` and `Progress`, prevents Escape/outside close while running, applies backdrop blur, explains IndexedDB versus RAM, shows the current label, `completedSteps/totalSteps`, percent and localized record count. On success call `toast.success` and close; on error show close and retry buttons.

- [ ] **Step 4: Run GREEN**

Run: `npm run test -- src/components/layout/ImportedDataPreloadControl.test.tsx`
Expected: PASS.

### Task 6: Verification, commit, push and deploy

**Files:**
- Modify only files required by failures attributable to this feature.

- [ ] **Step 1: Run focused and full verification**

Run:

```powershell
npm run test
npm run lint
npx -y react-doctor@latest . --verbose --diff
npm run build
git diff --check
```

Expected: all tests pass, ESLint has no new errors, React Doctor has no feature-caused errors, build exits 0, and diff check is clean.

- [ ] **Step 2: Review requirements and working tree**

Run: `git status --short; git diff --stat; git diff`
Expected: only planned feature files are changed and every design requirement maps to verified code/tests.

- [ ] **Step 3: Commit feature**

```powershell
git add -- docs/superpowers/plans/2026-07-23-import-data-preload.md src/App.tsx src/app/layout/AppLayout.tsx src/components/layout/ImportedDataPreloadControl.tsx src/components/layout/ImportedDataPreloadControl.test.tsx src/data/db/index.ts src/data/db/index.test.ts src/hooks/useActiveSnapshots.ts src/hooks/useActiveSnapshots.test.tsx src/hooks/useFilterState.tsx src/hooks/useGlobalVmFilter.ts src/hooks/useImportedDataPreload.ts src/lib/preloadImportedData.ts src/lib/preloadImportedData.test.ts src/lib/queryCache.ts src/lib/queryCache.test.ts src/pages/FleetCompare.tsx src/pages/FleetCompare.test.tsx
git commit -m "feat: preload imported data for faster navigation"
```

- [ ] **Step 4: Push main**

Run: `git push origin main`
Expected: remote `main` advances to the feature commit.

- [ ] **Step 5: Production deploy**

Run: `npm run cf:pages:deploy`
Expected: Wrangler reports a successful Cloudflare Pages deployment URL.
