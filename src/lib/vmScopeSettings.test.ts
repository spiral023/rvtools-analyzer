import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_VM_SCOPE_SETTINGS,
  getStoredVmScopeSettings,
  saveVmScopeSettings,
  VM_SCOPE_SETTINGS_STORAGE_KEY,
} from "@/lib/vmScopeSettings";

describe("VM-Scope-Vorgaben", () => {
  beforeEach(() => localStorage.clear());

  it("startet mit aktiven sinnvollen Filtern und speichert Änderungen in localStorage", () => {
    expect(getStoredVmScopeSettings()).toEqual(DEFAULT_VM_SCOPE_SETTINGS);

    saveVmScopeSettings({ vmPowerScope: "all", excludeVclsVms: false });

    expect(localStorage.getItem(VM_SCOPE_SETTINGS_STORAGE_KEY)).toBe(
      JSON.stringify({ vmPowerScope: "all", excludeVclsVms: false }),
    );
    expect(getStoredVmScopeSettings()).toEqual({ vmPowerScope: "all", excludeVclsVms: false });
  });
});
