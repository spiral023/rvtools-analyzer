import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFilterState } from "@/hooks/useFilterState";
import { useGlobalVmFilterEngine } from "@/hooks/useGlobalVmFilter";
import {
  countGlobalFilterRules,
  createGlobalFilterGroup,
  createGlobalFilterRule,
  hasGlobalFilterDefinition,
  parseSerializedGlobalFilter,
  ROOT_GROUP_SOURCE_OPTIONS,
  serializeGlobalFilter,
  SOURCE_LABELS,
} from "@/lib/globalFilter";
import type {
  GlobalFilterDataType,
  GlobalFilterField,
  GlobalFilterGroup,
  GlobalFilterLogicalOperator,
  GlobalFilterNode,
  GlobalFilterOperator,
  GlobalFilterRule,
  GlobalFilterSourceScope,
} from "@/domain/models/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClipboardCopy, ClipboardPaste, Filter, Plus, Trash2 } from "lucide-react";

const RVTOOLS_SOURCES: Exclude<GlobalFilterSourceScope, "root">[] = [
  "vm", "vInfo", "vCPU", "vMemory", "vDisk", "vPartition", "vNetwork", "vSnapshot", "vTools", "vCD", "vUSB",
];
const TECHINFO_SOURCES: Exclude<GlobalFilterSourceScope, "root">[] = ["techInfo"];

const TEXT_OPERATORS: { value: GlobalFilterOperator; label: string }[] = [
  { value: "eq", label: "ist" },
  { value: "neq", label: "ist nicht" },
  { value: "contains", label: "enthält" },
  { value: "not_contains", label: "enthält nicht" },
  { value: "starts_with", label: "beginnt mit" },
  { value: "ends_with", label: "endet mit" },
  { value: "wildcard", label: "Wildcard" },
  { value: "empty", label: "leer" },
  { value: "not_empty", label: "nicht leer" },
];

const NUMBER_OPERATORS: { value: GlobalFilterOperator; label: string }[] = [
  { value: "lt", label: "<" },
  { value: "lte", label: "<=" },
  { value: "gt", label: ">" },
  { value: "gte", label: ">=" },
  { value: "between", label: "zwischen" },
  { value: "eq", label: "=" },
  { value: "neq", label: "≠" },
  { value: "empty", label: "leer" },
  { value: "not_empty", label: "nicht leer" },
];

const BOOLEAN_OPERATORS: { value: GlobalFilterOperator; label: string }[] = [
  { value: "is_true", label: "Ja" },
  { value: "is_false", label: "Nein" },
];

export function GlobalFilterControl() {
  const { filters, setFilters } = useFilterState();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<GlobalFilterGroup>(filters.globalFilter ?? createGlobalFilterGroup("root"));
  const { fields, summary, previewMatchingCount, totalVmCount } = useGlobalVmFilterEngine(
    open || hasGlobalFilterDefinition(filters.globalFilter),
    open ? draft : undefined,
  );

  const activeRuleCount = countGlobalFilterRules(filters.globalFilter);
  const draftRuleCount = countGlobalFilterRules(draft);

  useEffect(() => {
    if (!open) return;
    setDraft(filters.globalFilter ?? createGlobalFilterGroup("root"));
  }, [filters.globalFilter, open]);

  const apply = () => {
    setFilters({
      globalFilter: hasGlobalFilterDefinition(draft) ? draft : null,
    });
    setOpen(false);
  };

  const resetDraft = () => {
    setDraft(createGlobalFilterGroup("root"));
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(serializeGlobalFilter(draft));
      toast.success("Filter in die Zwischenablage kopiert.");
    } catch {
      toast.error("Der Filter konnte nicht in die Zwischenablage kopiert werden.");
    }
  };

  const importFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const importedFilter = parseSerializedGlobalFilter(text);
      setDraft(importedFilter);
      toast.success("Filter aus der Zwischenablage geladen.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Der Filter konnte nicht importiert werden.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            className={cn(
              "relative h-8 w-8 text-muted-foreground hover:text-foreground",
              activeRuleCount > 0 && "text-primary hover:text-primary",
            )}
            aria-label="Globalen Filter öffnen"
          >
            <Filter className="h-4 w-4" />
            {activeRuleCount > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {activeRuleCount}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {activeRuleCount > 0 ? summary : "Globaler Systemfilter"}
        </TooltipContent>
      </Tooltip>

      <DialogContent className="flex h-[90vh] w-[min(96vw,1200px)] max-w-none flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle>Globaler Systemfilter</DialogTitle>
          <DialogDescription>
            Filtern Sie Systeme über mehrere Quellen mit AND/OR-Gruppen. Gruppen auf Disk/Partition/Tools gelten immer auf derselben Zeile.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-5">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
            <div>
              <p className="text-sm font-medium">
                {draftRuleCount > 0
                  ? `${draftRuleCount} Bedingung${draftRuleCount === 1 ? "" : "en"}`
                  : "Keine Bedingungen"}
              </p>
              <p className="text-xs text-muted-foreground">
                {previewMatchingCount !== null && totalVmCount > 0
                  ? `${previewMatchingCount} von ${totalVmCount} Systemen entsprechen dem Filter`
                  : activeRuleCount > 0
                    ? `Aktiv: ${activeRuleCount} Bedingung${activeRuleCount === 1 ? "" : "en"}`
                    : "Noch keine Bedingungen definiert"}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => void importFromClipboard()} className="h-8">
                <ClipboardPaste className="h-3.5 w-3.5" />
                Einfügen
              </Button>
              <Button variant="outline" size="sm" onClick={() => void copyToClipboard()} className="h-8">
                <ClipboardCopy className="h-3.5 w-3.5" />
                Kopieren
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-2">
            <FilterGroupEditor
              group={draft}
              fields={fields}
              isRoot
              onChange={setDraft}
            />
          </div>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button variant="outline" onClick={resetDraft}>Zurücksetzen</Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>Abbrechen</Button>
          <Button onClick={apply}>Anwenden</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilterGroupEditor({
  group,
  fields,
  onChange,
  onRemove,
  isRoot = false,
}: {
  group: GlobalFilterGroup;
  fields: GlobalFilterField[];
  onChange: (group: GlobalFilterGroup) => void;
  onRemove?: () => void;
  isRoot?: boolean;
}) {
  const sourceFields = useMemo(
    () => fields.filter((field) => field.source === group.sourceScope),
    [fields, group.sourceScope],
  );

  const addedSourceScopes = useMemo(
    () => new Set(group.children.filter((c) => c.type === "group").map((c) => (c as GlobalFilterGroup).sourceScope)),
    [group.children],
  );

  const availableSources = useMemo(
    () => ROOT_GROUP_SOURCE_OPTIONS.filter((source) => !addedSourceScopes.has(source)),
    [addedSourceScopes],
  );

  const updateChild = (childId: string, nextChild: GlobalFilterNode) => {
    onChange({
      ...group,
      children: group.children.map((child) => (child.id === childId ? nextChild : child)),
    });
  };

  const removeChild = (childId: string) => {
    onChange({
      ...group,
      children: group.children.filter((child) => child.id !== childId),
    });
  };

  const addRule = () => {
    const field = sourceFields[0];
    const rule = createGlobalFilterRule(field?.key ?? "", field?.dataType ?? "text");
    onChange({ ...group, children: [...group.children, rule] });
  };

  const addSubGroup = (sourceScope: GlobalFilterSourceScope) => {
    const newGroup = createGlobalFilterGroup(sourceScope);
    const scopeFields = fields.filter((f) => f.source === sourceScope);
    const firstRule = scopeFields.length > 0
      ? createGlobalFilterRule(scopeFields[0].key, scopeFields[0].dataType)
      : null;
    const groupWithFirstRule = firstRule
      ? { ...newGroup, children: [firstRule] }
      : newGroup;
    onChange({ ...group, children: [...group.children, groupWithFirstRule] });
  };

  const toggleOperator = () => {
    onChange({ ...group, operator: group.operator === "and" ? "or" : "and" });
  };

  return (
    <div className={cn("space-y-4 rounded-xl border border-border/50 bg-card/40 p-4", isRoot && "bg-card/60")}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isRoot ? "default" : "secondary"}>{SOURCE_LABELS[group.sourceScope]}</Badge>

        {group.children.length > 1 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleOperator}
                className="inline-flex h-8 items-center rounded-md border border-border/50 bg-background px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {group.operator === "and" ? "UND" : "ODER"}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Verknüpfung aller Bedingungen umschalten</TooltipContent>
          </Tooltip>
        )}

        {!isRoot && onRemove && (
          <Button variant="ghost" size="icon" onClick={onRemove} className="ml-auto h-8 w-8 text-muted-foreground hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {group.children.length === 0 && (
        <div className="rounded-lg border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
          {isRoot
            ? "Fügen Sie eine Quelle hinzu, um zu beginnen."
            : sourceFields.length === 0
              ? "Für diese Quelle sind in den aktiven Snapshots derzeit keine Felder verfügbar."
              : "Fügen Sie eine Bedingung hinzu."}
        </div>
      )}

      <div className={cn("space-y-3", !isRoot && "border-l border-border/50 pl-5")}>
        {group.children.map((child, index) => (
          <div key={child.id} className="space-y-3">
            {index > 0 && (
              <GroupConnector
                operator={group.operator}
                onToggle={group.children.length > 1 ? toggleOperator : undefined}
              />
            )}

            <div className="relative">
              <div className="absolute -left-[1.42rem] top-6 h-px w-4 bg-border/50" />
              {child.type === "rule" ? (
                <FilterRuleEditor
                  rule={child}
                  fields={sourceFields}
                  onChange={(rule) => updateChild(child.id, rule)}
                  onRemove={() => removeChild(child.id)}
                />
              ) : (
                <FilterGroupEditor
                  group={child}
                  fields={fields}
                  onChange={(nextGroup) => updateChild(child.id, nextGroup)}
                  onRemove={() => removeChild(child.id)}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isRoot ? (
          availableSources.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  <Plus className="h-3.5 w-3.5" />
                  Quelle hinzufügen
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {availableSources.some((s) => RVTOOLS_SOURCES.includes(s)) && (
                  <>
                    <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-semibold text-blue-500">
                      <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                      RVTools
                    </DropdownMenuLabel>
                    {availableSources.filter((s) => RVTOOLS_SOURCES.includes(s)).map((source) => (
                      <DropdownMenuItem key={source} onClick={() => addSubGroup(source)} className="pl-6">
                        {SOURCE_LABELS[source]}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                {availableSources.some((s) => RVTOOLS_SOURCES.includes(s)) && availableSources.some((s) => TECHINFO_SOURCES.includes(s)) && (
                  <DropdownMenuSeparator />
                )}
                {availableSources.some((s) => TECHINFO_SOURCES.includes(s)) && (
                  <>
                    <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-semibold text-amber-500">
                      <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                      Tech-Info
                    </DropdownMenuLabel>
                    {availableSources.filter((s) => TECHINFO_SOURCES.includes(s)).map((source) => (
                      <DropdownMenuItem key={source} onClick={() => addSubGroup(source)} className="pl-6">
                        {SOURCE_LABELS[source]}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        ) : (
          sourceFields.length > 0 && (
            <Button variant="ghost" size="sm" onClick={addRule} className="h-8 text-muted-foreground hover:text-foreground">
              <Plus className="h-3.5 w-3.5" />
              Bedingung hinzufügen
            </Button>
          )
        )}
      </div>
    </div>
  );
}

function FilterRuleEditor({
  rule,
  fields,
  onChange,
  onRemove,
}: {
  rule: GlobalFilterRule;
  fields: GlobalFilterField[];
  onChange: (rule: GlobalFilterRule) => void;
  onRemove: () => void;
}) {
  const selectedField = fields.find((field) => field.key === rule.field) ?? fields[0] ?? null;
  const dataType = selectedField?.dataType ?? "text";
  const operators = getOperatorsForType(dataType);
  const operator = operators.some((entry) => entry.value === rule.operator) ? rule.operator : operators[0]?.value ?? "contains";

  useEffect(() => {
    if (!selectedField) return;
    if (selectedField.key === rule.field && operator === rule.operator) return;
    onChange({
      ...rule,
      field: selectedField.key,
      operator,
      unit: selectedField.unit ? rule.unit ?? "GiB" : undefined,
    });
  }, [onChange, operator, rule, selectedField]);

  const showValueInput = !["empty", "not_empty", "is_true", "is_false"].includes(operator);
  const showSecondValueInput = operator === "between";

  return (
    <div className="rounded-lg border border-border/50 bg-background/70 p-3">
      <div className="grid gap-2 md:grid-cols-[minmax(180px,1.4fr)_120px_minmax(160px,1fr)_100px_auto]">
        <Select
          value={selectedField?.key ?? "__none"}
          onValueChange={(value) => {
            const nextField = fields.find((field) => field.key === value);
            if (!nextField) return;
            onChange({
              ...rule,
              field: nextField.key,
              operator: getOperatorsForType(nextField.dataType)[0]?.value ?? "contains",
              unit: nextField.unit ? "GiB" : undefined,
              value: "",
              valueTo: "",
            });
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Feld" />
          </SelectTrigger>
          <SelectContent>
            {fields.length === 0 ? (
              <SelectItem value="__none" disabled>Keine Felder</SelectItem>
            ) : (
              fields.map((field) => (
                <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        <Select
          value={operator}
          onValueChange={(value) => onChange({ ...rule, operator: value as GlobalFilterOperator })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {operators.map((entry) => (
              <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showValueInput ? (
          <Input
            value={rule.value ?? ""}
            onChange={(event) => onChange({ ...rule, value: event.target.value })}
            className="h-8 text-xs"
            placeholder={dataType === "number" ? "Wert" : "Suchwert"}
          />
        ) : (
          <div />
        )}

        {selectedField?.unit ? (
          <Select
            value={rule.unit ?? "GiB"}
            onValueChange={(value) => onChange({ ...rule, unit: value as "MiB" | "GiB" | "TiB" })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MiB">MiB</SelectItem>
              <SelectItem value="GiB">GiB</SelectItem>
              <SelectItem value="TiB">TiB</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <div />
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="icon" onClick={onRemove} className="h-8 w-8 text-muted-foreground hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showSecondValueInput && (
        <div className="mt-2 grid gap-2 md:grid-cols-[minmax(180px,1.4fr)_120px_minmax(160px,1fr)_100px_auto]">
          <div />
          <div className="flex h-8 items-center text-xs text-muted-foreground">bis</div>
          <Input
            value={rule.valueTo ?? ""}
            onChange={(event) => onChange({ ...rule, valueTo: event.target.value })}
            className="h-8 text-xs"
            placeholder="Obergrenze"
          />
        </div>
      )}
    </div>
  );
}

function getOperatorsForType(dataType: GlobalFilterDataType) {
  if (dataType === "number") return NUMBER_OPERATORS;
  if (dataType === "boolean") return BOOLEAN_OPERATORS;
  return TEXT_OPERATORS;
}

function GroupConnector({
  operator,
  onToggle,
}: {
  operator: GlobalFilterLogicalOperator;
  onToggle?: () => void;
}) {
  const label = operator === "and" ? "UND" : "ODER";

  return (
    <div className="flex items-center gap-3 pl-2">
      <div className="h-px flex-1 bg-border/50" />
      {onToggle ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggle}
              className="inline-flex items-center rounded border border-border/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {label}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Verknüpfung umschalten</TooltipContent>
        </Tooltip>
      ) : (
        <Badge variant="outline" className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide">
          {label}
        </Badge>
      )}
      <div className="h-px flex-1 bg-border/50" />
    </div>
  );
}
