import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2, Upload } from "lucide-react";
import { useOptionalImportController } from "@/hooks/useImportController";
import { DRAG_IDLE_TIMEOUT_MS, dragContainsFiles } from "@/lib/fileDrag";

/** Zielroute nach einem globalen Drop: nur dort ist die Import-Warteschlange mit Fortschritt sichtbar. */
const UPLOAD_ROUTE = "/upload";

/**
 * Nimmt Datei-Drops überall im Fenster an und reicht sie an denselben Import-Controller weiter, den
 * die Upload-Seite und der Sidebar-Menüpunkt nutzen (ZIP-Archive und SysV-Datenpakete inklusive).
 *
 * Zwei Aufgaben, die auch unabhängig vom Import wichtig sind:
 *
 * 1. Ohne ein globales `preventDefault` öffnet der Browser eine daneben abgelegte Datei im Tab –
 *    die laufende Analyse-Session samt Filterzustand ist damit verloren. Dieser Schutz greift
 *    deshalb immer, auch wenn kein Import möglich ist.
 * 2. Hat eine lokale Dropzone das Ereignis bereits behandelt (erkennbar an `defaultPrevented`, da
 *    React-Handler vor den Listenern auf `window` laufen), bleibt das Overlay verborgen und der
 *    Import wird nicht doppelt gestartet.
 */
export function GlobalFileDropOverlay() {
  const importController = useOptionalImportController();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [dragActive, setDragActive] = useState(false);
  const idleTimerRef = useRef<number | null>(null);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const importFiles = importController?.importFiles;
  const importing = importController?.importing ?? false;
  const enabled = Boolean(importFiles);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current === null) return;
    window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
  }, []);

  useEffect(() => clearIdleTimer, [clearIdleTimer]);

  useEffect(() => {
    const deactivate = () => {
      clearIdleTimer();
      setDragActive(false);
    };

    const handleDragOver = (event: DragEvent) => {
      if (!dragContainsFiles(event.dataTransfer)) return;
      const handledLocally = event.defaultPrevented;
      event.preventDefault();
      if (!enabled) return;

      setDragActive(!handledLocally);
      clearIdleTimer();
      idleTimerRef.current = window.setTimeout(() => {
        idleTimerRef.current = null;
        setDragActive(false);
      }, DRAG_IDLE_TIMEOUT_MS);
    };

    const handleDrop = (event: DragEvent) => {
      if (!dragContainsFiles(event.dataTransfer)) return;
      const handledLocally = event.defaultPrevented;
      deactivate();
      event.preventDefault();
      if (handledLocally || !enabled || !importFiles) return;

      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return;
      // Erst navigieren, dann importieren: die Warteschlange mit Fortschritt pro Datei ist nur auf
      // der Upload-Seite sichtbar, und ein RVTools-Import kann Minuten dauern.
      if (pathnameRef.current !== UPLOAD_ROUTE) navigate(UPLOAD_ROUTE);
      void importFiles(files);
    };

    // Ein `dragleave` ohne `relatedTarget` bedeutet, dass der Zeiger das Fenster verlassen hat.
    // Wechsel zwischen Kindelementen erzeugen ebenfalls `dragleave`, tragen dort aber das neue
    // Element und dürfen das Overlay nicht flackern lassen.
    const handleDragLeave = (event: DragEvent) => {
      if (!event.relatedTarget) deactivate();
    };

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragend", deactivate);
    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragend", deactivate);
    };
  }, [clearIdleTimer, enabled, importFiles, navigate]);

  if (!dragActive || !enabled) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-0 z-[60] flex animate-in items-center justify-center bg-background/80 p-6 backdrop-blur-sm fade-in-0 duration-150"
    >
      <div className="flex max-w-lg animate-in flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary/60 bg-card/95 p-10 text-center shadow-lg zoom-in-95 duration-150">
        {importing
          ? <Loader2 className="h-10 w-10 animate-spin text-primary" />
          : <Upload className="h-10 w-10 text-primary" />}
        <p className="text-base font-medium">
          {importing ? "Import läuft – bitte warten" : "Dateien hier ablegen zum Importieren"}
        </p>
        <p className="text-xs text-muted-foreground">
          RVTools / Tech-Info (XLSX), Netzwerk/vROps (CSV), Wartungsfenster (TXT), Modus- oder
          Backup-Datei (JSON), SysV-Datenpaket oder ZIP-Archiv. ZIP-Archive werden automatisch
          entpackt; der Fortschritt erscheint auf der Upload-Seite.
        </p>
      </div>
    </div>
  );
}
