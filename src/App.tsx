import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/app/layout/ThemeProvider";
import { FilterProvider } from "@/hooks/useFilterState";
import { AppLayout } from "@/app/layout/AppLayout";

// Seiten lazy laden: jede Route landet in einem eigenen Chunk, der erst beim
// Aufruf geladen wird – der Initial-Bundle bleibt klein.
const Overview = lazy(() => import("@/pages/Overview"));
const UploadSnapshots = lazy(() => import("@/pages/UploadSnapshots"));
const Diagnostics = lazy(() => import("@/pages/Diagnostics"));
const DailyOps = lazy(() => import("@/pages/DailyOps"));
const Capacity = lazy(() => import("@/pages/Capacity"));
const PerformancePage = lazy(() => import("@/pages/PerformancePage"));
const StorageBackup = lazy(() => import("@/pages/StorageBackup"));
const NetworkSecurity = lazy(() => import("@/pages/NetworkSecurity"));
const HostNetwork = lazy(() => import("@/pages/HostNetwork"));
const ComplianceLifecycle = lazy(() => import("@/pages/ComplianceLifecycle"));
const Licensing = lazy(() => import("@/pages/Licensing"));
const FleetCompare = lazy(() => import("@/pages/FleetCompare"));
const Hardware = lazy(() => import("@/pages/Hardware"));
const TechInfo = lazy(() => import("@/pages/TechInfo"));
const VmwareVersions = lazy(() => import("@/pages/VmwareVersions"));
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <FilterProvider>
            <AppLayout>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route path="/" element={<Navigate to="/overview" replace />} />
                  <Route path="/overview" element={<Overview />} />
                  <Route path="/upload" element={<UploadSnapshots />} />
                  <Route path="/upload/diagnostics" element={<Diagnostics />} />
                  <Route path="/daily-ops" element={<DailyOps />} />
                  <Route path="/capacity" element={<Capacity />} />
                  <Route path="/performance" element={<PerformancePage />} />
                  <Route path="/storage-backup" element={<StorageBackup />} />
                  <Route path="/network-security" element={<NetworkSecurity />} />
                  <Route path="/host-network" element={<HostNetwork />} />
                  <Route path="/compliance" element={<ComplianceLifecycle />} />
                  <Route path="/hardware" element={<Hardware />} />
                  <Route path="/licensing" element={<Licensing />} />
                  <Route path="/tech-info" element={<TechInfo />} />
                  <Route path="/vmware-versions" element={<VmwareVersions />} />
                  <Route path="/fleet-compare" element={<FleetCompare />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </AppLayout>
          </FilterProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
