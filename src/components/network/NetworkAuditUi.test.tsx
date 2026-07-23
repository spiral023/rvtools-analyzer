import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuditCheckCard } from "@/components/network/AuditCheckCard";
import { AuditDetailView } from "@/components/network/AuditDetailView";
import { AuditSourceStatus } from "@/components/network/AuditSourceStatus";
import { NetworkAuditOverview } from "@/components/network/NetworkAuditOverview";
import { TooltipProvider } from "@/components/ui/tooltip";
import type {
  NetworkAuditCheckSummary,
  NetworkAuditSourceFacts,
  NetworkAuditViewModel,
} from "@/lib/networkAuditViewModel";

const sources: NetworkAuditSourceFacts = {
  rvtools: { count: 126, importedAt: "2026-07-23T12:35:00.000Z" },
  cdp: { count: 84, importedAt: "2026-07-23T12:36:00.000Z" },
  eramonIface: { count: 2_418, importedAt: "2026-07-23T12:37:00.000Z" },
  eramonL2: { count: 18_024, importedAt: "2026-07-23T12:38:00.000Z" },
  ipam: { count: 9_640, importedAt: "2026-07-23T12:39:00.000Z" },
  techInfo: { count: 117, importedAt: "2026-07-23T12:40:00.000Z" },
};

function summary(
  id: NetworkAuditCheckSummary["id"],
  status: NetworkAuditCheckSummary["status"],
  counts: NetworkAuditCheckSummary["counts"],
  readiness: NetworkAuditCheckSummary["readiness"] = "ready",
): NetworkAuditCheckSummary {
  return {
    id,
    status,
    readiness,
    counts,
    missingRequired: readiness === "unavailable" ? ["eramonIface"] : [],
    missingOptional: readiness === "limited" ? ["ipam"] : [],
  };
}

const viewModel: NetworkAuditViewModel = {
  sources,
  checks: {
    ports: summary("ports", "critical", { critical: 3, review: 5, passed: 24 }),
    hosts: summary("hosts", "review", { critical: 0, review: 4, passed: 112 }, "limited"),
    mac: summary("mac", "passed", { critical: 0, review: 0, passed: 76 }),
    discovery: summary("discovery", "review", { critical: 0, review: 7, passed: 416 }),
  },
  totals: { critical: 3, review: 16, passed: 628 },
  nextCheck: "ports",
  hasExecutableChecks: true,
};

function renderWithProviders(node: React.ReactNode) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <TooltipProvider>{node}</TooltipProvider>
    </MemoryRouter>,
  );
}

describe("NetworkAuditOverview", () => {
  it("zeigt Datenbasis, Gesamtstatus und den vollständigen empfohlenen Prüfpfad", () => {
    renderWithProviders(<NetworkAuditOverview viewModel={viewModel} onOpenCheck={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Datenbasis" })).toBeInTheDocument();
    expect(screen.getByText("3 kritische und 16 weitere Befunde sind offen.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Switch-Port-Zuordnungen" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Host-Datenqualität" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ESXi-MAC-Abgleich" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Unbekannte Geräte" })).toBeInTheDocument();
  });

  it("öffnet über die Primäraktion den höchstpriorisierten Check mit Handlungsbedarf", () => {
    const onOpenCheck = vi.fn();
    renderWithProviders(<NetworkAuditOverview viewModel={viewModel} onOpenCheck={onOpenCheck} />);

    fireEvent.click(screen.getByRole("button", { name: "Nächsten Befund prüfen" }));

    expect(onOpenCheck).toHaveBeenCalledWith("ports", "attention");
  });

  it("weist bei vollständig fehlender Datenbasis auf Importe hin, ohne Checks als bestanden darzustellen", () => {
    const unavailable = (id: NetworkAuditCheckSummary["id"]): NetworkAuditCheckSummary => ({
      ...summary(id, "unavailable", { critical: 0, review: 0, passed: 0 }, "unavailable"),
      missingRequired: id === "ports" ? ["eramonIface"] : ["rvtools"],
    });
    const emptyViewModel: NetworkAuditViewModel = {
      sources: Object.fromEntries(
        Object.keys(sources).map((key) => [key, { count: 0, importedAt: null as string | null }]),
      ) as NetworkAuditSourceFacts,
      checks: {
        ports: unavailable("ports"),
        hosts: unavailable("hosts"),
        mac: unavailable("mac"),
        discovery: unavailable("discovery"),
      },
      totals: { critical: 0, review: 0, passed: 0 },
      nextCheck: null,
      hasExecutableChecks: false,
    };

    renderWithProviders(<NetworkAuditOverview viewModel={emptyViewModel} onOpenCheck={vi.fn()} />);

    expect(
      screen.getByText("Noch keine Netzwerkprüfung ausführbar. Importieren Sie die benötigten Datenquellen."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nächsten Befund prüfen" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Nicht ausführbar")).toHaveLength(4);
    expect(screen.getAllByText("Bestanden")).toHaveLength(1);
  });
});

describe("AuditDetailView", () => {
  it("meldet den Ergebniszähler live und schaltet die Filtergruppe auf Alle", () => {
    const onScopeChange = vi.fn();
    renderWithProviders(
      <AuditDetailView
        title="Switch-Port-Zuordnungen"
        description="Beschreibung"
        summary={summary("ports", "review", { critical: 0, review: 2, passed: 10 }, "limited")}
        scope="attention"
        visibleCount={2}
        totalCount={12}
        search=""
        onBack={vi.fn()}
        onScopeChange={onScopeChange}
      >
        <div>Ergebnisliste</div>
      </AuditDetailView>,
    );

    expect(screen.getByText("2 von 12 Einträgen")).toHaveAttribute("aria-live", "polite");
    fireEvent.click(screen.getByRole("radio", { name: "Alle" }));
    expect(onScopeChange).toHaveBeenCalledWith("all");
  });

  it("nennt bei eingeschränkter Prüfung die fehlenden Quellen und erhält die vorhandenen Ergebnisse", () => {
    renderWithProviders(
      <AuditDetailView
        title="Host-Datenqualität"
        description="Beschreibung"
        summary={summary("hosts", "review", { critical: 0, review: 2, passed: 10 }, "limited")}
        scope="attention"
        visibleCount={2}
        totalCount={12}
        search="esx-01"
        onBack={vi.fn()}
        onScopeChange={vi.fn()}
      >
        <div>Ergebnisliste</div>
      </AuditDetailView>,
    );

    expect(screen.getByText(/Eingeschränkte Prüfung – IPAM fehlt/)).toBeInTheDocument();
    expect(screen.getByText(/vorhandenen Ergebnisse bleiben nutzbar/i)).toBeInTheDocument();
    expect(screen.getByText("Ergebnisse zusätzlich gefiltert nach „esx-01“.")).toBeInTheDocument();
  });
});

describe("AuditCheckCard", () => {
  it("deaktiviert eine nicht ausführbare Prüfung und erklärt die fehlende Aktion", () => {
    const onOpen = vi.fn();
    renderWithProviders(
      <AuditCheckCard
        index={1}
        title="Switch-Port-Zuordnungen"
        question="Stimmen die Quellen überein?"
        actionLabel="Alle Port-Prüfungen anzeigen"
        summary={summary("ports", "unavailable", { critical: 0, review: 0, passed: 0 }, "unavailable")}
        onOpen={onOpen}
      />,
    );

    const button = screen.getByRole("button", { name: "Benötigte Daten fehlen" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("öffnet eine vollständig bestandene Prüfung direkt mit allen Ergebnissen", () => {
    const onOpen = vi.fn();
    renderWithProviders(
      <AuditCheckCard
        index={3}
        title="ESXi-MAC-Abgleich"
        question="Werden Adapter am erwarteten Port gesehen?"
        actionLabel="Alle MAC-Prüfungen anzeigen"
        summary={summary("mac", "passed", { critical: 0, review: 0, passed: 76 })}
        onOpen={onOpen}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Alle MAC-Prüfungen anzeigen" }));
    expect(onOpen).toHaveBeenCalledWith("all");
  });
});

describe("AuditSourceStatus", () => {
  it("bestimmt die Bereitschaft aus der Anzahl und zeigt Importzeitpunkte unabhängig davon an", () => {
    renderWithProviders(
      <AuditSourceStatus
        sources={{
          ...sources,
          rvtools: { count: 0, importedAt: "2026-07-23T12:35:00.000Z" },
          techInfo: { count: 0, importedAt: null },
        }}
      />,
    );

    const rvtools = screen.getByRole("article", { name: "RVTools" });
    expect(within(rvtools).getByText("Fehlt")).toBeInTheDocument();
    expect(within(rvtools).getByText(/^23\.07\.2026, \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(within(rvtools).queryByText("Bereit")).not.toBeInTheDocument();

    const techInfo = screen.getByRole("article", { name: "Tech-Info" });
    expect(within(techInfo).getByText("Noch nicht importiert")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Importe verwalten" })).toHaveAttribute("href", "/upload");
  });
});
