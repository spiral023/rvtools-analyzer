import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Download, RotateCcw, Save, Settings as SettingsIcon, Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMaintenanceSettings } from "@/hooks/useMaintenance";
import { useAllTechInfoLatest } from "@/hooks/useActiveSnapshots";
import { useAppMode } from "@/hooks/useAppMode";
import { useFilterState } from "@/hooks/useFilterState";
import { useTableDisplayPreferencesActions } from "@/hooks/useTableDisplayPreferences";
import { deriveSettingsEmail } from "@/lib/maintenance";
import { applyUserDataBackup, collectUserDataBackup } from "@/domain/services/backupService";
import {
  buildBackupFileName,
  parseUserDataBackup,
  serializeUserDataBackup,
} from "@/lib/backup/userDataBackup";
import { downloadTextFile } from "@/lib/export/tableExport";
import { SysvScopeTree } from "@/components/sysv/SysvScopeTree";
import {
  buildSysvScopeDirectory,
  buildSysvScopeGlobalFilter,
  getAvailableSysvScopePreference,
  splitSysvContactName,
} from "@/lib/sysvScope";
import type { MaintenanceSettings, SysvScopePreference } from "@/domain/models/types";

export default function Settings() {
  const { settings, saveSettings, isSaving } = useMaintenanceSettings();
  const { data: techInfoRows = [] } = useAllTechInfoLatest();
  const { mode, lastSysvScope, saveLastSysvScope } = useAppMode();
  const { setFilters } = useFilterState();
  const { resetAllTablePreferences } = useTableDisplayPreferencesActions();
  const [previousSettings, setPreviousSettings] = useState(settings);
  const [form, setForm] = useState<MaintenanceSettings>(settings);
  const queryClient = useQueryClient();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isResettingTablePreferences, setIsResettingTablePreferences] = useState(false);
  const [personalScope, setPersonalScope] = useState<SysvScopePreference>({ kind: "all" });
  const [isApplyingPersonalScope, setIsApplyingPersonalScope] = useState(false);
  const sysvDirectory = useMemo(() => buildSysvScopeDirectory(techInfoRows), [techInfoRows]);

  if (settings !== previousSettings) {
    setPreviousSettings(settings);
    setForm(settings);
  }

  useEffect(() => {
    setPersonalScope(getAvailableSysvScopePreference(sysvDirectory, lastSysvScope));
  }, [lastSysvScope, sysvDirectory]);

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
        queryClient.invalidateQueries({ queryKey: ["maintenanceWindows"] }),
        queryClient.invalidateQueries({ queryKey: ["scenarios"] }),
        queryClient.invalidateQueries({ queryKey: ["vcenterGroups"] }),
      ]);
      toast.success(
        `Backup importiert: ${result.settingsImported ? "Kontaktvorgaben, " : ""}` +
          `${result.assignmentsImported} Cluster-Zuweisungen, ` +
          `${result.maintenanceWindowsImported} Wartungsfenster, ${result.scenariosImported} Szenarien, ` +
          `${result.vcenterGroupsImported} vCenter-Gruppen${result.vmScopeSettingsImported ? ", Filtervorgaben" : ""}` +
          `${result.tableDisplayPreferencesImported ? ", Tabellenansichten" : ""}` +
          `${result.sysvScopeImported ? ", persönlicher Systemkontext" : ""}.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import fehlgeschlagen.");
    } finally {
      setIsTransferring(false);
    }
  };

  const handleResetTablePreferences = async () => {
    if (!window.confirm(
      "Eigene Spaltenkonfigurationen und Sortierungen wirklich für alle Tabellen verwerfen?",
    )) return;

    setIsResettingTablePreferences(true);
    try {
      await resetAllTablePreferences();
      toast.success("Standard-Spalten für alle Tabellen wiederhergestellt.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Standard-Spalten konnten nicht wiederhergestellt werden.");
    } finally {
      setIsResettingTablePreferences(false);
    }
  };

  const handleApplyPersonalScope = async () => {
    setIsApplyingPersonalScope(true);
    try {
      setFilters({ globalFilter: buildSysvScopeGlobalFilter(personalScope) });
      await saveLastSysvScope(personalScope);

      if (personalScope.kind === "person") {
        const contact = splitSysvContactName(personalScope.displayName);
        const nextSettings: MaintenanceSettings = {
          ...settings,
          id: "default",
          firstName: contact.firstName,
          lastName: contact.lastName,
          updatedAt: new Date().toISOString(),
        };
        setForm(nextSettings);
        await saveSettings(nextSettings);
      }

      toast.success(personalScope.kind === "all"
        ? "Der persönliche Systemkontext wurde entfernt."
        : "Der persönliche Systemkontext wurde übernommen.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Der persönliche Systemkontext konnte nicht gespeichert werden.");
    } finally {
      setIsApplyingPersonalScope(false);
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
          <CardTitle>App-Modus</CardTitle>
          <CardDescription>
            Aktiver Modus: <span className="font-medium text-foreground">{mode === "sysv" ? "SysV-Modus" : "VM-Admin-Modus"}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Der App-Modus wird ausschließlich durch eine gültige <code>modus.json</code> in einem Upload geändert. Diese Ansicht bietet keinen Modus-Umschalter.
          </p>
        </CardContent>
      </Card>

      {techInfoRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Persönlicher Systemkontext</CardTitle>
            <CardDescription>
              Wähle optional eine Abteilung oder Person. Die Auswahl setzt einen normalen globalen Filter und kann dort jederzeit wieder entfernt werden.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SysvScopeTree directory={sysvDirectory} value={personalScope} onChange={setPersonalScope} />
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/25 px-3 py-2.5">
              <p className="max-w-xl text-xs text-muted-foreground">
                Bei einer Person werden Vor- und Nachname aus dem Tech-Info-Format <code>NACHNAME Vorname</code> in die Kontaktvorgaben übernommen. Die Firmenangabe bleibt unverändert.
              </p>
              <Button type="button" onClick={() => void handleApplyPersonalScope()} disabled={isApplyingPersonalScope}>
                {isApplyingPersonalScope ? "Wird übernommen …" : "Systemkontext übernehmen"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tabellenansichten</CardTitle>
          <CardDescription>
            Eigene Spaltenauswahlen, Reihenfolgen und Sortierungen werden lokal gespeichert. Mit dem Button
            stellst du die Standardansicht für alle Tabellen wieder her; eigene Konfigurationen werden dabei verworfen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleResetTablePreferences()}
            disabled={isResettingTablePreferences}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {isResettingTablePreferences ? "Standard-Spalten werden gesetzt …" : "Standard-Spalten für alle Tabellen"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Datensicherung</CardTitle>
          <CardDescription>
            Exportiert Kontaktvorgaben, Cluster-Zuweisungen (Verantwortliche, Wartungsfenster,
            Mail-Adressen), Planungs-Szenarien, vCenter-Gruppen und den persönlichen Systemkontext als JSON-Datei.
            RVTools-, Tech-Info-Daten und der App-Modus sind nicht enthalten. Beim Import werden Einträge mit
            gleichem Schlüssel überschrieben, alle übrigen bleiben erhalten.
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
