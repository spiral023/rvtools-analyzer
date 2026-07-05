# CI And Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CI gate for typecheck, lint, tests, and build, and improve coverage for the parser worker, RVTools import flow, and active snapshot hooks.

**Architecture:** Keep the app static and local-first. Expose the worker parser as a pure function so Vitest can exercise real XLSX parsing without a browser Worker runtime, while retaining the existing `self.onmessage` behavior for production.

**Tech Stack:** GitHub Actions, npm, Vite, Vitest, React Testing Library, fake-indexeddb, `@e965/xlsx`.

---

### Task 1: Parser Worker Testability

**Files:**
- Modify: `src/workers/parser.worker.ts`
- Create: `src/workers/parser.worker.test.ts`

- [ ] Write a failing test that generates a real workbook and expects the worker parser to return canonical sheets and metadata.
- [ ] Run `npm run test -- src/workers/parser.worker.test.ts` and confirm it fails because the parser function is not exported yet.
- [ ] Extract the parsing body into `parseWorkbookBuffer(buffer: ArrayBuffer)`.
- [ ] Keep `self.onmessage` delegating to the exported parser function.
- [ ] Re-run the worker test and confirm it passes.

### Task 2: Real RVTools Import Coverage

**Files:**
- Modify: `src/test/importService.test.ts`

- [ ] Write a failing integration test that creates a real RVTools-style `.xlsx` File in memory.
- [ ] Stub `Worker` in the test to parse via `parseWorkbookBuffer`, preserving the import service behavior.
- [ ] Assert the import writes snapshot metadata, normalized VMs/hosts/datastores/snapshots, and allowed raw sheet rows to IndexedDB.
- [ ] Run `npm run test -- src/test/importService.test.ts` and confirm the new test passes after Task 1.

### Task 3: Active Snapshot Hook Coverage

**Files:**
- Create: `src/hooks/useActiveSnapshots.test.tsx`

- [ ] Write hook tests with `QueryClientProvider` and `FilterProvider`.
- [ ] Verify latest snapshot per vCenter is selected when no explicit snapshot filter exists.
- [ ] Verify `useVms` applies explicit snapshot, cluster, and search filters.
- [ ] Run `npm run test -- src/hooks/useActiveSnapshots.test.tsx`.

### Task 4: CI Workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] Add a GitHub Actions workflow for pushes and pull requests.
- [ ] Use Node 22 and `npm ci`.
- [ ] Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`.

### Task 5: Verification

**Files:**
- No source edits.

- [ ] Run `npm run test`.
- [ ] Run `npm run test:coverage`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
