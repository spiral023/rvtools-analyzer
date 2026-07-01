import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface SelectionContextValue {
  selectedVmKeys: Set<string>;
  toggleVm: (vmKey: string) => void;
  selectMany: (vmKeys: string[]) => void;
  deselectMany: (vmKeys: string[]) => void;
  clear: () => void;
  isSelected: (vmKey: string) => boolean;
  setSelection: (vmKeys: string[]) => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selectedVmKeys, setSelectedVmKeys] = useState<Set<string>>(new Set());

  const toggleVm = useCallback((vmKey: string) => {
    setSelectedVmKeys((prev) => {
      const next = new Set(prev);
      if (next.has(vmKey)) next.delete(vmKey);
      else next.add(vmKey);
      return next;
    });
  }, []);

  const selectMany = useCallback((vmKeys: string[]) => {
    setSelectedVmKeys((prev) => {
      const next = new Set(prev);
      for (const k of vmKeys) next.add(k);
      return next;
    });
  }, []);

  const deselectMany = useCallback((vmKeys: string[]) => {
    setSelectedVmKeys((prev) => {
      const next = new Set(prev);
      for (const k of vmKeys) next.delete(k);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelectedVmKeys(new Set()), []);

  const setSelection = useCallback((vmKeys: string[]) => {
    setSelectedVmKeys(new Set(vmKeys));
  }, []);

  const isSelected = useCallback((vmKey: string) => selectedVmKeys.has(vmKey), [selectedVmKeys]);

  const value = useMemo<SelectionContextValue>(
    () => ({ selectedVmKeys, toggleVm, selectMany, deselectMany, clear, isSelected, setSelection }),
    [selectedVmKeys, toggleVm, selectMany, deselectMany, clear, isSelected, setSelection],
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("useSelection must be used within a SelectionProvider");
  return ctx;
}