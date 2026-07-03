import { useCallback, useState } from "react";
import { ClientDetailDialog } from "@/components/client/ClientDetailDialog";
import type { TechInfoClientLatest } from "@/domain/models/types";

export function useClientDetailDialog() {
  const [selectedClient, setSelectedClient] = useState<TechInfoClientLatest | null>(null);

  const openClientDetail = useCallback((row: TechInfoClientLatest) => {
    setSelectedClient(row);
  }, []);

  const clientDetailDialog = (
    <ClientDetailDialog
      client={selectedClient}
      open={!!selectedClient}
      onClose={() => setSelectedClient(null)}
    />
  );

  return { openClientDetail, selectedClient, clientDetailDialog };
}
