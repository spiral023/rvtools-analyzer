import { describe, expect, it } from "vitest";
import { buildAnalysisErrorReport, type AnalysisErrorEnvironment } from "@/lib/analysisErrorReport";

const environment: AnalysisErrorEnvironment = {
  pathname: "/clusters",
  search: "?tab=overview",
  href: "https://rvtools.pages.dev/clusters?tab=overview",
  userAgent: "Test Browser",
  language: "de-DE",
  online: true,
  viewport: "1440×900",
  appVersion: "1.2.3",
  buildTime: "2026-08-01T12:00:00.000Z",
  occurredAt: "2026-08-01T13:00:00.000Z",
};

describe("buildAnalysisErrorReport", () => {
  it("ordnet einen fehlenden Diagramm-Achsenbezug fachlich ein", () => {
    const report = buildAnalysisErrorReport(new Error("Could not find yAxis by id secondary"), environment);

    expect(report).toMatchObject({
      area: "Cluster-Analyse",
      category: "Diagrammdarstellung",
      title: "Diagramm konnte nicht aufgebaut werden",
      isLazyImportFailure: false,
    });
    expect(report.copyText).toContain("Analysebereich: Cluster-Analyse");
    expect(report.copyText).toContain("Adresse: /clusters?tab=overview");
    expect(report.copyText).toContain("App-Version: 1.2.3");
    expect(report.copyText).toContain("Could not find yAxis by id secondary");
  });

  it("erkennt veraltete Code-Chunks als Anwendungsupdate", () => {
    const report = buildAnalysisErrorReport(
      new TypeError("Failed to fetch dynamically imported module"),
      { ...environment, pathname: "/hosts", search: "" },
    );

    expect(report.area).toBe("Host-Analyse");
    expect(report.category).toBe("Anwendungsupdate");
    expect(report.isLazyImportFailure).toBe(true);
  });
});
