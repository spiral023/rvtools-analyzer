import { AlertTriangle } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";

export function PwaUpdateWarning() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <Button
      variant="destructive"
      size="sm"
      className="h-8 gap-1.5 px-2.5 text-xs"
      onClick={() => void updateServiceWorker(true)}
    >
      <AlertTriangle className="h-3.5 w-3.5" />
      Neue Version laden
    </Button>
  );
}
