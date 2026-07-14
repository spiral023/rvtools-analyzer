# Tooltip Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render application tooltips in a portal so sticky tables cannot cover their explanatory content.

**Architecture:** The shared shadcn/Radix tooltip primitive is the single rendering boundary for every tooltip. Wrapping its content in Radix's portal moves it outside table and layout stacking contexts while retaining the existing visual styling and placement behaviour.

**Tech Stack:** React 18, TypeScript, Radix UI Tooltip, Vitest, Testing Library.

---

### Task 1: Cover portalled tooltip content

**Files:**
- Create: `src/components/ui/tooltip.test.tsx`
- Modify: `src/components/ui/tooltip.tsx:12-26`

- [x] **Step 1: Write the failing test**

```tsx
it("renders open tooltip content in a document portal", async () => {
  render(
    <TooltipProvider delayDuration={0}>
      <Tooltip defaultOpen>
        <TooltipTrigger>Mehr Informationen</TooltipTrigger>
        <TooltipContent>Erklärung</TooltipContent>
      </Tooltip>
    </TooltipProvider>,
  );

  const content = await screen.findByText("Erklärung");
  expect(content.parentElement?.parentElement).toBe(document.body);
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/components/ui/tooltip.test.tsx`

Expected: the assertion fails because `TooltipContent` is mounted under the rendered test container instead of `document.body`.

- [x] **Step 3: Render tooltip content through `TooltipPrimitive.Portal`**

```tsx
<TooltipPrimitive.Portal>
  <TooltipPrimitive.Content ref={ref} sideOffset={sideOffset} className={cn(...)} {...props} />
</TooltipPrimitive.Portal>
```

- [x] **Step 4: Run the focused test to verify it passes**

Run: `npm run test -- src/components/ui/tooltip.test.tsx`

Expected: one passing test.

- [x] **Step 5: Run project verification**

Run: `npm run test && npm run lint && npm run build`

Expected: all checks exit with code 0.
