import {
  CalendarRange,
  FileText,
  Lightbulb,
  Link2,
  PartyPopper,
  Terminal,
  Timer,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

export interface RelatedTool {
  name: string;
  href: string;
  icon: LucideIcon;
  description: string;
}

/** Weitere, unabhängige sp23.online-Tools von Philipp Asanger – verlinkt auf der Impressum-Seite und in der Sidebar. */
export const RELATED_TOOLS: RelatedTool[] = [
  {
    name: "ZE-Helper",
    href: "https://ze-helper.sp23.online/",
    icon: Timer,
    description: "Webdesk Zeitanalyse – Arbeitszeiten auswerten und visualisieren",
  },
  {
    name: "Markdown Editor",
    href: "https://markdown.sp23.online/",
    icon: FileText,
    description: "Einfacher Markdown-Editor mit verschiedenen Exportformaten",
  },
  {
    name: "Mermaid Editor",
    href: "https://mermaid.sp23.online/",
    icon: Waypoints,
    description: "Einfacher Editor für Mermaid-Diagramme",
  },
  {
    name: "Linkliste",
    href: "https://linkliste.sp23.online/",
    icon: Link2,
    description: "Linkliste, um im Team Links zu Anwendungen als Bookmarks zu verteilen",
  },
  {
    name: "Produktvision",
    href: "https://idea.sp23.online/",
    icon: Lightbulb,
    description: "Formular, um eine Produktvision zu erfassen",
  },
  {
    name: "Systemprompt",
    href: "https://systemprompt.sp23.online/",
    icon: Terminal,
    description: "Prompte deine IT-Landschaft: Betriebshandbuch erstellen, Architekturvisualisierungen und mehr",
  },
  {
    name: "Event Horizon",
    href: "https://event-horizon.sp23.online/",
    icon: PartyPopper,
    description: "Teamevents in Linz planen",
  },
  {
    name: "Fenstertage",
    href: "https://fenstertage.com",
    icon: CalendarRange,
    description:
      "Fenstertage 2026 in Deutschland, Österreich und der Schweiz finden – auch bekannt als Brückentage oder Zwickeltage",
  },
];
