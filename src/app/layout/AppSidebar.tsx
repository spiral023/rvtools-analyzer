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
  SidebarFooter,
} from "@/components/ui/sidebar";
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
  Lock,
  Server,
  ClipboardList,
  BarChart3,
  Cable,
  CalendarClock,
  Map,
} from "lucide-react";

const mainNav = [
  { title: "Overview", url: "/overview", icon: LayoutDashboard },
  { title: "Uploads & Snapshots", url: "/upload", icon: Upload },
];

const analysisNav = [
  { title: "Daily Ops", url: "/daily-ops", icon: Activity },
  { title: "Capacity", url: "/capacity", icon: HardDrive },
  { title: "Performance", url: "/performance", icon: Gauge },
  { title: "Storage / Backup", url: "/storage-backup", icon: Database },
  { title: "Network / Security", url: "/network-security", icon: Network },
  { title: "Host-Netzwerk", url: "/host-network", icon: Cable },
  { title: "Hardware", url: "/hardware", icon: Server },
  { title: "Compliance / Lifecycle", url: "/compliance", icon: Shield },
  { title: "Licensing", url: "/licensing", icon: Key },
  { title: "Tech-Info", url: "/tech-info", icon: ClipboardList },
  { title: "VMware Versions", url: "/vmware-versions", icon: BarChart3 },
];

const compareNav = [
  { title: "Fleet Compare", url: "/fleet-compare", icon: GitCompare },
];

const toolsNav = [
  { title: "Wartungsankündigung", url: "/wartungsankuendigung", icon: CalendarClock },
  { title: "Planung", url: "/planning", icon: Map },
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
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-xs">
          RV
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-foreground">RVTools</span>
          <span className="text-[10px] text-muted-foreground">Analyzer</span>
        </div>
      </div>
      <SidebarContent className="py-2">
        <NavSection label="Dashboard" items={mainNav} />
        <NavSection label="Analyse" items={analysisNav} />
        <NavSection label="Tools" items={toolsNav} />
        <NavSection label="Vergleich" items={compareNav} />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Lock className="h-3 w-3" />
          <span>Daten nur lokal in IndexedDB</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}