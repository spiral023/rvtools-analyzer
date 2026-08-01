import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TableDisplayPreferences } from "@/domain/models/types";

const dbMocks = vi.hoisted(() => ({
  getUiState: vi.fn(),
  putUiState: vi.fn(),
}));

vi.mock("@/data/db", () => dbMocks);

import {
  TableDisplayPreferencesProvider,
  useTableDisplayPreferences,
} from "@/hooks/useTableDisplayPreferences";
import {
  LEGACY_TECH_INFO_ORGANISATION_UI_STATE_ID,
  TABLE_DISPLAY_PREFERENCES_UI_STATE_ID,
  TECH_INFO_ORGANISATION_TABLE_ID,
} from "@/lib/tableDisplayPreferences";

const defaults: TableDisplayPreferences = {
  columnVisibility: { vm: true, host: true },
  columnOrder: [],
  sorting: [],
};

function Probe({ tableId }: { tableId: string }) {
  const { tablePreferences, onTablePreferencesChange } = useTableDisplayPreferences(tableId, defaults);
  return (
    <>
      <output data-testid={`preferences-${tableId}`}>{JSON.stringify(tablePreferences)}</output>
      <button
        type="button"
        onClick={() => onTablePreferencesChange?.({
          columnVisibility: { vm: false, host: true },
          columnOrder: ["host", "vm"],
          sorting: [{ id: "host", desc: true }],
        })}
      >
        ändern
      </button>
    </>
  );
}

function renderProbe(tableId: string) {
  return render(
    <TableDisplayPreferencesProvider>
      <Probe tableId={tableId} />
    </TableDisplayPreferencesProvider>,
  );
}

describe("useTableDisplayPreferences", () => {
  beforeEach(() => {
    dbMocks.getUiState.mockReset().mockResolvedValue(undefined);
    dbMocks.putUiState.mockReset().mockResolvedValue(undefined);
  });

  it("lädt gespeicherte Präferenzen getrennt nach tableId", async () => {
    const stored: TableDisplayPreferences = {
      columnVisibility: { vm: false, host: true },
      columnOrder: ["host", "vm"],
      sorting: [{ id: "host", desc: true }],
    };
    dbMocks.getUiState.mockImplementation(async (id: string) => id === TABLE_DISPLAY_PREFERENCES_UI_STATE_ID
      ? { id, theme: "dark", tableDisplayPreferences: { "hosts/inventory": stored } }
      : undefined);

    renderProbe("hosts/inventory");

    await waitFor(() => expect(screen.getByTestId("preferences-hosts/inventory")).toHaveTextContent(JSON.stringify(stored)));
    expect(dbMocks.getUiState).toHaveBeenCalledWith(TABLE_DISPLAY_PREFERENCES_UI_STATE_ID);
  });

  it("übernimmt eine alte Tech-Info-Präferenz in die neue Tabellen-ID", async () => {
    const legacy: TableDisplayPreferences = {
      columnVisibility: { vm: false, host: true },
      columnOrder: ["host", "vm"],
      sorting: [{ id: "host", desc: false }],
    };
    dbMocks.getUiState.mockImplementation(async (id: string) => id === LEGACY_TECH_INFO_ORGANISATION_UI_STATE_ID
      ? { id, theme: "dark", techInfoOrganisationTablePreferences: legacy }
      : undefined);

    renderProbe(TECH_INFO_ORGANISATION_TABLE_ID);

    await waitFor(() => expect(screen.getByTestId(`preferences-${TECH_INFO_ORGANISATION_TABLE_ID}`)).toHaveTextContent(JSON.stringify(legacy)));
  });

  it("speichert Änderungen seriell und nur für die betroffene Tabelle", async () => {
    render(
      <TableDisplayPreferencesProvider>
        <Probe tableId="hosts/inventory" />
        <Probe tableId="vms/inventory" />
      </TableDisplayPreferencesProvider>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "ändern" })[0]);

    await waitFor(() => expect(dbMocks.putUiState).toHaveBeenCalledWith(expect.objectContaining({
      id: TABLE_DISPLAY_PREFERENCES_UI_STATE_ID,
      tableDisplayPreferences: expect.objectContaining({
        "hosts/inventory": expect.objectContaining({ columnOrder: ["host", "vm"] }),
      }),
    })));
    expect(screen.getByTestId("preferences-vms/inventory")).toHaveTextContent(JSON.stringify(defaults));
  });
});
