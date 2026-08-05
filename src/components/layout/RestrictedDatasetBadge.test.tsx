import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RestrictedDatasetBadge } from "@/components/layout/RestrictedDatasetBadge";
import type { RestrictedDatasetSource } from "@/domain/models/types";

const useRestrictedDatasetMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useRestrictedDataset", () => ({
  useRestrictedDataset: useRestrictedDatasetMock,
}));

function source(
  scopeKind: RestrictedDatasetSource["scopeKind"],
  scopeLabel: string,
  packageId = scopeLabel,
): RestrictedDatasetSource {
  return {
    kind: "sysv-package",
    packageId,
    packageVersion: 1,
    scopeKind,
    scopeLabel,
    dataPolicy: "strict-vm-scope-v1",
    sharedCapacityContext: true,
  };
}

function mockSources(sources: RestrictedDatasetSource[]) {
  useRestrictedDatasetMock.mockReturnValue({
    isRestricted: sources.length > 0,
    sources,
    isPending: false,
  });
}

describe("RestrictedDatasetBadge", () => {
  beforeEach(() => {
    useRestrictedDatasetMock.mockReset();
  });

  it("nennt bei einem Personenpaket den Namen ohne Zusatz", () => {
    mockSources([source("person", "MUSTERMANN Max")]);

    render(<RestrictedDatasetBadge />);

    expect(screen.getByText("MUSTERMANN Max")).toBeInTheDocument();
    expect(screen.queryByText("Eingeschränkter SysV-Datensatz")).not.toBeInTheDocument();
  });

  it("stellt Abteilung und Bereich ihrer Ebene voran", () => {
    mockSources([source("department", "IN-VIA")]);
    const { unmount } = render(<RestrictedDatasetBadge />);
    expect(screen.getByText("Abteilung IN-VIA")).toBeInTheDocument();
    unmount();

    mockSources([source("area", "IN")]);
    render(<RestrictedDatasetBadge />);
    expect(screen.getByText("Bereich IN")).toBeInTheDocument();
  });

  it("fasst mehrere gleichartige Pakete auf ihrer Ebene zusammen", () => {
    mockSources([
      source("department", "IN-VIA"),
      source("department", "IN-NET"),
      source("department", "IN-DB"),
    ]);

    render(<RestrictedDatasetBadge />);

    expect(screen.getByText("3 Abteilungen")).toBeInTheDocument();
  });

  it("bleibt bei gemischten Ebenen neutral", () => {
    mockSources([source("person", "MUSTERMANN Max"), source("area", "IN")]);

    render(<RestrictedDatasetBadge />);

    expect(screen.getByText("2 SysV-Scopes")).toBeInTheDocument();
  });

  it("behält die Einschränkung samt aller Scopes im Tooltip", () => {
    mockSources([source("person", "MUSTERMANN Max"), source("area", "IN")]);

    render(<RestrictedDatasetBadge />);

    expect(screen.getByTitle(/Eingeschränkter SysV-Datensatz: MUSTERMANN Max · Bereich IN/))
      .toBeInTheDocument();
  });

  it("zeigt ohne eingeschränkten Datensatz nichts an", () => {
    mockSources([]);

    const { container } = render(<RestrictedDatasetBadge />);

    expect(container).toBeEmptyDOMElement();
  });
});
