import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { Download, Save, Settings as SettingsIcon, Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMaintenanceSettings } from "@/hooks/useMaintenance";
import { deriveSettingsEmail } from "@/lib/maintenance";
import { applyUserDataBackup, collectUserDataBackup } from "@/domain/services/backupService";
import {
  buildBackupFileName,
  parseUserDataBackup,
  serializeUserDataBackup,
} from "@/lib/backup/userDataBackup";
import { downloadTextFile } from "@/lib/export/tableExport";
import type { MaintenanceSettings } from "@/domain/models/types";

export default function Settings() {
  const { settings, saveSettings, isSaving } = useMaintenanceSettings();
  const [previousSettings, setPreviousSettings] = useState(settings);
  const [form, setForm] = useState<MaintenanceSettings>(settings);
  const queryClient = useQueryClient();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [isTransferring, setIsTransferring] = useState(false);

  if (settings !== previousSettings) {
    setPreviousSettings(settings);
    setForm(settings);
  }

  const derivedEmail = deriveSettingsEmail(form);

  const updateField = (field: keyof Pick<MaintenanceSettings, "firstName" | "lastName" | "companyName">, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await saveSettings({
      ...form,
      id: "default",
      updatedAt: new Date().toISOString(),
    });
    toast.success("Settings gespeichert.");
  };

  const handleExport = async () => {
    setIsTransferring(true);
    try {
      const backup = await collectUserDataBackup();
      downloadTextFile(
        serializeUserDataBackup(backup),
        buildBackupFileName(new Date()),
        "application/json;charset=utf-8",
      );
      toast.success("Backup exportiert.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export fehlgeschlagen.");
    } finally {
      setIsTransferring(false);
    }
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsTransferring(true);
    try {
      const backup = parseUserDataBackup(await file.text());
      const result = await applyUserDataBackup(backup);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["maintenanceSettings"] }),
        queryClient.invalidateQueries({ queryKey: ["maintenanceAssignments"] }),
        queryClient.invalidateQueries({ queryKey: ["scenarios"] }),
      ]);
      toast.success(
        `Backup importiert: ${result.settingsImported ? "Kontaktvorgaben, " : ""}` +
          `${result.assignmentsImported} Cluster-Zuweisungen, ${result.scenariosImported} Szenarien.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import fehlgeschlagen.");
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <SettingsIcon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Lokale Vorgaben für Ansprechpartner, Mailadressen und Signaturen.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kontaktvorgaben</CardTitle>
          <CardDescription>
            Diese Daten bleiben lokal in IndexedDB und werden für Wartungsankündigungen verwendet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">Vorname</Label>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={(event) => updateField("firstName", event.target.value)}
                  autoComplete="given-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Nachname</Label>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={(event) => updateField("lastName", event.target.value)}
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="companyName">Firmen-Name</Label>
              <Input
                id="companyName"
                value={form.companyName}
                onChange={(event) => updateField("companyName", event.target.value)}
                autoComplete="organization"
              />
            </div>

            <div className="rounded-md border border-border/60 bg-muted/30 px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Abgeleitetes Mailformat</p>
              <p className="mt-1 font-mono-data text-sm">{derivedEmail || "—"}</p>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSaving}>
                <Save className="mr-2 h-4 w-4" />
                Speichern
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Datensicherung</CardTitle>
          <CardDescription>
            Exportiert Kontaktvorgaben, Cluster-Zuweisungen (Verantwortliche, Wartungsfenster,
            Mail-Adressen) und Planungs-Szenarien als JSON-Datei. RVTools- und Tech-Info-Daten
            sind nicht enthalten. Beim Import werden Einträge mit gleichem Schlüssel überschrieben,
            alle übrigen bleiben erhalten.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void handleExport()} disabled={isTransferring}>
              <Download className="mr-2 h-4 w-4" />
              Backup exportieren
            </Button>
            <Button
              variant="outline"
              onClick={() => importInputRef.current?.click()}
              disabled={isTransferring}
            >
              <Upload className="mr-2 h-4 w-4" />
              Backup importieren
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => void handleImportFile(event)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
