import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarClock, Copy, Mail, Plus, Save, Trash2, Wrench } from "lucide-react";
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
import { FilterBar } from "@/components/dashboard/FilterBar";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { VirtualTable } from "@/components/tables/VirtualTable";
import { useActiveSnapshotIds, useClusters, useHosts, useRawSheet, useTechInfoLatestByVmNames, useVms } from "@/hooks/useActiveSnapshots";
import { useMaintenanceAssignments, useMaintenanceSettings } from "@/hooks/useMaintenance";
import {
  MAINTENANCE_WINDOW_PRESETS,
  WEEKDAY_OPTIONS,
  buildMaintenanceMailTemplate,
  buildMaintenanceRows,
  createDefaultAssignment,
  deriveContactEmail,
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
  MaintenanceWeekday,
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

function joinContacts(contacts: MaintenanceContact[]): string {
  if (contacts.length === 0) return "—";
  return contacts.map(formatContact).join(", ");
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
      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
    >
      {children}
    </select>
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
  const [draft, setDraft] = useState<MaintenanceClusterAssignment>(() => makeDraft(activeRow));
  const [customWindow, setCustomWindow] = useState({
    label: "",
    dayFrom: "MO" as MaintenanceWeekday,
    dayTo: "FR" as MaintenanceWeekday,
    startTime: "22:00",
    endTime: "05:00",
  });
  const [contactDraft, setContactDraft] = useState({ firstName: "", lastName: "" });
  const [suggestionValue, setSuggestionValue] = useState("");

  useEffect(() => {
    const source = selectedRows.length > 1 ? selectedRows[0] ?? null : activeRow;
    setDraft(makeDraft(source));
  }, [activeRow, selectedRows]);

  const addWindow = (window: MaintenanceWindow) => {
    setDraft((current) => ({
      ...current,
      windows: [...current.windows, { ...window, id: makeId("window") }],
    }));
  };

  const addCustomWindow = () => {
    const label = customWindow.label.trim() || `${customWindow.dayFrom}-${customWindow.dayTo} ${customWindow.startTime}-${customWindow.endTime}`;
    addWindow({ ...customWindow, id: makeId("window"), label });
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
          <div className="flex flex-wrap gap-2">
            {MAINTENANCE_WINDOW_PRESETS.map((preset) => (
              <Button key={preset.presetId} type="button" variant="outline" size="sm" onClick={() => addWindow(preset)}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                {preset.label}
              </Button>
            ))}
          </div>
          <div className="space-y-2">
            <Input
              placeholder="Label"
              value={customWindow.label}
              onChange={(event) => setCustomWindow((current) => ({ ...current, label: event.target.value }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <SelectBox
                ariaLabel="Start-Wochentag"
                value={customWindow.dayFrom}
                onChange={(value) => setCustomWindow((current) => ({ ...current, dayFrom: value as MaintenanceWeekday }))}
              >
                {WEEKDAY_OPTIONS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
              </SelectBox>
              <SelectBox
                ariaLabel="End-Wochentag"
                value={customWindow.dayTo}
                onChange={(value) => setCustomWindow((current) => ({ ...current, dayTo: value as MaintenanceWeekday }))}
              >
                {WEEKDAY_OPTIONS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
              </SelectBox>
            </div>
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Input type="time" value={customWindow.startTime} onChange={(event) => setCustomWindow((current) => ({ ...current, startTime: event.target.value }))} />
              <Input type="time" value={customWindow.endTime} onChange={(event) => setCustomWindow((current) => ({ ...current, endTime: event.target.value }))} />
              <Button type="button" variant="outline" size="icon" onClick={addCustomWindow} aria-label="Eigenes Wartungsfenster hinzufügen">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
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
            {draft.contacts.map((contact, index) => (
              <Badge key={`${contact.firstName}-${contact.lastName}-${index}`} variant="outline" className="gap-2 py-1">
                {formatContact(contact)}
                <button
                  type="button"
                  aria-label="Verantwortlichen entfernen"
                  onClick={() => setDraft((current) => ({ ...current, contacts: current.contacts.filter((_, i) => i !== index) }))}
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

  useEffect(() => {
    if (!open) return;
    setContactName(`${settings.firstName} ${settings.lastName}`.trim());
    setPeriods(Object.fromEntries(rows.map((row) => [row.key, defaultPeriodFromWindow(row.windows[0])])));
  }, [open, rows, settings.firstName, settings.lastName]);

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
        })),
        change,
        links,
      }),
    [change, contactName, links, maintenanceType, periods, rows, settings],
  );
  const clustersWithoutContacts = rows.filter((row) => row.contacts.length === 0);

  const copyTemplate = async () => {
    const text = [`Betreff: ${template.subject}`, `To: ${template.to.join("; ") || "—"}`, "", template.body].join("\n");
    await navigator.clipboard.writeText(text);
    toast.success("Mailvorlage in die Zwischenablage kopiert.");
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[95vw] max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Wartungsankündigung erstellen</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {clustersWithoutContacts.length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>Verantwortliche fehlen</AlertTitle>
              <AlertDescription>
                Ohne Verantwortliche wird keine To-Adresse erzeugt: {clustersWithoutContacts.map((row) => row.name).join(", ")}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Wartungstyp</Label>
              <SelectBox ariaLabel="Wartungstyp" value={maintenanceType} onChange={(value) => setMaintenanceType(value as MaintenanceType)}>
                {maintenanceTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </SelectBox>
            </div>
            <div className="space-y-2">
              <Label>Ansprechpartner</Label>
              <Input value={contactName} onChange={(event) => setContactName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Change Typ</Label>
              <SelectBox ariaLabel="Change Typ" value={change.type} onChange={(value) => setChange((current) => ({ ...current, type: value as ChangeType }))}>
                {changeTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </SelectBox>
            </div>
            <div className="space-y-2">
              <Label>Change ID</Label>
              <Input value={change.id} onChange={(event) => setChange((current) => ({ ...current, id: event.target.value }))} placeholder="CRX00000234252" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Change Titel</Label>
              <Input value={change.title} onChange={(event) => setChange((current) => ({ ...current, title: event.target.value }))} placeholder="UCS Firmware Upgrade" />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Konkrete Wartungszeiträume</Label>
            <div className="space-y-2">
              {rows.map((row) => (
                <div key={row.key} className="grid gap-2 rounded-md border border-border/60 p-3 md:grid-cols-[1fr_190px_190px]">
                  <div>
                    <p className="font-mono-data text-sm font-semibold">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.type} · {row.windows[0] ? formatMaintenanceWindow(row.windows[0]) : "kein wiederkehrendes Fenster"}</p>
                  </div>
                  <Input
                    type="datetime-local"
                    value={periods[row.key]?.from ?? ""}
                    onChange={(event) => setPeriods((current) => ({ ...current, [row.key]: { ...(current[row.key] ?? { to: "" }), from: event.target.value } }))}
                  />
                  <Input
                    type="datetime-local"
                    value={periods[row.key]?.to ?? ""}
                    onChange={(event) => setPeriods((current) => ({ ...current, [row.key]: { ...(current[row.key] ?? { from: "" }), to: event.target.value } }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Optionale Links</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setLinks((current) => [...current, { id: makeId("link"), label: "", url: "" }])}>
                <Plus className="mr-2 h-4 w-4" />
                Link
              </Button>
            </div>
            {links.map((link) => (
              <div key={link.id} className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
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

          <div className="space-y-2">
            <div className="rounded-md border border-border/60 bg-muted/30 p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Betreff</p>
              <p className="mt-1 text-sm font-semibold">{template.subject}</p>
              <p className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">To</p>
              <p className="mt-1 font-mono-data text-sm">{template.to.join("; ") || "—"}</p>
            </div>
            <Textarea value={template.body} readOnly className="min-h-[320px] font-mono text-sm" />
            <div className="flex justify-end">
              <Button onClick={() => void copyTemplate()}>
                <Copy className="mr-2 h-4 w-4" />
                In Zwischenablage kopieren
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Wartungsankuendigung() {
  const { snapshots, filters } = useActiveSnapshotIds();
  const { vms } = useVms();
  const { data: clusters = [] } = useClusters();
  const { data: hosts = [] } = useHosts();
  const { data: rawVHostRows = [] } = useRawSheet("vHost");
  const vcenterIds = useMemo(() => [...new Set(clusters.map((cluster) => cluster.vcenterId))], [clusters]);
  const { assignments, saveAssignment, isSaving } = useMaintenanceAssignments(vcenterIds);
  const { settings } = useMaintenanceSettings();
  const { data: techInfoLatest = [] } = useTechInfoLatestByVmNames(vms.map((vm) => vm.vmName));
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
      joinContacts(row.contacts),
      row.windows.map(formatMaintenanceWindow).join(" "),
    ].some((value) => value.toLowerCase().includes(q)));
  }, [filters.search, rows]);

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedKeys.has(row.key)),
    [rows, selectedKeys],
  );
  const activeRow = rows.find((row) => row.key === activeKey) ?? null;
  const clustersWithoutContacts = selectedRows.filter((row) => row.contacts.length === 0).length;

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
      cell: ({ getValue }) => <span className="tabular-nums">{formatNum(getValue() as number)}</span>,
    },
    {
      accessorKey: "totalVms",
      header: "VMs",
      cell: ({ getValue }) => <span className="tabular-nums">{formatNum(getValue() as number)}</span>,
    },
    {
      accessorKey: "type",
      header: "Typ",
      cell: ({ getValue }) => {
        const value = getValue() as MaintenanceClusterType;
        return <Badge variant={value === "Spezial" ? "destructive" : "secondary"}>{value}</Badge>;
      },
    },
    {
      accessorKey: "windows",
      header: "Wartungsfenster",
      cell: ({ row }) => {
        const value = row.original.windows.length ? row.original.windows.map(formatMaintenanceWindow).join(", ") : "—";
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
      cell: ({ row }) => {
        const value = joinContacts(row.original.contacts);
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
      updatedAt: new Date().toISOString(),
    })));
    toast.success(targetRows.length === 1 ? "Cluster-Zuweisung gespeichert." : "Cluster-Zuweisungen gespeichert.");
  };

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Wartungsankündigung</h1>
          <p className="text-sm text-muted-foreground">
            Cluster-Zuweisungen pflegen und kopierbare Wartungs-Mails erzeugen.
          </p>
        </div>
        <Button disabled={selectedRows.length === 0} onClick={() => setMailDialogOpen(true)}>
          <Mail className="mr-2 h-4 w-4" />
          Wartungsankündigung
        </Button>
      </div>

      <FilterBar />

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard title="Cluster" value={formatNum(rows.length)} icon={<CalendarClock className="h-4 w-4" />} />
        <KpiCard title="Selektiert" value={formatNum(selectedRows.length)} />
        <KpiCard title="Spezial" value={formatNum(rows.filter((row) => row.type === "Spezial").length)} severity="warn" />
        <KpiCard title="Ohne Verantwortliche" value={formatNum(rows.filter((row) => row.contacts.length === 0).length)} severity={rows.some((row) => row.contacts.length === 0) ? "warn" : "ok"} />
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
          <AlertTitle>Auswahl enthält Cluster ohne Verantwortliche</AlertTitle>
          <AlertDescription>
            Prüfen Sie die Zuweisungen vor dem Erstellen der Mailvorlage.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,860px)_minmax(420px,1fr)]">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
            Cluster im aktiven Snapshot-Scope ({searchedRows.length})
          </h3>
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

      <div className="rounded-md border border-border/60 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        Ansprechpartner-Mails werden als {deriveContactEmail({ firstName: "vorname", lastName: "nachname" }, settings.companyName || "firmenname")} abgeleitet.
      </div>

      <MaintenanceMailDialog open={mailDialogOpen} onClose={() => setMailDialogOpen(false)} rows={selectedRows} />
    </div>
  );
}
