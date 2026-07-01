import { FormEvent, useEffect, useState } from "react";
import { Save, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMaintenanceSettings } from "@/hooks/useMaintenance";
import { deriveSettingsEmail } from "@/lib/maintenance";
import type { MaintenanceSettings } from "@/domain/models/types";

export default function Settings() {
  const { settings, saveSettings, isSaving } = useMaintenanceSettings();
  const [form, setForm] = useState<MaintenanceSettings>(settings);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

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
    </div>
  );
}
