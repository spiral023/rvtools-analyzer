import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MaintenanceWindowDefinition } from "@/domain/models/types";
import {
  deleteMaintenanceWindow,
  getMaintenanceWindows,
  putMaintenanceWindow,
  upsertMaintenanceWindows,
} from "@/data/db";
import { useMaintenanceWindows } from "@/hooks/useMaintenanceWindows";

vi.mock("@/data/db", () => ({
  getMaintenanceWindows: vi.fn(),
  putMaintenanceWindow: vi.fn(),
  deleteMaintenanceWindow: vi.fn(),
  upsertMaintenanceWindows: vi.fn(),
}));

const mockedGetMaintenanceWindows = vi.mocked(getMaintenanceWindows);
const mockedPutMaintenanceWindow = vi.mocked(putMaintenanceWindow);
const mockedDeleteMaintenanceWindow = vi.mocked(deleteMaintenanceWindow);
const mockedUpsertMaintenanceWindows = vi.mocked(upsertMaintenanceWindows);

function definition(id: string): MaintenanceWindowDefinition {
  return {
    id,
    abbreviation: id,
    normalizedAbbreviation: id.toLowerCase(),
    description: "Regelmäßiges Wartungsfenster",
    handling: "regular",
    weeklySlots: Array.from({ length: 7 }, () => Array<boolean>(48).fill(false)) as MaintenanceWindowDefinition["weeklySlots"],
    calendarRules: [],
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
  };
}

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function createClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("useMaintenanceWindows", () => {
  beforeEach(() => {
    mockedGetMaintenanceWindows.mockReset();
    mockedPutMaintenanceWindow.mockReset();
    mockedDeleteMaintenanceWindow.mockReset();
    mockedUpsertMaintenanceWindows.mockReset();
    mockedGetMaintenanceWindows.mockResolvedValue([]);
    mockedPutMaintenanceWindow.mockResolvedValue();
    mockedDeleteMaintenanceWindow.mockResolvedValue();
    mockedUpsertMaintenanceWindows.mockResolvedValue();
  });

  it("lädt die Fensterdefinitionen und stellt währenddessen einen leeren Standardwert bereit", async () => {
    let resolveDefinitions: (values: MaintenanceWindowDefinition[]) => void;
    mockedGetMaintenanceWindows.mockReturnValue(new Promise((resolve) => {
      resolveDefinitions = resolve;
    }));
    const client = createClient();
    const { result } = renderHook(() => useMaintenanceWindows(), { wrapper: createWrapper(client) });

    expect(result.current.definitions).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    expect(mockedGetMaintenanceWindows).toHaveBeenCalledOnce();

    resolveDefinitions!([definition("MW 1")]);

    await waitFor(() => {
      expect(result.current.definitions).toEqual([definition("MW 1")]);
    });
    expect(result.current.isLoading).toBe(false);
  });

  it("speichert eine Definition und invalidiert nur die Wartungsfenster-Abfrage", async () => {
    const saved = definition("MW 1");
    let definitions: MaintenanceWindowDefinition[] = [];
    mockedGetMaintenanceWindows.mockImplementation(async () => definitions);
    mockedPutMaintenanceWindow.mockImplementation(async (value) => {
      definitions = [value];
    });
    const client = createClient();
    const invalidateQueries = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useMaintenanceWindows(), { wrapper: createWrapper(client) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.save(saved));

    expect(mockedPutMaintenanceWindow).toHaveBeenCalledWith(saved);
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["maintenanceWindows"] });
    await waitFor(() => expect(result.current.definitions).toEqual([saved]));
  });

  it("löscht eine Definition und invalidiert nur die Wartungsfenster-Abfrage", async () => {
    mockedGetMaintenanceWindows.mockResolvedValue([]);
    const client = createClient();
    const invalidateQueries = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useMaintenanceWindows(), { wrapper: createWrapper(client) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.remove("MW 1"));

    expect(mockedDeleteMaintenanceWindow).toHaveBeenCalledWith("MW 1");
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["maintenanceWindows"] });
  });

  it("führt mehrere Definitionen per Upsert zusammen", async () => {
    const imported = [definition("MW 1"), definition("MW 2")];
    mockedGetMaintenanceWindows.mockResolvedValue([]);
    const client = createClient();
    const invalidateQueries = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useMaintenanceWindows(), { wrapper: createWrapper(client) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.upsert(imported));

    expect(mockedUpsertMaintenanceWindows).toHaveBeenCalledWith(imported);
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["maintenanceWindows"] });
  });

  it("legt Query-Fehler als Error offen", async () => {
    const failure = new Error("Lesen fehlgeschlagen");
    mockedGetMaintenanceWindows.mockRejectedValue(failure);
    const client = createClient();
    const { result } = renderHook(() => useMaintenanceWindows(), { wrapper: createWrapper(client) });

    await waitFor(() => expect(result.current.error).toBe(failure));
    expect(result.current.definitions).toEqual([]);
  });

  it("reicht Mutationsfehler an Aufrufer weiter, legt ihn offen und invalidiert nicht", async () => {
    const failure = new Error("Speichern fehlgeschlagen");
    mockedGetMaintenanceWindows.mockResolvedValue([]);
    mockedPutMaintenanceWindow.mockRejectedValue(failure);
    const client = createClient();
    const invalidateQueries = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useMaintenanceWindows(), { wrapper: createWrapper(client) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await expect(result.current.save(definition("MW 1"))).rejects.toBe(failure);
    });
    await waitFor(() => expect(result.current.error).toBe(failure));
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it("bleibt während überlappender Speicherungen aktiv, bis beide abgeschlossen sind", async () => {
    const firstSave = deferred<void>();
    const secondSave = deferred<void>();
    mockedPutMaintenanceWindow
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);
    const client = createClient();
    const { result } = renderHook(() => useMaintenanceWindows(), { wrapper: createWrapper(client) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let firstPromise!: Promise<void>;
    let secondPromise!: Promise<void>;
    act(() => {
      firstPromise = result.current.save(definition("MW 1"));
    });
    await waitFor(() => expect(mockedPutMaintenanceWindow).toHaveBeenCalledTimes(1));
    expect(result.current.isMutating).toBe(true);
    act(() => {
      secondPromise = result.current.save(definition("MW 2"));
    });
    await waitFor(() => expect(mockedPutMaintenanceWindow).toHaveBeenCalledTimes(2));
    expect(result.current.isMutating).toBe(true);

    await act(async () => {
      secondSave.resolve();
      await secondPromise;
    });

    expect(result.current.isMutating).toBe(true);

    await act(async () => {
      firstSave.resolve();
      await firstPromise;
    });
    await waitFor(() => expect(result.current.isMutating).toBe(false));
  });

  it("priorisiert einen neuen Mutationsfehler vor einem vorhandenen Query-Fehler", async () => {
    const queryFailure = new Error("Lesen fehlgeschlagen");
    const mutationFailure = new Error("Speichern fehlgeschlagen");
    mockedGetMaintenanceWindows.mockRejectedValue(queryFailure);
    mockedPutMaintenanceWindow.mockRejectedValue(mutationFailure);
    const client = createClient();
    const { result } = renderHook(() => useMaintenanceWindows(), { wrapper: createWrapper(client) });

    await waitFor(() => expect(result.current.error).toBe(queryFailure));
    await act(async () => {
      await expect(result.current.save(definition("MW 1"))).rejects.toBe(mutationFailure);
    });

    await waitFor(() => expect(result.current.error).toBe(mutationFailure));
  });
});
