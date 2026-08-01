import type { GlossaryEntry } from "@/lib/glossary";

const VROPS = "vROps-Zeitreihe · VM|CPU|Demand (MHz)|Avg";

/**
 * Begriffe der Verteilungssicht. Sie erklären durchgehend dieselbe Formensprache –
 * Box, Median, Raute –, weil Leiter und Wochenverlauf zwei Maßstäbe derselben
 * Darstellung sind.
 */
export const INSIGHTS_GLOSSARY: Record<string, GlossaryEntry> = {
  panel: {
    term: "Lastverteilung",
    description:
      "Beobachtete CPU-Last der gefilterten VMs, durchgehend als Verteilung statt als Mittelwert. Der Mittelwert beschreibt bei gemischten Beständen keine reale VM: Wenige aktive VMs heben ihn über das Niveau, auf dem die große Mehrheit tatsächlich läuft. Median und Quantile zeigen stattdessen gleichzeitig, wie die typische VM arbeitet und wie weit die aktivsten davon abweichen. Die Ansicht trägt bei einer einzelnen VM genauso wie bei tausenden – nur die Gewichtung verschiebt sich.",
    source: VROPS,
  },
  ladder: {
    term: "Kapazitätsleiter",
    description:
      "Dieselbe Kennzahl in drei Zeitaggregaten, gemessen an der zugeteilten CPU. Die Achse steht fest von 0 bis 100 % – die freie Fläche rechts ist der ungenutzte Teil der Zuteilung und damit das Rightsizing-Potenzial. Weil die Achse nicht mitwächst, bleiben die drei Zeilen untereinander und über Filterwechsel hinweg vergleichbar.",
    source: VROPS,
  },
  ladderAverage: {
    term: "Ø je VM",
    description:
      "Der über den gesamten Importzeitraum gemittelte CPU Demand, je VM einzeln berechnet und dann als Streuung dargestellt. Beantwortet die Frage nach der Grundlast – für die Größe einer VM ist er zu optimistisch, weil er Lastspitzen glattzieht.",
    source: VROPS,
  },
  ladderP95: {
    term: "P95 je VM",
    description:
      "Der 95. Perzentil-Demand jeder VM: das Niveau, das nur in jeder zwanzigsten Stunde überschritten wird. Die übliche Grundlage einer Zielgröße, weil er wiederkehrende Last abbildet, ohne einzelnen Ausreißern zu folgen.",
    source: VROPS,
  },
  ladderPeak: {
    term: "Spitze je VM",
    description:
      "P99 des höchsten Demands innerhalb einer Stunde. Das Stundenmittel glättet kurze Spitzen weg – über einen realen Bestand von 4.018 VMs liegt dieser Wert im Median gut viermal höher als der P95 der Stundenmittel. Er zeigt, was eine Verkleinerung tatsächlich abschneiden würde.",
    source: "vROps-Zeitreihe · VM|CPU|Demand (MHz)|Max",
  },
  weekBands: {
    term: "Wochenverlauf als Verteilung",
    description:
      "Für jede Stunde die Verteilung über alle VMs statt eines Mittelwerts: Die Fläche umschließt die mittlere Hälfte, die kräftige Linie ist der Median, die gestrichelte darüber der P95. Ein gemittelter Verlauf wird über viele VMs flach, weil sich Spitzen zu verschiedenen Uhrzeiten gegenseitig aufheben – das Band bleibt aussagekräftig und zeigt, dass zu jeder Stunde einzelne VMs weit über dem Median laufen. Graue Flächen sind Wochenenden.",
    source: VROPS,
  },
  concentration: {
    term: "Lastkonzentration",
    description:
      "Wie ungleich sich der Demand auf die VMs verteilt. Je weniger VMs die Hälfte der Last tragen, desto weniger sagt eine Durchschnittszahl über den Bestand aus – dann beschreibt der Median korrekt die Mehrheit und verfehlt trotzdem das, was den Cluster beschäftigt.",
    source: VROPS,
  },
  findings: {
    term: "Auffälligkeiten",
    description:
      "Drei Zählwerke, die sofort handlungsleitend sind: VMs mit dauerhaft niedriger Auslastung (P95 unter 10 % der Zuteilung) sind Verkleinerungskandidaten, VMs mit Stunden über 90 % der Kapazität sind Vergrößerungskandidaten, und CPU Ready über 5 % zeigt Wartezeit auf physische Kerne. Die Zeile nennt nur, was tatsächlich zutrifft.",
    source: "vROps-Zeitreihe · Demand, Ready, Kapazität",
  },
  coverage: {
    term: "Abdeckung",
    description:
      "Wie viele der gefilterten VMs der vROps-Import überhaupt enthält und wie lückenlos deren Messreihen sind. Alle Kennzahlen dieser Ansicht beziehen sich ausschließlich auf die abgedeckten VMs – bei geringer Abdeckung beschreibt die Verteilung einen Ausschnitt, nicht den Filter.",
  },
};
