import type { VmScopeSettings } from "@/domain/models/types";

export const VM_SCOPE_SETTINGS_STORAGE_KEY = "rvtools-vm-scope-settings";
export const VM_SCOPE_SETTINGS_CHANGED_EVENT = "rvtools-vm-scope-settings-changed";

export const DEFAULT_VM_SCOPE_SETTINGS: VmScopeSettings = {
  vmPowerScope: "poweredOn",
  excludeVclsVms: true,
};

function normalizeVmScopeSettings(value: unknown): VmScopeSettings | null {
  if (typeof value !== "object" || value === null) return null;
  const settings = value as Partial<VmScopeSettings>;
  if ((settings.vmPowerScope !== "all" && settings.vmPowerScope !== "poweredOn")
    || typeof settings.excludeVclsVms !== "boolean") return null;
  return {
    vmPowerScope: settings.vmPowerScope,
    excludeVclsVms: settings.excludeVclsVms,
  };
}

export function getStoredVmScopeSettings(): VmScopeSettings {
  try {
    const raw = globalThis.localStorage?.getItem(VM_SCOPE_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_VM_SCOPE_SETTINGS;
    return normalizeVmScopeSettings(JSON.parse(raw)) ?? DEFAULT_VM_SCOPE_SETTINGS;
  } catch {
    return DEFAULT_VM_SCOPE_SETTINGS;
  }
}

export function saveVmScopeSettings(settings: VmScopeSettings): void {
  try {
    globalThis.localStorage?.setItem(VM_SCOPE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    globalThis.dispatchEvent?.(new CustomEvent<VmScopeSettings>(VM_SCOPE_SETTINGS_CHANGED_EVENT, { detail: settings }));
  } catch {
    // Die Analyse bleibt auch bei blockiertem localStorage nutzbar.
  }
}

export function getVmScopeSettingsFromEvent(event: Event): VmScopeSettings | null {
  return event instanceof CustomEvent ? normalizeVmScopeSettings(event.detail) : null;
}
