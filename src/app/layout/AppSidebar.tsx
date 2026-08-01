import { useCallback, useState } from "react";
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
import { useOptionalImportController } from "@/hooks/useImportController";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Upload,
  Loader2,
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
  { title: "Wartung", url: "/wartungsankuendigung", icon: CalendarRange },
  { title: "Planung", url: "/planning", icon: GitCompare },
  { title: "Export & Berichte", url: "/exports", icon: FileOutput },
  { title: "Wartungsfenster", url: "/wartungsfenster", icon: CalendarRange },
];

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

function RelatedToolsNav() {
  const [activeTool, setActiveTool] = useState<(typeof RELATED_TOOLS)[number] | null>(null);

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <div
          aria-live="polite"
          aria-atomic="true"
          className={cn(
            "mb-2 h-[76px] overflow-hidden rounded-lg bg-sidebar-accent/50 px-3 py-2 transition-opacity duration-150 motion-reduce:transition-none",
            activeTool ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <p className="truncate text-xs font-semibold text-sidebar-accent-foreground">
            {activeTool?.name}
          </p>
          <p className="mt-1 line-clamp-3 text-[11px] leading-4 text-sidebar-foreground/70">
            {activeTool?.description}
          </p>
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
        <NavSection label="Infrastruktur" items={infrastructureNav} />
        <NavSection label="Analyse" items={analysisNav} />
        <NavSection label="Tools" items={toolsNav} />
      </SidebarContent>
      <SidebarFooter className="p-0">
        <RelatedToolsNav />
      </SidebarFooter>
    </Sidebar>
  );
}
