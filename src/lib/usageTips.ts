/**
 * Aktion, die ein Tipp direkt anbieten kann, sofern der Browser sie hergibt. Ist sie nicht
 * verfügbar, bleibt der Tipp ein reiner Hinweis mit seinem normalen `text`.
 */
export interface UsageTipAction {
  id: "install-pwa";
  label: string;
  /**
   * Ersetzt `text`, solange die Aktion verfügbar ist. Höchstens rund 40 Zeichen: Die
   * Schaltfläche tritt an die Stelle der zweiten und dritten Textzeile, damit die
   * Tipp-Fläche ihre Höhe behält.
   */
  text: string;
}

export interface UsageTip {
  /** Stabile Kennung, damit ein Tipp umformuliert werden kann, ohne Verweise zu brechen. */
  id: string;
  title: string;
  /**
   * Höchstens rund 100 Zeichen. Die Tipp-Fläche in der Sidebar zeigt drei Zeilen à etwa
   * 42 Zeichen, durch den Wortumbruch bleibt davon weniger nutzbar. Längere Texte
   * schneidet `line-clamp-3` sichtbar mit Auslassungspunkten ab.
   */
  text: string;
  action?: UsageTipAction;
}

/**
 * Bedienhinweise für die Tipp-Fläche in der Sidebar-Fußzeile. Enthalten sind bewusst nur
 * Funktionen, die man beim normalen Durchklicken nicht zwangsläufig findet.
 */
export const USAGE_TIPS: UsageTip[] = [
  {
    id: "row-click-detail",
    title: "Direkt zur Detailansicht",
    text: "Ein Klick auf eine Tabellenzeile öffnet die vollständige Detailansicht.",
  },
  {
    id: "global-drop",
    title: "Dateien überall ablegen",
    text: "RVTools-XLSX, ZIP und SysV-Pakete überall in der App ablegen – der Import startet von selbst.",
  },
  {
    id: "column-configuration",
    title: "Spalten selbst wählen",
    text: "Das Zahnrad unter jeder Tabelle blendet Spalten ein und aus. Die Ansicht bleibt gespeichert.",
  },
  {
    id: "export-view",
    title: "Export nimmt die Ansicht mit",
    text: "Der Export übernimmt Filter und Spaltenauswahl – als Excel, CSV, JSON oder Markdown.",
  },
  {
    id: "global-filter-rules",
    title: "Mehr als Textsuche",
    text: "Der globale Filter verknüpft Regeln über alle RVTools-Rohfelder mit UND und ODER.",
  },
  {
    id: "column-glossary",
    title: "Spaltennamen erklärt",
    text: "Das Info-Symbol an einer Spaltenüberschrift erklärt, woher der Wert stammt.",
  },
  {
    id: "install-pwa",
    title: "Als App installieren",
    // Fallback für Browser ohne `beforeinstallprompt`, etwa Safari und Firefox.
    text: "Über das Browsermenü lässt sich der Analyzer als eigene App einrichten, auch offline.",
    action: {
      id: "install-pwa",
      label: "Jetzt installieren",
      text: "Eigenes Fenster, Start auch ohne Netz.",
    },
  },
  {
    id: "local-data",
    title: "Daten bleiben lokal",
    text: "Alle Importe bleiben in diesem Browser. Kein Server-Upload, keine zentrale Datenbank.",
  },
  {
    id: "sidebar-shortcut",
    title: "Sidebar per Tastatur",
    text: "Strg + B blendet die Navigation aus und schafft Platz für breite Tabellen.",
  },
  {
    id: "preload-data",
    title: "Alles vorladen",
    text: "Das Vorlade-Symbol oben holt alle Daten in den Speicher – Seitenwechsel werden schneller.",
  },
];
