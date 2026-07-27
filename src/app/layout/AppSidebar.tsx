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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SIDEBAR_GLOSSARY } from "@/lib/glossary";
import { RELATED_TOOLS } from "@/lib/relatedTools";
import { useOptionalImportController } from "@/hooks/useImportController";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Upload,
  Loader2,
  HardDrive,
  Database,
  Network,
  GitCompare,
  Server,
  Monitor,
  ClipboardList,
  CalendarRange,
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
  { title: "Overview", url: "/overview", icon: LayoutDashboard },
  { title: "Uploads", url: "/upload", icon: Upload, dropzone: true },
];

const analysisNav: NavItem[] = [
  { title: "vCenter", url: "/vcenter", icon: GitCompare },
  { title: "Cluster", url: "/clusters", icon: Server },
  { title: "Hosts", url: "/hosts", icon: Server },
  { title: "VMs", url: "/vms", icon: Monitor },
  { title: "Capacity", url: "/capacity", icon: HardDrive },
  { title: "Storage / Backup", url: "/storage-backup", icon: Database },
  { title: "Netzwerk", url: "/network-security", icon: Network },
  { title: "Hardware", url: "/hardware", icon: Server },
  { title: "Tech-Info", url: "/tech-info", icon: ClipboardList },
];

const toolsNav = [
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
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
        Weitere Tools
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <div className="grid grid-cols-4 gap-1 px-1">
          {RELATED_TOOLS.map((tool) => (
            <Tooltip key={tool.href}>
              <TooltipTrigger asChild>
                <a
                  href={tool.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={tool.name}
                  className="flex h-9 w-9 items-center justify-center justify-self-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <tool.icon className="h-4 w-4" aria-hidden="true" />
                </a>
              </TooltipTrigger>
              <TooltipContent side="right" align="center" className="max-w-[220px]">
                <p className="text-xs font-semibold">{tool.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{tool.description}</p>
              </TooltipContent>
            </Tooltip>
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
        <NavSection label="Analyse" items={analysisNav} />
        <NavSection label="Tools" items={toolsNav} />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-0">
        <RelatedToolsNav />
      </SidebarFooter>
    </Sidebar>
  );
}
