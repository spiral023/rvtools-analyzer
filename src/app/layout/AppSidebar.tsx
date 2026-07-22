import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { SIDEBAR_GLOSSARY } from "@/lib/glossary";
import {
  LayoutDashboard,
  Upload,
  Activity,
  HardDrive,
  Gauge,
  Database,
  Network,
  Shield,
  Key,
  GitCompare,
  Server,
  ClipboardList,
  CalendarRange,
  Info,
} from "lucide-react";

const mainNav = [
  { title: "Overview", url: "/overview", icon: LayoutDashboard },
  { title: "Uploads & Snapshots", url: "/upload", icon: Upload },
];

const analysisNav = [
  { title: "vCenter", url: "/fleet-compare", icon: GitCompare },
  { title: "Daily Ops", url: "/daily-ops", icon: Activity },
  { title: "Cluster", url: "/clusters", icon: Server },
  { title: "Capacity", url: "/capacity", icon: HardDrive },
  { title: "Performance", url: "/performance", icon: Gauge },
  { title: "Storage / Backup", url: "/storage-backup", icon: Database },
  { title: "Netzwerk", url: "/network-security", icon: Network },
  { title: "Hardware", url: "/hardware", icon: Server },
  { title: "Compliance / Lifecycle", url: "/compliance", icon: Shield },
  { title: "Licensing", url: "/licensing", icon: Key },
  { title: "Tech-Info", url: "/tech-info", icon: ClipboardList },
];

const toolsNav = [
  { title: "Wartungsfenster", url: "/wartungsfenster", icon: CalendarRange },
];

const infoNav = [
  { title: "Impressum", url: "/impressum", icon: Info },
];

function NavSection({
  label,
  items,
}: {
  label: string;
  items: typeof mainNav;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <InfoTooltip entry={SIDEBAR_GLOSSARY[item.url]} side="right" align="center">
                <SidebarMenuButton asChild>
                  <NavLink
                    to={item.url}
                    end
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.title}</span>
                  </NavLink>
                </SidebarMenuButton>
              </InfoTooltip>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
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
        <NavSection label="Info" items={infoNav} />
      </SidebarContent>
    </Sidebar>
  );
}
