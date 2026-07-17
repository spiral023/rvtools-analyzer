import { useEffect, useMemo, useRef, useState } from "react";
import type {
  MaintenanceCalendarRule,
  MaintenanceWeekday,
  MaintenanceWindowDefinition,
  MonthlyOccurrence,
} from "@/domain/models/types";
import {
  DAY_LABELS,
  applyTimeRange,
  normalizeMaintenanceAbbreviation,
  slotsToExternalMask,
  summarizeWeeklySlots,
} from "@/lib/maintenanceWindows";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MaintenanceWeekGrid } from "./MaintenanceWeekGrid";

type WeeklySlots = MaintenanceWindowDefinition["weeklySlots"];
type PaintMode = "allow" | "block";

const HANDLING_OPTIONS = [
  ["regular", "Regulär"],
  ["always", "Immer verfügbar"],
  ["approval-required", "Freigabe erforderlich"],
  ["external", "Extern verwaltet"],
] as const;

const OCCURRENCE_OPTIONS: Array<{ value: MonthlyOccurrence; label: string; summary: string }> = [
  { value: 1, label: "Erster", summary: "erster" },
  { value: 2, label: "Zweiter", summary: "zweiter" },
  { value: 3, label: "Dritter", summary: "dritter" },
  { value: 4, label: "Vierter", summary: "vierter" },
  { value: 5, label: "Fünfter", summary: "fünfter" },
  { value: "last", label: "Letzter", summary: "letzter" },
];

function cloneDefinition(value: MaintenanceWindowDefinition): MaintenanceWindowDefinition {
  return {
    ...value,
    weeklySlots: value.weeklySlots.map((day) => [...day]) as WeeklySlots,
    calendarRules: value.calendarRules.map((rule) => ({ ...rule, occurrences: [...rule.occurrences] })),
  };
}

function areDefinitionsEqual(left: MaintenanceWindowDefinition, right: MaintenanceWindowDefinition): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isTimeValue(value: string): boolean {
  return /^([01]\d|2[0-3]):(00|30)$/.test(value);
}

function allSlots(allowed: boolean): WeeklySlots {
  return Array.from({ length: 7 }, () => Array<boolean>(48).fill(allowed)) as WeeklySlots;
}

function hasBlockedSlots(weeklySlots: WeeklySlots): boolean {
  return weeklySlots.some((day) => day.some((allowed) => !allowed));
}

function orderedOccurrences(occurrences: readonly MonthlyOccurrence[]): MonthlyOccurrence[] {
  return [...new Set(occurrences)].sort((left, right) => {
    if (left === "last") return 1;
    if (right === "last") return -1;
    return left - right;
  });
}

function ruleSummary(rule: MaintenanceCalendarRule): string {
  const occurrences = orderedOccurrences(rule.occurrences)
    .map((occurrence) => OCCURRENCE_OPTIONS.find((option) => option.value === occurrence)?.summary)
    .filter((value): value is string => Boolean(value));
  return `${DAY_LABELS[rule.weekday]}: ${occurrences.join(", ")}`;
}

function sameRule(left: MaintenanceCalendarRule, right: MaintenanceCalendarRule): boolean {
  return left.weekday === right.weekday
    && JSON.stringify(orderedOccurrences(left.occurrences)) === JSON.stringify(orderedOccurrences(right.occurrences));
}

export interface MaintenanceWindowEditorProps {
  value: MaintenanceWindowDefinition;
  existingAbbreviations?: string[];
  isSaving?: boolean;
  onSave: (value: MaintenanceWindowDefinition) => void | Promise<void>;
  onDelete: (value: MaintenanceWindowDefinition) => void;
  onDuplicate: (value: MaintenanceWindowDefinition) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function MaintenanceWindowEditor({
  value,
  existingAbbreviations = [],
  isSaving = false,
  onSave,
  onDelete,
  onDuplicate,
  onDirtyChange,
}: MaintenanceWindowEditorProps) {
  const [draft, setDraft] = useState(() => cloneDefinition(value));
  const [selectedDays, setSelectedDays] = useState<MaintenanceWeekday[]>([]);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("13:00");
  const [timeRuleError, setTimeRuleError] = useState<string | null>(null);
  const [paintMode, setPaintMode] = useState<PaintMode>("allow");
  const [calendarWeekday, setCalendarWeekday] = useState<MaintenanceWeekday>(0);
  const [calendarOccurrences, setCalendarOccurrences] = useState<MonthlyOccurrence[]>([]);
  const baselineRef = useRef(cloneDefinition(value));
  const dirtyRef = useRef(false);
  const onDirtyChangeRef = useRef(onDirtyChange);
  const valueIdentity = `${value.id}\u0000${value.updatedAt}`;
  const previousIdentityRef = useRef(valueIdentity);

  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);

  useEffect(() => () => {
    if (dirtyRef.current) {
      dirtyRef.current = false;
      onDirtyChangeRef.current?.(false);
    }
  }, []);

  useEffect(() => {
    if (previousIdentityRef.current === valueIdentity) return;
    previousIdentityRef.current = valueIdentity;
    const next = cloneDefinition(value);
    baselineRef.current = next;
    setDraft(next);
    setSelectedDays([]);
    setTimeRuleError(null);
    if (dirtyRef.current) {
      dirtyRef.current = false;
      onDirtyChangeRef.current?.(false);
    }
  }, [value, valueIdentity]);

  const abbreviationError = useMemo(() => {
    const normalized = normalizeMaintenanceAbbreviation(draft.abbreviation);
    if (!normalized) return "Bitte geben Sie eine Abkürzung ein.";
    const ownOriginal = normalizeMaintenanceAbbreviation(value.abbreviation);
    const duplicate = existingAbbreviations.some((abbreviation) => {
      const existing = normalizeMaintenanceAbbreviation(abbreviation);
      return existing === normalized && existing !== ownOriginal;
    });
    return duplicate ? "Diese Abkürzung ist bereits vergeben." : null;
  }, [draft.abbreviation, existingAbbreviations, value.abbreviation]);

  const dirty = !areDefinitionsEqual(draft, baselineRef.current);
  const timeToolsDisabled = draft.handling === "approval-required" || draft.handling === "external";
  const canSave = dirty && !abbreviationError && !isSaving;

  useEffect(() => {
    if (dirtyRef.current === dirty) return;
    dirtyRef.current = dirty;
    onDirtyChangeRef.current?.(dirty);
  }, [dirty]);

  const updateDraft = (update: (current: MaintenanceWindowDefinition) => MaintenanceWindowDefinition) => {
    setDraft((current) => update(current));
  };

  const updateDraftSlots = (weeklySlots: WeeklySlots) => {
    updateDraft((current) => ({
      ...current,
      handling: current.handling === "always" && hasBlockedSlots(weeklySlots) ? "regular" : current.handling,
      weeklySlots,
    }));
  };

  const toggleDay = (weekday: MaintenanceWeekday) => {
    setSelectedDays((current) => current.includes(weekday)
      ? current.filter((entry) => entry !== weekday)
      : [...current, weekday].sort((left, right) => left - right) as MaintenanceWeekday[]);
  };

  const applyRule = () => {
    if (selectedDays.length === 0) {
      setTimeRuleError("Wählen Sie mindestens einen Wochentag aus.");
      return;
    }
    if (!isTimeValue(startTime) || !isTimeValue(endTime)) {
      setTimeRuleError("Geben Sie gültige Zeiten im 30-Minuten-Raster ein.");
      return;
    }
    try {
      const weeklySlots = applyTimeRange(draft.weeklySlots, selectedDays, startTime, endTime, paintMode === "allow");
      updateDraftSlots(weeklySlots);
      setTimeRuleError(null);
    } catch (error) {
      setTimeRuleError(error instanceof Error ? error.message : "Die Zeitregel konnte nicht angewendet werden.");
    }
  };

  const addCalendarRule = () => {
    const occurrences = orderedOccurrences(calendarOccurrences);
    if (occurrences.length === 0) return;
    const rule: MaintenanceCalendarRule = { weekday: calendarWeekday, occurrences };
    updateDraft((current) => (
      current.calendarRules.some((candidate) => sameRule(candidate, rule))
        ? current
        : { ...current, calendarRules: [...current.calendarRules, rule] }
    ));
  };

  const save = async () => {
    if (!canSave) return;
    const normalizedAbbreviation = normalizeMaintenanceAbbreviation(draft.abbreviation);
    const result = cloneDefinition({
      ...draft,
      abbreviation: draft.abbreviation.trim(),
      normalizedAbbreviation,
      updatedAt: new Date().toISOString(),
    });
    await onSave(result);
  };

  return (
    <div className="space-y-5">
      <Card className="border-border/80 shadow-none">
        <CardHeader className="border-b bg-muted/20 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Fensterdefinition</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Identität und betriebliche Behandlung des Wartungsfensters.</p>
            </div>
            {dirty && <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-300">Ungespeicherte Änderungen</Badge>}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 p-5 md:grid-cols-[minmax(12rem,0.55fr)_minmax(0,1fr)_minmax(12rem,0.55fr)]">
          <div className="space-y-2">
            <Label htmlFor="maintenance-window-abbreviation">Abkürzung</Label>
            <Input
              aria-describedby={abbreviationError ? "maintenance-window-abbreviation-error" : undefined}
              aria-invalid={Boolean(abbreviationError)}
              id="maintenance-window-abbreviation"
              onChange={(event) => updateDraft((current) => ({ ...current, abbreviation: event.target.value }))}
              value={draft.abbreviation}
            />
            {abbreviationError && <p className="text-sm text-destructive" id="maintenance-window-abbreviation-error">{abbreviationError}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="maintenance-window-description">Beschreibung</Label>
            <Input
              id="maintenance-window-description"
              onChange={(event) => updateDraft((current) => ({ ...current, description: event.target.value }))}
              value={draft.description}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maintenance-window-handling">Behandlung</Label>
            <Select
              onValueChange={(handling) => updateDraft((current) => {
                const nextHandling = handling as MaintenanceWindowDefinition["handling"];
                return nextHandling === "always"
                  ? { ...current, handling: nextHandling, weeklySlots: allSlots(true) }
                  : { ...current, handling: nextHandling };
              })}
              value={draft.handling}
            >
              <SelectTrigger id="maintenance-window-handling" aria-label="Behandlung"><SelectValue /></SelectTrigger>
              <SelectContent>
                {HANDLING_OPTIONS.map(([handling, label]) => <SelectItem key={handling} value={handling}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-5 xl:grid-cols-[minmax(19rem,0.7fr)_minmax(0,1.3fr)]">
        <div className="space-y-5">
          <Card className="border-border/80 shadow-none">
            <CardHeader className="px-5 py-4"><CardTitle className="text-base">Schnellaktionen</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2 px-5 pb-5">
              <Button type="button" variant="secondary" disabled={timeToolsDisabled} onClick={() => updateDraft((current) => ({ ...current, handling: "always", weeklySlots: allSlots(true) }))}>jederzeit</Button>
              <Button type="button" variant="secondary" disabled={timeToolsDisabled} onClick={() => updateDraftSlots(allSlots(false))}>alles sperren</Button>
              <Button type="button" variant="outline" disabled={timeToolsDisabled} onClick={() => setSelectedDays([0, 1, 2, 3, 4])}>Werktage auswählen</Button>
              <Button type="button" variant="outline" disabled={timeToolsDisabled} onClick={() => setSelectedDays([5, 6])}>Wochenende auswählen</Button>
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-none">
            <CardHeader className="px-5 py-4"><CardTitle className="text-base">Zeitregel</CardTitle></CardHeader>
            <CardContent className="space-y-4 px-5 pb-5">
              <fieldset disabled={timeToolsDisabled}>
                <legend className="mb-2 text-sm font-medium">Wochentage</legend>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
                  {DAY_LABELS.map((day, index) => {
                    const id = `maintenance-day-${index}`;
                    return <div className="flex items-center gap-2" key={day}>
                      <Checkbox checked={selectedDays.includes(index as MaintenanceWeekday)} id={id} onCheckedChange={() => toggleDay(index as MaintenanceWeekday)} />
                      <Label className="font-normal" htmlFor={id}>{day}</Label>
                    </div>;
                  })}
                </div>
              </fieldset>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label htmlFor="maintenance-start-time">Startzeit</Label><Input disabled={timeToolsDisabled} id="maintenance-start-time" onChange={(event) => setStartTime(event.target.value)} step={1800} type="time" value={startTime} /></div>
                <div className="space-y-2"><Label htmlFor="maintenance-end-time">Endzeit</Label><Input disabled={timeToolsDisabled} id="maintenance-end-time" onChange={(event) => setEndTime(event.target.value)} step={1800} type="time" value={endTime} /></div>
              </div>
              {timeRuleError && <Alert variant="destructive"><AlertDescription>{timeRuleError}</AlertDescription></Alert>}
              <Button disabled={timeToolsDisabled} onClick={applyRule} type="button">Zeitregel anwenden</Button>
              {timeToolsDisabled && <p className="text-sm text-muted-foreground">Zeitplan und Regeln werden für diese Behandlung nur angezeigt.</p>}
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-none">
            <CardHeader className="px-5 py-4"><CardTitle className="text-base">Monatliche Ausnahmen</CardTitle></CardHeader>
            <CardContent className="space-y-4 px-5 pb-5">
              <div className="space-y-2">
                <Label htmlFor="maintenance-month-weekday">Wochentag im Monat</Label>
                <Select onValueChange={(weekday) => setCalendarWeekday(Number(weekday) as MaintenanceWeekday)} value={String(calendarWeekday)}>
                  <SelectTrigger id="maintenance-month-weekday" aria-label="Wochentag im Monat"><SelectValue /></SelectTrigger>
                  <SelectContent>{DAY_LABELS.map((day, index) => <SelectItem key={day} value={String(index)}>{day}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Vorkommen</legend>
                <div className="grid grid-cols-2 gap-2">
                  {OCCURRENCE_OPTIONS.map(({ value: occurrence, label }) => {
                    const id = `maintenance-occurrence-${occurrence}`;
                    return <div className="flex items-center gap-2" key={String(occurrence)}>
                      <Checkbox checked={calendarOccurrences.includes(occurrence)} id={id} onCheckedChange={() => setCalendarOccurrences((current) => current.includes(occurrence) ? current.filter((entry) => entry !== occurrence) : [...current, occurrence])} />
                      <Label className="font-normal" htmlFor={id}>{label}</Label>
                    </div>;
                  })}
                </div>
              </fieldset>
              <Button disabled={calendarOccurrences.length === 0} onClick={addCalendarRule} type="button">Monatsregel hinzufügen</Button>
              {draft.calendarRules.length > 0 && <ul className="space-y-2 border-t pt-3" aria-label="Monatsregeln">
                {draft.calendarRules.map((rule, index) => {
                  const summary = ruleSummary(rule);
                  return <li className="flex items-center justify-between gap-3 text-sm" key={`${rule.weekday}-${rule.occurrences.join("-")}`}>
                    <span>{summary}</span>
                    <Button aria-label={`Monatsregel ${summary} entfernen`} onClick={() => updateDraft((current) => ({ ...current, calendarRules: current.calendarRules.filter((_, ruleIndex) => ruleIndex !== index) }))} size="sm" type="button" variant="ghost">Entfernen</Button>
                  </li>;
                })}
              </ul>}
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/80 shadow-none">
          <CardHeader className="border-b bg-muted/20 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><CardTitle className="text-base">Wöchentlicher Zeitplan</CardTitle><p className="mt-1 text-sm text-muted-foreground">{summarizeWeeklySlots(draft.weeklySlots)}</p></div>
              <div className="flex gap-2" aria-label="Malmodus">
                <Button aria-pressed={paintMode === "allow"} onClick={() => setPaintMode("allow")} size="sm" type="button" variant={paintMode === "allow" ? "default" : "outline"}>Erlaubt einzeichnen</Button>
                <Button aria-pressed={paintMode === "block"} onClick={() => setPaintMode("block")} size="sm" type="button" variant={paintMode === "block" ? "default" : "outline"}>Sperren</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <MaintenanceWeekGrid disabled={timeToolsDisabled} onChange={updateDraftSlots} paintMode={paintMode} value={draft.weeklySlots} />
            <details className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground">Rohmasken anzeigen</summary>
              <div className="mt-3 space-y-1 font-mono">
                {DAY_LABELS.map((day, index) => <div key={day}>{day}: {slotsToExternalMask(draft.weeklySlots[index])}</div>)}
              </div>
            </details>
          </CardContent>
        </Card>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-5">
        <Button onClick={() => onDuplicate(cloneDefinition(draft))} type="button" variant="outline">Duplizieren</Button>
        <Button onClick={() => onDelete(cloneDefinition(draft))} type="button" variant="destructive">Löschen</Button>
        <Button aria-busy={isSaving} disabled={!canSave} onClick={() => { void save(); }} type="button">Speichern</Button>
      </div>
    </div>
  );
}
