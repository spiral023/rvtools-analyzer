import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/app/layout/ThemeProvider";
import { FilterProvider } from "@/hooks/useFilterState";
import { AppLayout } from "@/app/layout/AppLayout";
import Overview from "@/pages/Overview";
import UploadSnapshots from "@/pages/UploadSnapshots";
import DailyOps from "@/pages/DailyOps";
import Capacity from "@/pages/Capacity";
import PerformancePage from "@/pages/PerformancePage";
import StorageBackup from "@/pages/StorageBackup";
import NetworkSecurity from "@/pages/NetworkSecurity";
import ComplianceLifecycle from "@/pages/ComplianceLifecycle";
import Licensing from "@/pages/Licensing";
import FleetCompare from "@/pages/FleetCompare";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <FilterProvider>
            <AppLayout>
              <Routes>
                <Route path="/" element={<Navigate to="/overview" replace />} />
                <Route path="/overview" element={<Overview />} />
                <Route path="/upload" element={<UploadSnapshots />} />
                <Route path="/daily-ops" element={<DailyOps />} />
                <Route path="/capacity" element={<Capacity />} />
                <Route path="/performance" element={<PerformancePage />} />
                <Route path="/storage-backup" element={<StorageBackup />} />
                <Route path="/network-security" element={<NetworkSecurity />} />
                <Route path="/compliance" element={<ComplianceLifecycle />} />
                <Route path="/licensing" element={<Licensing />} />
                <Route path="/fleet-compare" element={<FleetCompare />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AppLayout>
          </FilterProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
