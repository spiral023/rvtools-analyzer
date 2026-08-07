import { useCallback, useMemo, useState } from "react";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { SIDEBAR_GLOSSARY } from "@/lib/glossary";
import { RELATED_TOOLS } from "@/lib/relatedTools";
import { USAGE_TIPS } from "@/lib/usageTips";
import { useOptionalImportController } from "@/hooks/useImportController";
import { useOptionalAppMode } from "@/hooks/useAppMode";
import { useRestrictedDataset } from "@/hooks/useRestrictedDataset";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Upload,
  Loader2,
  Lightbulb,
  ChevronLeft,
  ChevronRight,
  Download,
  Database,
  Network,
  GitCompare,
  Server,
  Monitor,
  ClipboardList,
  CalendarRange,
  ListChecks,
  FileOutput,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** Erlaubt das direkte Droppen von Import-Dateien auf diesen Menüpunkt. */
  dropzone?: boolean;
}

const mainNav: NavItem[] = [
  { title: "Übersicht", url: "/overview", icon: LayoutDashboard },
  { title: "Uploads", url: "/upload", icon: Upload, dropzone: true },
];

const infrastructureNav: NavItem[] = [
  { title: "vCenter", url: "/vcenter", icon: GitCompare },
  { title: "Cluster", url: "/clusters", icon: Server },
  { title: "Hosts", url: "/hosts", icon: Server },
  { title: "VMs", url: "/vms", icon: Monitor },
];

const analysisNav: NavItem[] = [
  { title: "Storage / Backup", url: "/storage-backup", icon: Database },
  { title: "Netzwerk", url: "/network-security", icon: Network },
  { title: "Hardware", url: "/hardware", icon: Server },
  { title: "Tech-Info", url: "/tech-info", icon: ClipboardList },
];

const toolsNav: NavItem[] = [
  { title: "Netzwerk-Kontrolle", url: "/network-audit", icon: ListChecks },
  { title: "VM-Kontrolle", url: "/vm-control", icon: Monitor },
  { title: "Wartung", url: "/wartungsankuendigung", icon: CalendarRange },
  { title: "Planung", url: "/planning", icon: GitCompare },
  { title: "Export & Berichte", url: "/exports", icon: FileOutput },
  { title: "Wartungsfenster", url: "/wartungsfenster", icon: CalendarRange },
];

/**
 * Im SysV-Modus sieht ein Systemverantwortlicher nur seine eigenen Systeme. Alles,
 * was den Blick auf die gesamte Infrastruktur oder auf Betriebsplanung öffnet, bleibt
 * deshalb verborgen. Die Routen selbst bleiben erreichbar; die Datengrenze zieht beim
 * SysV-Datenpaket ohnehin der physische Paketinhalt.
 */
const SYSV_HIDDEN_NAV_URLS = new Set([
  "/vcenter",
  "/clusters",
  "/network-audit",
  "/wartungsankuendigung",
  "/hardware",
  "/planning",
  "/wartungsfenster",
]);

/**
 * In einem importierten SysV-Datenpaket sind Hosts nur als gemeinsamer
 * Kapazitätskontext enthalten. Eine Hostübersicht würde dort eine Vollständigkeit
 * suggerieren, die der Paketinhalt nicht hat.
 */
const RESTRICTED_DATASET_HIDDEN_NAV_URLS = new Set([
  "/hosts",
]);

function NavSection({
  label,
  items,
}: {
  label: string;
  items: NavItem[];
}) {
  const importController = useOptionalImportController();
  const [dragOverUrl, setDragOverUrl] = useState<string | null>(null);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setDragOverUrl(null);
    if (!importController || event.dataTransfer.files.length === 0) return;
    void importController.importFiles(event.dataTransfer.files);
  }, [importController]);

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isDropzone = !!item.dropzone && !!importController;
            const isDragOver = isDropzone && dragOverUrl === item.url;
            const isImporting = isDropzone && importController.importing;

            return (
              <SidebarMenuItem key={item.url}>
                <InfoTooltip entry={SIDEBAR_GLOSSARY[item.url]} side="right" align="center">
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        isDragOver && "bg-primary/10 text-primary ring-2 ring-inset ring-primary/50",
                      )}
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      onDragOver={isDropzone ? (e) => { e.preventDefault(); setDragOverUrl(item.url); } : undefined}
                      onDragLeave={isDropzone ? () => setDragOverUrl(null) : undefined}
                      onDrop={isDropzone ? handleDrop : undefined}
                    >
                      {isImporting
                        ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                        : <item.icon className="h-4 w-4 shrink-0" />}
                      <span className="truncate">{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </InfoTooltip>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/**
 * Startpunkt des Karussells. Ein Zufallstipp je Seitenaufruf verhindert, dass jeder
 * Nutzer dauerhaft denselben Hinweis sieht und den Bereich als Deko abtut.
 */
function pickRandomTipIndex() {
  return Math.floor(Math.random() * USAGE_TIPS.length);
}

/**
 * Die Fläche über den Tool-Icons zeigt standardmäßig einen Bedienhinweis und wechselt
 * nur solange auf die Tool-Beschreibung, wie ein Tool-Icon fokussiert oder überfahren wird.
 * Die Höhe ist fix, damit weder Moduswechsel noch unterschiedlich lange Texte die
 * darunterliegenden Icons verschieben.
 */
function RelatedToolsNav() {
  const [activeTool, setActiveTool] = useState<(typeof RELATED_TOOLS)[number] | null>(null);
  const [tipIndex, setTipIndex] = useState(pickRandomTipIndex);
  const { canInstall, isInstalled, install } = usePwaInstall();

  // Läuft die App bereits installiert, ist der Installationshinweis nur noch Ballast.
  const tips = useMemo(
    () => USAGE_TIPS.filter((entry) => entry.action?.id !== "install-pwa" || !isInstalled),
    [isInstalled],
  );
  // Der Startindex zieht über die ungefilterte Liste und kann deshalb überlaufen.
  const tip = tips[tipIndex % tips.length];
  const action = tip.action?.id === "install-pwa" && canInstall ? tip.action : null;

  const shiftTip = (offset: number) =>
    setTipIndex((current) => (current + offset + tips.length) % tips.length);

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        {/*
          Feste Höhe aus 16px Innenabstand, 16px Titel, 4px Abstand, drei Textzeilen à 16px und
          24px Karussell-Zeile. Ein Tipp mit Schaltfläche bleibt darin, weil die Schaltfläche
          zwei Textzeilen ersetzt statt sie zu ergänzen.
        */}
        <div className="mb-2 flex h-[108px] flex-col overflow-hidden rounded-lg bg-sidebar-accent/50 px-3 py-2">
          <div aria-live="polite" aria-atomic="true" className="min-h-0 flex-1">
            <div
              key={activeTool ? `tool-${activeTool.href}` : `tip-${tip.id}`}
              className="animate-in fade-in duration-150 motion-reduce:animate-none"
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold text-sidebar-accent-foreground">
                {!activeTool && <Lightbulb className="h-3 w-3 shrink-0" aria-hidden="true" />}
                <span className="truncate">{activeTool ? activeTool.name : tip.title}</span>
              </p>
              {/*
                Ohne Karussell-Zeile ist Platz für eine vierte Zeile – längere Tool-Beschreibungen
                enden dadurch nicht mehr in Auslassungspunkten. Umgekehrt tritt die Schaltfläche
                eines Tipps an die Stelle der zweiten und dritten Textzeile: Was sie auslöst,
                steht bereits in ihrer Beschriftung.
              */}
              <p
                className={cn(
                  "mt-1 text-[11px] leading-4 text-sidebar-foreground/70",
                  activeTool ? "line-clamp-4" : action ? "line-clamp-1" : "line-clamp-3",
                )}
              >
                {activeTool ? activeTool.description : action ? action.text : tip.text}
              </p>
              {!activeTool && action && (
                <button
                  type="button"
                  onClick={() => void install()}
                  className="mt-1 flex items-center gap-1 rounded text-[11px] font-medium leading-4 text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Download className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {action.label}
                </button>
              )}
            </div>
          </div>
          {!activeTool && (
            <div className="mt-1 flex h-5 shrink-0 items-center justify-between">
              <button
                type="button"
                aria-label="Vorheriger Tipp"
                onClick={() => shiftTip(-1)}
                className="flex h-5 w-5 items-center justify-center rounded text-sidebar-foreground/60 transition-colors hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <div aria-hidden="true" className="flex items-center gap-1">
                {tips.map((entry, index) => (
                  <span
                    key={entry.id}
                    className={cn(
                      "h-1 w-1 rounded-full bg-sidebar-foreground/25 transition-colors",
                      index === tipIndex % tips.length && "bg-sidebar-foreground/70",
                    )}
                  />
                ))}
              </div>
              <button
                type="button"
                aria-label="Nächster Tipp"
                onClick={() => shiftTip(1)}
                className="flex h-5 w-5 items-center justify-center rounded text-sidebar-foreground/60 transition-colors hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-4 gap-1 px-1">
          {RELATED_TOOLS.map((tool) => (
            <a
              key={tool.href}
              href={tool.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={tool.name}
              onMouseEnter={() => setActiveTool(tool)}
              onMouseLeave={() => setActiveTool(null)}
              onFocus={() => setActiveTool(tool)}
              onBlur={() => setActiveTool(null)}
              className={cn(
                "flex h-10 w-10 items-center justify-center justify-self-center rounded-md text-sidebar-foreground/70 transition-[color,background-color,transform] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96] motion-reduce:transform-none",
                activeTool === tool && "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
            >
              <tool.icon className="h-4 w-4" aria-hidden="true" />
            </a>
          ))}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const appMode = useOptionalAppMode();
  const mode = appMode?.mode ?? "vm-admin";
  const isModeHydrated = appMode?.isHydrated ?? true;
  const { isRestricted, isPending: restrictedPending } = useRestrictedDataset();
  const visibleInCurrentMode = (item: NavItem) => {
    if (RESTRICTED_DATASET_HIDDEN_NAV_URLS.has(item.url) && !restrictedPending && isRestricted) return false;
    if (!SYSV_HIDDEN_NAV_URLS.has(item.url)) return true;
    // Während die lokale Modusvorgabe lädt, bleiben ausschließlich die
    // modusabhängigen Einträge verborgen. Dadurch blinkt keine falsche Navigation auf.
    return isModeHydrated && mode !== "sysv";
  };

  return (
    <Sidebar className="border-r border-sidebar-border">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <img
          src="/favicon-master.png"
          alt=""
          aria-hidden="true"
          className="h-8 w-8 rounded-md object-cover outline outline-1 outline-black/10 dark:outline-white/10"
        />
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-foreground">RVTools</span>
          <span className="text-[10px] text-muted-foreground">Analyzer</span>
        </div>
      </div>
      <SidebarContent className="py-2">
        <NavSection label="Dashboard" items={mainNav} />
        <NavSection label="Infrastruktur" items={infrastructureNav.filter(visibleInCurrentMode)} />
        <NavSection label="Analyse" items={analysisNav.filter(visibleInCurrentMode)} />
        <NavSection label="Tools" items={toolsNav.filter(visibleInCurrentMode)} />
      </SidebarContent>
      <SidebarFooter className="p-0">
        <RelatedToolsNav />
      </SidebarFooter>
    </Sidebar>
  );
}
