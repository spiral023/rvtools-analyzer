import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router-dom";
import { ThemeProvider } from "@/app/layout/ThemeProvider";
import { FilterProvider } from "@/hooks/useFilterState";
import { SelectionProvider } from "@/hooks/useSelection";
import { AppLayout } from "@/app/layout/AppLayout";
import { ImportProvider } from "@/hooks/useImportController";
import { OnboardingProvider } from "@/hooks/useOnboarding";
import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog";

// Seiten lazy laden: jede Route landet in einem eigenen Chunk, der erst beim
// Aufruf geladen wird – der Initial-Bundle bleibt klein.
const Overview = lazy(() => import("@/pages/Overview"));
const UploadSnapshots = lazy(() => import("@/pages/UploadSnapshots"));
const Diagnostics = lazy(() => import("@/pages/Diagnostics"));
const DailyOps = lazy(() => import("@/pages/DailyOps"));
const Clusters = lazy(() => import("@/pages/Clusters"));
const Capacity = lazy(() => import("@/pages/Capacity"));
const PerformancePage = lazy(() => import("@/pages/PerformancePage"));
const StorageBackup = lazy(() => import("@/pages/StorageBackup"));
const Networking = lazy(() => import("@/pages/Networking"));
const ComplianceLifecycle = lazy(() => import("@/pages/ComplianceLifecycle"));
const Licensing = lazy(() => import("@/pages/Licensing"));
const FleetCompare = lazy(() => import("@/pages/FleetCompare"));
const Hardware = lazy(() => import("@/pages/Hardware"));
const TechInfo = lazy(() => import("@/pages/TechInfo"));
const MaintenanceWindows = lazy(() => import("@/pages/MaintenanceWindows"));
const Wartungsankuendigung = lazy(() => import("@/pages/Wartungsankuendigung"));
const Planning = lazy(() => import("@/pages/Planning"));
const Settings = lazy(() => import("@/pages/Settings"));
const Impressum = lazy(() => import("@/pages/Impressum"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Daten ändern sich nur durch einen Import → lange als frisch behandeln,
      // spart Refetches beim Seitenwechsel.
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

const PageFallback = () => (
  <div className="flex h-64 items-center justify-center text-muted-foreground">
    <span className="animate-pulse">Lädt…</span>
  </div>
);

function AppRouteLayout() {
  return (
    <>
      <AppLayout>
        <Suspense fallback={<PageFallback />}><Outlet /></Suspense>
      </AppLayout>
      <OnboardingDialog />
    </>
  );
}

// Der Data Router ermöglicht useBlocker auf Formularseiten und schützt damit
// auch Browser-Zurück/Vorwärts sowie Sidebar- und URL-Navigation.
const router = createBrowserRouter([
  {
    path: "/",
    element: <AppRouteLayout />,
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      { path: "overview", element: <Overview /> },
      { path: "upload", element: <UploadSnapshots /> },
      { path: "upload/diagnostics", element: <Diagnostics /> },
      { path: "daily-ops", element: <DailyOps /> },
      { path: "clusters", element: <Clusters /> },
      { path: "capacity", element: <Capacity /> },
      { path: "performance", element: <PerformancePage /> },
      { path: "storage-backup", element: <StorageBackup /> },
      { path: "network-security", element: <Networking initialTab="security" /> },
      { path: "host-network", element: <Networking initialTab="host" /> },
      { path: "compliance", element: <ComplianceLifecycle /> },
      { path: "hardware", element: <Hardware /> },
      { path: "licensing", element: <Licensing /> },
      { path: "tech-info", element: <TechInfo /> },
      { path: "vmware-versions", element: <ComplianceLifecycle initialTab="versions" /> },
      { path: "wartungsfenster", element: <MaintenanceWindows /> },
      { path: "wartungsankuendigung", element: <Wartungsankuendigung /> },
      { path: "planning", element: <Planning /> },
      { path: "settings", element: <Settings /> },
      { path: "fleet-compare", element: <FleetCompare /> },
      { path: "impressum", element: <Impressum /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ImportProvider>
          <OnboardingProvider>
            <FilterProvider>
              <SelectionProvider>
                <RouterProvider router={router} fallbackElement={<PageFallback />} />
              </SelectionProvider>
            </FilterProvider>
          </OnboardingProvider>
        </ImportProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
