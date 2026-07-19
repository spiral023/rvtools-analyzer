import { useMemo, useState, type ReactNode } from "react";
import { CalendarClock, Clock, Copy, FileText, Link2, Mail, Plus, Save, Trash2, Wrench } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageLoadingState } from "@/components/dashboard/PageLoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { WARTUNG_KPI, WARTUNG_COLUMNS, WARTUNG_SECTIONS } from "@/lib/glossaries/wartung";
import { useActiveSnapshotIds, useClusters, useHosts, useRawSheet, useTechInfoLatestByVmNames, useVms } from "@/hooks/useActiveSnapshots";
import { useMaintenanceAssignments, useMaintenanceSettings } from "@/hooks/useMaintenance";
import {
  buildMaintenanceMailTemplate,
  buildMaintenanceRows,
  createDefaultAssignment,
  formatMaintenanceWindow,
  parseTechContactName,
  type ChangeType,
  type MaintenanceClusterRow,
  type MaintenanceType,
} from "@/lib/maintenance";
import { formatNum } from "@/lib/xlsx/parseHelpers";
import type {
  MaintenanceClusterAssignment,
  MaintenanceClusterType,
  MaintenanceContact,
  MaintenanceWindow,
} from "@/domain/models/types";

const maintenanceTypes: MaintenanceType[] = ["ESXi Update", "Hardware Wartung", "Konfigurationsänderung"];
const changeTypes: ChangeType[] = ["Normal Change", "Standard Change"];

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatContact(contact: MaintenanceContact): string {
  return `${contact.firstName} ${contact.lastName}`.trim() || "—";
}

function makeContactKey(contact: MaintenanceContact, index: number, contacts: MaintenanceContact[]): string {
  const firstName = contact.firstName.trim().toLowerCase();
  const lastName = contact.lastName.trim().toLowerCase();
  const occurrence = contacts.slice(0, index + 1).filter((item) =>
    item.firstName.trim().toLowerCase() === firstName &&
    item.lastName.trim().toLowerCase() === lastName
  ).length;
  return `${firstName}-${lastName}-${occurrence}`;
}

function makeEmailKey(email: string, index: number, emails: string[]): string {
  const normalized = email.trim().toLowerCase();
  const occurrence = emails.slice(0, index + 1).filter((item) => item.trim().toLowerCase() === normalized).length;
  return `${normalized}-${occurrence}`;
}

function joinRecipients(row: MaintenanceClusterRow): string {
  const parts = [
    ...row.contacts.map(formatContact),
    ...row.additionalEmails,
  ].filter(Boolean);
  if (parts.length === 0) return "—";
  return parts.sort((a, b) => a.localeCompare(b, "de-DE", { numeric: true, sensitivity: "base" })).join(", ");
}

function joinWindows(windows: MaintenanceWindow[]): string {
  if (windows.length === 0) return "—";
  return windows
    .map(formatMaintenanceWindow)
    .sort((a, b) => a.localeCompare(b, "de-DE", { numeric: true, sensitivity: "base" }))
    .join(", ");
}

function toDateTimeLocal(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function defaultPeriodFromWindow(window: MaintenanceWindow | undefined): { from: string; to: string } {
  const start = new Date();
  const [startHour, startMinute] = (window?.startTime ?? "22:00").split(":").map(Number);
  const [endHour, endMinute] = (window?.endTime ?? "05:00").split(":").map(Number);
  start.setHours(startHour || 0, startMinute || 0, 0, 0);
  const end = new Date(start);
  end.setHours(endHour || 0, endMinute || 0, 0, 0);
  if (end <= start) end.setDate(end.getDate() + 1);
  return { from: toDateTimeLocal(start), to: toDateTimeLocal(end) };
}

function makeDraft(row: MaintenanceClusterRow | null): MaintenanceClusterAssignment {
  if (!row) return createDefaultAssignment("", "");
  return {
    vcenterId: row.vcenterId,
    clusterName: row.name,
    type: row.type,
    windows: row.windows,
    contacts: row.contacts,
    additionalEmails: row.additionalEmails,
    updatedAt: new Date().toISOString(),
  };
}

function SelectBox({
  value,
  onChange,
  children,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  ariaLabel: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {children}
    </select>
  );
}

function SectionHeading({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:h-3.5 [&_svg]:w-3.5">
        {icon}
      </span>
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      {hint && <span className="text-xs tabular-nums text-muted-foreground">{hint}</span>}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

function AssignmentPanel({
  activeRow,
  selectedRows,
  suggestions,
  onSave,
  isSaving,
}: {
  activeRow: MaintenanceClusterRow | null;
  selectedRows: MaintenanceClusterRow[];
  suggestions: string[];
  onSave: (rows: MaintenanceClusterRow[], draft: MaintenanceClusterAssignment) => Promise<void>;
  isSaving: boolean;
}) {
  const targetRows = selectedRows.length > 1 ? selectedRows : activeRow ? [activeRow] : [];
  const source = selectedRows.length > 1 ? selectedRows[0] ?? null : activeRow;
  const sourceKey = source?.key ?? "__empty__";
  const [draftSourceKey, setDraftSourceKey] = useState(sourceKey);
  const [draft, setDraft] = useState<MaintenanceClusterAssignment>(() => makeDraft(source));
  const [windowText, setWindowText] = useState("");
  const [contactDraft, setContactDraft] = useState({ firstName: "", lastName: "" });
  const [suggestionValue, setSuggestionValue] = useState("");
  const [emailDraft, setEmailDraft] = useState("");

  if (draftSourceKey !== sourceKey) {
    setDraftSourceKey(sourceKey);
    setDraft(makeDraft(source));
  }

  const addWindow = () => {
    const label = windowText.trim();
    if (!label) return;
    setDraft((current) => ({
      ...current,
      windows: [...current.windows, { id: makeId("window"), label }],
    }));
    setWindowText("");
  };

  const addEmail = () => {
    const email = emailDraft.trim();
    if (!email || !email.includes("@")) return;
    setDraft((current) => ({
      ...current,
      additionalEmails: [...(current.additionalEmails ?? []), email],
    }));
    setEmailDraft("");
  };

  const addContact = (contact: MaintenanceContact) => {
    if (!contact.firstName.trim() && !contact.lastName.trim()) return;
    setDraft((current) => ({
      ...current,
      contacts: [...current.contacts, { firstName: contact.firstName.trim(), lastName: contact.lastName.trim() }],
    }));
    setContactDraft({ firstName: "", lastName: "" });
    setSuggestionValue("");
  };

  const applySuggestion = () => {
    const contact = parseTechContactName(suggestionValue);
    setContactDraft(contact);
    addContact(contact);
  };

  const save = async () => {
    if (targetRows.length === 0) return;
    await onSave(targetRows, draft);
  };
  const contactEntries = draft.contacts.map((contact, index) => ({
    contact,
    index,
    key: makeContactKey(contact, index, draft.contacts),
  }));
  const additionalEmails = draft.additionalEmails ?? [];
  const additionalEmailEntries = additionalEmails.map((email, index) => ({
    email,
    index,
    key: makeEmailKey(email, index, additionalEmails),
  }));

  if (targetRows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cluster-Zuweisungen</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Wählen Sie eine Tabellenzeile für Details oder mehrere Cluster für Bulk-Bearbeitung.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>{targetRows.length > 1 ? `Bulk-Bearbeitung (${targetRows.length})` : targetRows[0].name}</span>
          <Button size="sm" onClick={() => void save()} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            Speichern
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Typ</Label>
          <SelectBox
            ariaLabel="Cluster-Typ"
            value={draft.type}
            onChange={(value) => setDraft((current) => ({ ...current, type: value as MaintenanceClusterType }))}
          >
            <option value="Normal">Normal</option>
            <option value="Spezial">Spezial</option>
          </SelectBox>
        </div>

        <div className="space-y-3">
          <Label>Wartungsfenster</Label>
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <Input
              placeholder="z. B. Werktags 22:00-05:00 Uhr"
              value={windowText}
              onChange={(event) => setWindowText(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addWindow(); } }}
            />
            <Button type="button" variant="outline" onClick={addWindow} disabled={!windowText.trim()}>
              <Plus className="mr-2 h-4 w-4" />
              Hinzufügen
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {draft.windows.length === 0 && <span className="text-sm text-muted-foreground">Keine Fenster hinterlegt.</span>}
            {draft.windows.map((window) => (
              <Badge key={window.id} variant="secondary" className="gap-2 py-1">
                {formatMaintenanceWindow(window)}
                <button
                  type="button"
                  aria-label="Wartungsfenster entfernen"
                  onClick={() => setDraft((current) => ({ ...current, windows: current.windows.filter((item) => item.id !== window.id) }))}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Label>Verantwortliche</Label>
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <Input
              list="tech-contact-suggestions"
              placeholder="Aus Tech-Info wählen (Nachname Vorname)"
              value={suggestionValue}
              onChange={(event) => setSuggestionValue(event.target.value)}
            />
            <Button type="button" variant="outline" onClick={applySuggestion} disabled={!suggestionValue.trim()}>
              Übernehmen
            </Button>
            <datalist id="tech-contact-suggestions">
              {suggestions.map((value) => <option key={value} value={value} />)}
            </datalist>
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
            <Input
              placeholder="Vorname"
              value={contactDraft.firstName}
              onChange={(event) => setContactDraft((current) => ({ ...current, firstName: event.target.value }))}
            />
            <Input
              placeholder="Nachname"
              value={contactDraft.lastName}
              onChange={(event) => setContactDraft((current) => ({ ...current, lastName: event.target.value }))}
            />
            <Button type="button" variant="outline" onClick={() => addContact(contactDraft)}>
              <Plus className="mr-2 h-4 w-4" />
              Hinzufügen
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {draft.contacts.length === 0 && <span className="text-sm text-muted-foreground">Keine Verantwortlichen hinterlegt.</span>}
            {contactEntries.map((entry) => (
              <Badge key={entry.key} variant="outline" className="gap-2 py-1">
                {formatContact(entry.contact)}
                <button
                  type="button"
                  aria-label="Verantwortlichen entfernen"
                  onClick={() => setDraft((current) => ({ ...current, contacts: current.contacts.filter((_, i) => i !== entry.index) }))}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Label>Zusätzliche Mail-Adressen</Label>
          <p className="text-xs text-muted-foreground">
            Weitere Empfänger neben den Verantwortlichen, z. B. Postkorb oder Teams-Kanal.
          </p>
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <Input
              type="email"
              placeholder="postkorb@firma.at"
              value={emailDraft}
              onChange={(event) => setEmailDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addEmail(); } }}
            />
            <Button type="button" variant="outline" onClick={addEmail} disabled={!emailDraft.trim().includes("@")}>
              <Plus className="mr-2 h-4 w-4" />
              Hinzufügen
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {additionalEmails.length === 0 && <span className="text-sm text-muted-foreground">Keine zusätzlichen Adressen hinterlegt.</span>}
            {additionalEmailEntries.map((entry) => (
              <Badge key={entry.key} variant="outline" className="gap-2 py-1 font-mono-data">
                {entry.email}
                <button
                  type="button"
                  aria-label="Mail-Adresse entfernen"
                  onClick={() => setDraft((current) => ({ ...current, additionalEmails: (current.additionalEmails ?? []).filter((_, i) => i !== entry.index) }))}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MaintenanceMailDialog({
  open,
  onClose,
  rows,
}: {
  open: boolean;
  onClose: () => void;
  rows: MaintenanceClusterRow[];
}) {
  const { settings } = useMaintenanceSettings();
  const [maintenanceType, setMaintenanceType] = useState<MaintenanceType>("ESXi Update");
  const [contactName, setContactName] = useState("");
  const [periods, setPeriods] = useState<Record<string, { from: string; to: string }>>({});
  const [change, setChange] = useState<{ id: string; title: string; type: ChangeType }>({
    id: "",
    title: "",
    type: "Normal Change",
  });
  const [links, setLinks] = useState<Array<{ id: string; label: string; url: string }>>([]);
  const defaultContactName = `${settings.firstName} ${settings.lastName}`.trim();
  const dialogResetKey = open
    ? [
        defaultContactName,
        rows.map((row) => `${row.key}:${row.windows[0]?.id ?? ""}:${row.windows[0]?.label ?? ""}`).join("|"),
      ].join("::")
    : "__closed__";
  const [appliedDialogResetKey, setAppliedDialogResetKey] = useState(dialogResetKey);

  if (appliedDialogResetKey !== dialogResetKey) {
    setAppliedDialogResetKey(dialogResetKey);
    if (open) {
      setContactName(defaultContactName);
      setPeriods(Object.fromEntries(rows.map((row) => [row.key, defaultPeriodFromWindow(row.windows[0])])));
    }
  }

  const template = useMemo(
    () =>
      buildMaintenanceMailTemplate({
        maintenanceType,
        settings,
        contactName,
        clusters: rows.map((row) => ({
          clusterName: row.name,
          clusterType: row.type,
          from: periods[row.key]?.from ?? "",
          to: periods[row.key]?.to ?? "",
          contacts: row.contacts,
          additionalEmails: row.additionalEmails,
        })),
        change,
        links,
      }),
    [change, contactName, links, maintenanceType, periods, rows, settings],
  );
  const clustersWithoutContacts = rows.filter((row) => row.contacts.length === 0 && row.additionalEmails.length === 0);

  const copyTemplate = async () => {
    const text = [`Betreff: ${template.subject}`, `To: ${template.to.join("; ") || "—"}`, "", template.body].join("\n");
    await navigator.clipboard.writeText(text);
    toast.success("Mailvorlage in die Zwischenablage kopiert.");
  };

  const openInMailClient = () => {
    // mailto benötigt CRLF für korrekte Zeilenumbrüche in Outlook
    const body = template.body.replace(/\n/g, "\r\n");
    const params = new URLSearchParams({ subject: template.subject, body });
    const mailto = `mailto:${encodeURIComponent(template.to.join(";"))}?${params.toString().replace(/\+/g, "%20")}`;

    // Outlook/Windows kürzt sehr lange mailto-URLs still ab
    if (mailto.length > 1900) {
      toast.warning("Mail ist sehr lang – Outlook könnte den Text kürzen. Nutze im Zweifel „Kopieren“.");
    }
    window.location.href = mailto;
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-0 border-b border-border/60 px-6 py-4 pr-12">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Mail className="h-5 w-5" />
            </span>
            <div className="space-y-0.5 text-left">
              <DialogTitle className="text-balance">Wartungsankündigung erstellen</DialogTitle>
              <p className="text-sm text-muted-foreground">
                <span className="tabular-nums">{rows.length}</span> Cluster · Vorlage konfigurieren und kopieren
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {clustersWithoutContacts.length > 0 && (
            <Alert variant="destructive" className="mb-5">
              <AlertTitle>Empfänger fehlen</AlertTitle>
              <AlertDescription>
                Ohne Verantwortliche oder zusätzliche Mail-Adresse wird keine To-Adresse erzeugt: {clustersWithoutContacts.map((row) => row.name).join(", ")}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:items-start">
            {/* Konfiguration */}
            <div className="space-y-6">
              <section className="space-y-3">
                <SectionHeading icon={<FileText />} title="Eckdaten" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Wartungstyp</Label>
                    <SelectBox ariaLabel="Wartungstyp" value={maintenanceType} onChange={(value) => setMaintenanceType(value as MaintenanceType)}>
                      {maintenanceTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                    </SelectBox>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Change Typ</Label>
                    <SelectBox ariaLabel="Change Typ" value={change.type} onChange={(value) => setChange((current) => ({ ...current, type: value as ChangeType }))}>
                      {changeTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                    </SelectBox>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Change ID</Label>
                    <Input value={change.id} onChange={(event) => setChange((current) => ({ ...current, id: event.target.value }))} placeholder="CRX00000234252" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Ansprechpartner</Label>
                    <Input value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="Max Mustermann" />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Change Titel</Label>
                    <Input value={change.title} onChange={(event) => setChange((current) => ({ ...current, title: event.target.value }))} placeholder="UCS Firmware Upgrade" />
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <SectionHeading icon={<Clock />} title="Wartungszeiträume" hint={String(rows.length)} />
                <div className="space-y-2">
                  {rows.map((row) => (
                    <div key={row.key} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="font-mono-data text-sm font-semibold">{row.name}</span>
                        <Badge variant={row.type === "Spezial" ? "destructive" : "secondary"}>{row.type}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {row.windows[0] ? formatMaintenanceWindow(row.windows[0]) : "kein wiederkehrendes Fenster"}
                        </span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Von</Label>
                          <Input
                            type="datetime-local"
                            value={periods[row.key]?.from ?? ""}
                            onChange={(event) => setPeriods((current) => ({ ...current, [row.key]: { ...(current[row.key] ?? { to: "" }), from: event.target.value } }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Bis</Label>
                          <Input
                            type="datetime-local"
                            value={periods[row.key]?.to ?? ""}
                            onChange={(event) => setPeriods((current) => ({ ...current, [row.key]: { ...(current[row.key] ?? { from: "" }), to: event.target.value } }))}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <SectionHeading
                  icon={<Link2 />}
                  title="Optionale Links"
                  action={
                    <Button type="button" variant="outline" size="sm" onClick={() => setLinks((current) => [...current, { id: makeId("link"), label: "", url: "" }])}>
                      <Plus className="mr-2 h-4 w-4" />
                      Link
                    </Button>
                  }
                />
                {links.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine Links hinterlegt.</p>
                ) : (
                  <div className="space-y-2">
                    {links.map((link) => (
                      <div key={link.id} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                        <Input
                          placeholder="Bezeichnung"
                          value={link.label}
                          onChange={(event) => setLinks((current) => current.map((item) => item.id === link.id ? { ...item, label: event.target.value } : item))}
                        />
                        <Input
                          placeholder="URL"
                          value={link.url}
                          onChange={(event) => setLinks((current) => current.map((item) => item.id === link.id ? { ...item, url: event.target.value } : item))}
                        />
                        <Button type="button" variant="ghost" size="icon" onClick={() => setLinks((current) => current.filter((item) => item.id !== link.id))} aria-label="Link entfernen">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Live-Vorschau */}
            <div className="lg:sticky lg:top-0">
              <div className="overflow-hidden rounded-lg border border-border/60 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.24),0_12px_28px_-16px_rgba(0,0,0,0.6)]">
                <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vorschau</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={openInMailClient}>
                      <Mail className="mr-2 h-4 w-4" />
                      In Outlook öffnen
                    </Button>
                    <Button size="sm" onClick={() => void copyTemplate()}>
                      <Copy className="mr-2 h-4 w-4" />
                      Kopieren
                    </Button>
                  </div>
                </div>
                <div className="space-y-2.5 border-b border-border/60 px-4 py-3">
                  <div className="grid grid-cols-[3.25rem_1fr] items-baseline gap-2">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">Betreff</span>
                    <span className="text-sm font-semibold text-balance">{template.subject}</span>
                  </div>
                  <div className="grid grid-cols-[3.25rem_1fr] items-baseline gap-2">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">An</span>
                    <span className="break-all font-mono-data text-sm">{template.to.join("; ") || "—"}</span>
                  </div>
                </div>
                <Textarea
                  value={template.body}
                  readOnly
                  aria-label="Mail-Text Vorschau"
                  className="min-h-[300px] max-h-[42vh] resize-none rounded-none border-0 bg-transparent font-mono-data text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Wartungsankuendigung() {
  const { snapshots, filters, snapshotsLoading } = useActiveSnapshotIds();
  const { vms, isLoading: vmsLoading } = useVms();
  const { data: clusters = [], isLoading: clustersLoading } = useClusters();
  const { data: hosts = [], isLoading: hostsLoading } = useHosts();
  const { data: rawVHostRows = [], isLoading: rawVHostLoading } = useRawSheet("vHost");
  const vcenterIds = useMemo(() => [...new Set(clusters.map((cluster) => cluster.vcenterId))], [clusters]);
  const { assignments, saveAssignment, isSaving } = useMaintenanceAssignments(vcenterIds);
  const { settings } = useMaintenanceSettings();
  const { data: techInfoLatest = [], isLoading: techInfoLoading } = useTechInfoLatestByVmNames(vms.map((vm) => vm.vmName));
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [mailDialogOpen, setMailDialogOpen] = useState(false);

  const rows = useMemo(
    () => buildMaintenanceRows({ clusters, hosts, vms, rawVHostRows, assignments }),
    [assignments, clusters, hosts, rawVHostRows, vms],
  );

  const searchedRows = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => [
      row.name,
      row.type,
      joinRecipients(row),
      row.windows.map(formatMaintenanceWindow).join(" "),
    ].some((value) => value.toLowerCase().includes(q)));
  }, [filters.search, rows]);

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedKeys.has(row.key)),
    [rows, selectedKeys],
  );
  const activeRow = rows.find((row) => row.key === activeKey) ?? null;
  const clustersWithoutContacts = selectedRows.filter((row) => row.contacts.length === 0 && row.additionalEmails.length === 0).length;

  const techContactSuggestions = useMemo(() => {
    const values = new Set<string>();
    for (const entry of techInfoLatest) {
      if (entry.sysv?.trim()) values.add(entry.sysv.trim());
      if (entry.sysvDeputy?.trim()) values.add(entry.sysvDeputy.trim());
    }
    return [...values].sort((a, b) => a.localeCompare(b, "de-DE", { sensitivity: "base" }));
  }, [techInfoLatest]);

  const toggleSelected = (key: string, checked: boolean) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const columns = useMemo<ColumnDef<MaintenanceClusterRow, unknown>[]>(() => [
    {
      id: "select",
      header: () => (
        <Checkbox
          checked={searchedRows.length > 0 && searchedRows.every((row) => selectedKeys.has(row.key))}
          onCheckedChange={(checked) => {
            setSelectedKeys((current) => {
              const next = new Set(current);
              for (const row of searchedRows) {
                if (checked) next.add(row.key);
                else next.delete(row.key);
              }
              return next;
            });
          }}
          aria-label="Alle sichtbaren Cluster auswählen"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selectedKeys.has(row.original.key)}
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={(checked) => toggleSelected(row.original.key, Boolean(checked))}
          aria-label={`${row.original.name} auswählen`}
        />
      ),
    },
    {
      accessorKey: "name",
      header: "Name",
      meta: { info: WARTUNG_COLUMNS.name },
      cell: ({ getValue }) => {
        const value = getValue() as string;
        return (
          <span className="block max-w-[200px] truncate" title={value}>
            {value}
          </span>
        );
      },
    },
    {
      accessorKey: "hosts",
      header: "Hosts",
      meta: { info: WARTUNG_COLUMNS.hosts },
      cell: ({ getValue }) => <span className="tabular-nums">{formatNum(getValue() as number)}</span>,
    },
    {
      accessorKey: "totalVms",
      header: "VMs",
      meta: { info: WARTUNG_COLUMNS.totalVms },
      cell: ({ getValue }) => <span className="tabular-nums">{formatNum(getValue() as number)}</span>,
    },
    {
      accessorKey: "type",
      header: "Typ",
      meta: { info: WARTUNG_COLUMNS.type },
      cell: ({ getValue }) => {
        const value = getValue() as MaintenanceClusterType;
        return <Badge variant={value === "Spezial" ? "destructive" : "secondary"}>{value}</Badge>;
      },
    },
    {
      accessorKey: "windows",
      header: "Wartungsfenster",
      meta: { info: WARTUNG_COLUMNS.windows },
      cell: ({ row }) => {
        const value = joinWindows(row.original.windows);
        return (
          <span className="block max-w-[220px] truncate" title={value}>
            {value}
          </span>
        );
      },
    },
    {
      accessorKey: "contacts",
      header: "Verantwortliche",
      meta: { info: WARTUNG_COLUMNS.contacts },
      cell: ({ row }) => {
        const value = joinRecipients(row.original);
        return (
          <span className="block max-w-[160px] truncate" title={value}>
            {value}
          </span>
        );
      },
    },
  ], [searchedRows, selectedKeys]);

  const saveAssignments = async (targetRows: MaintenanceClusterRow[], draft: MaintenanceClusterAssignment) => {
    await Promise.all(targetRows.map((row) => saveAssignment({
      vcenterId: row.vcenterId,
      clusterName: row.name,
      type: draft.type,
      windows: draft.windows,
      contacts: draft.contacts,
      additionalEmails: draft.additionalEmails ?? [],
      updatedAt: new Date().toISOString(),
    })));
    toast.success(targetRows.length === 1 ? "Cluster-Zuweisung gespeichert." : "Cluster-Zuweisungen gespeichert.");
  };

  const dataLoading = snapshotsLoading || vmsLoading || clustersLoading || hostsLoading
    || rawVHostLoading || techInfoLoading;
  if (dataLoading) return <PageLoadingState title="Wartungsankündigung" />;

  if (snapshots.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold">Wartungsankündigung</h1>
        <EmptyState
          icon={<Wrench className="h-6 w-6" />}
          title="Keine Daten"
          description="Laden Sie RVTools-Daten hoch, um Cluster-Wartungen vorzubereiten."
          actionLabel="Zum Upload"
          actionTo="/upload"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Wartungsankündigung"
        subtitle="Cluster-Zuweisungen pflegen und kopierbare Wartungs-Mails erzeugen."
        meta={
          <Button disabled={selectedRows.length === 0} onClick={() => setMailDialogOpen(true)}>
            <Mail className="mr-2 h-4 w-4" />
            Wartungsankündigung
          </Button>
        }
      >
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard title="Cluster" value={formatNum(rows.length)} icon={<CalendarClock className="h-4 w-4" />} info={WARTUNG_KPI.cluster} />
        <KpiCard title="Selektiert" value={formatNum(selectedRows.length)} info={WARTUNG_KPI.selektiert} />
        <KpiCard title="Spezial" value={formatNum(rows.filter((row) => row.type === "Spezial").length)} severity="warn" info={WARTUNG_KPI.spezial} />
        <KpiCard title="Ohne Empfänger" value={formatNum(rows.filter((row) => row.contacts.length === 0 && row.additionalEmails.length === 0).length)} severity={rows.some((row) => row.contacts.length === 0 && row.additionalEmails.length === 0) ? "warn" : "ok"} info={WARTUNG_KPI.ohneEmpfaenger} />
      </div>

      {!settings.companyName && (
        <Alert>
          <AlertTitle>Settings unvollständig</AlertTitle>
          <AlertDescription>
            Firmen-Name fehlt. To-Adressen können erst nach Pflege der Settings vollständig abgeleitet werden.
          </AlertDescription>
        </Alert>
      )}

      {selectedRows.length > 0 && clustersWithoutContacts > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Auswahl enthält Cluster ohne Empfänger</AlertTitle>
          <AlertDescription>
            Prüfen Sie die Zuweisungen (Verantwortliche oder zusätzliche Mail-Adresse) vor dem Erstellen der Mailvorlage.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,860px)_minmax(420px,1fr)]">
        <div>
          <InfoTooltip entry={WARTUNG_SECTIONS.clusterTable} side="bottom">
            <h3 className="mb-3 w-fit cursor-help text-sm font-semibold text-muted-foreground">
              Cluster im aktiven Snapshot-Scope ({searchedRows.length})
            </h3>
          </InfoTooltip>
          <VirtualTable
            data={searchedRows}
            columns={columns}
            height={520}
            onRowClick={(row) => setActiveKey(row.key)}
            exportFileName="rvtools-wartungsankuendigung-cluster"
          />
        </div>
        <AssignmentPanel
          activeRow={activeRow}
          selectedRows={selectedRows}
          suggestions={techContactSuggestions}
          onSave={saveAssignments}
          isSaving={isSaving}
        />
      </div>

      <MaintenanceMailDialog open={mailDialogOpen} onClose={() => setMailDialogOpen(false)} rows={selectedRows} />
    </div>
  );
}
