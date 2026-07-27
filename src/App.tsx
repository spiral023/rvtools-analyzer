import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, isRouteErrorResponse, Navigate, Outlet, RouterProvider, useRouteError } from "react-router-dom";
import { ThemeProvider } from "@/app/layout/ThemeProvider";
import { FilterProvider } from "@/hooks/useFilterState";
import { SelectionProvider } from "@/hooks/useSelection";
import { AppLayout } from "@/app/layout/AppLayout";
import { ImportProvider } from "@/hooks/useImportController";
import { OnboardingProvider } from "@/hooks/useOnboarding";
import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog";
import { IMPORTED_DATA_QUERY_DEFAULTS } from "@/lib/queryCache";

// Seiten lazy laden: jede Route landet in einem eigenen Chunk, der erst beim
// Aufruf geladen wird – der Initial-Bundle bleibt klein.
const Overview = lazy(() => import("@/pages/Overview"));
const UploadSnapshots = lazy(() => import("@/pages/UploadSnapshots"));
const Clusters = lazy(() => import("@/pages/Clusters"));
const StorageBackup = lazy(() => import("@/pages/StorageBackup"));
const Networking = lazy(() => import("@/pages/Networking"));
const NetworkAudit = lazy(() => import("@/pages/NetworkAudit"));
const VCenter = lazy(() => import("@/pages/FleetCompare"));
const Hosts = lazy(() => import("@/pages/Hosts"));
const Vms = lazy(() => import("@/pages/Vms"));
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
      ...IMPORTED_DATA_QUERY_DEFAULTS,
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

function RouterErrorBoundary() {
  const error = useRouteError();
  const title = isRouteErrorResponse(error) ? `${error.status} – ${error.statusText}` : "Unerwarteter Fehler";

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-6">
      <div className="max-w-md space-y-3 text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">RVTools Analyzer</p>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">Die angeforderte Ansicht konnte nicht geladen werden.</p>
        <a href="/" className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline">Zur Übersicht</a>
      </div>
    </div>
  );
}

// Der Data Router ermöglicht useBlocker auf Formularseiten und schützt damit
// auch Browser-Zurück/Vorwärts sowie Sidebar- und URL-Navigation.
const router = createBrowserRouter([
  {
    path: "/",
    element: <AppRouteLayout />,
    errorElement: <RouterErrorBoundary />,
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      { path: "overview", element: <Overview /> },
      { path: "upload", element: <UploadSnapshots /> },
      { path: "upload/diagnostics", element: <Navigate to="/upload?tab=diagnostics" replace /> },
      { path: "clusters", element: <Clusters /> },
      { path: "capacity", element: <Navigate to="/clusters?tab=capacity" replace /> },
      { path: "storage-backup", element: <StorageBackup /> },
      { path: "network-security", element: <Networking initialTab="security" /> },
      { path: "network-audit", element: <NetworkAudit /> },
      { path: "host-network", element: <Networking initialTab="host" /> },
      { path: "hardware", element: <Hardware /> },
      { path: "tech-info", element: <TechInfo /> },
      { path: "wartungsfenster", element: <MaintenanceWindows /> },
      { path: "wartungsankuendigung", element: <Wartungsankuendigung /> },
      { path: "planning", element: <Planning /> },
      { path: "settings", element: <Settings /> },
      { path: "vcenter", element: <VCenter /> },
      { path: "hosts", element: <Hosts /> },
      { path: "vms", element: <Vms /> },
      { path: "fleet-compare", element: <Navigate to="/vcenter" replace /> },
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
