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
import { ClipboardCopy, ClipboardPaste, Filter, GitBranchPlus, Plus, Trash2 } from "lucide-react";

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
  const { fields, summary } = useGlobalVmFilterEngine(open || hasGlobalFilterDefinition(filters.globalFilter));

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
              <p className="text-sm font-medium">Aktiver Ausdruck</p>
              <p className="text-xs text-muted-foreground">
                {draftRuleCount > 0 ? `${draftRuleCount} Bedingung${draftRuleCount === 1 ? "" : "en"} im Entwurf` : "Noch keine Bedingungen definiert"}
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
              {activeRuleCount > 0 && <Badge variant="secondary">Aktiv: {activeRuleCount}</Badge>}
              {draftRuleCount > 0 && <Badge variant="outline">Entwurf: {draftRuleCount}</Badge>}
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
  const [pendingRootSource, setPendingRootSource] = useState<Exclude<GlobalFilterSourceScope, "root">>("vm");

  const sourceFields = useMemo(
    () => fields.filter((field) => field.source === group.sourceScope),
    [fields, group.sourceScope],
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
    onChange({
      ...group,
      children: [...group.children, createGlobalFilterGroup(sourceScope)],
    });
  };

  const insertBelow = (
    logicalOperator: GlobalFilterLogicalOperator,
    nodeKind: "rule" | "group",
  ) => {
    const node = nodeKind === "rule"
      ? createGlobalFilterRule(sourceFields[0]?.key ?? "", sourceFields[0]?.dataType ?? "text")
      : createGlobalFilterGroup(group.sourceScope);

    if (group.children.length <= 1) {
      onChange({
        ...group,
        operator: logicalOperator,
        children: [...group.children, node],
      });
      return;
    }

    if (logicalOperator === group.operator) {
      onChange({
        ...group,
        children: [...group.children, node],
      });
      return;
    }

    const wrappedGroup: GlobalFilterGroup = {
      id: crypto.randomUUID(),
      type: "group",
      operator: logicalOperator,
      sourceScope: group.sourceScope,
      children: [...group.children, node],
    };

    onChange(wrappedGroup);
  };

  return (
    <div className={cn("space-y-4 rounded-xl border border-border/50 bg-card/40 p-4", isRoot && "bg-card/60")}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isRoot ? "default" : "secondary"}>{SOURCE_LABELS[group.sourceScope]}</Badge>
        <Select
          value={group.operator}
          onValueChange={(value) => onChange({ ...group, operator: value as GlobalFilterLogicalOperator })}
        >
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="and">UND</SelectItem>
            <SelectItem value="or">ODER</SelectItem>
          </SelectContent>
        </Select>

        {!isRoot && onRemove && (
          <Button variant="ghost" size="icon" onClick={onRemove} className="ml-auto h-8 w-8 text-muted-foreground hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isRoot ? (
          <>
            <Select
              value={pendingRootSource}
              onValueChange={(value) => setPendingRootSource(value as Exclude<GlobalFilterSourceScope, "root">)}
            >
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROOT_GROUP_SOURCE_OPTIONS.map((source) => (
                  <SelectItem key={source} value={source}>{SOURCE_LABELS[source]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => addSubGroup(pendingRootSource)} className="h-8">
              <GitBranchPlus className="h-3.5 w-3.5" />
              Quelle hinzufügen
            </Button>
          </>
        ) : (
          group.children.length === 0 ? (
            <>
              <Button variant="outline" size="sm" onClick={addRule} className="h-8" disabled={sourceFields.length === 0}>
                <Plus className="h-3.5 w-3.5" />
                Erste Regel
              </Button>
              <Button variant="outline" size="sm" onClick={() => addSubGroup(group.sourceScope)} className="h-8">
                <GitBranchPlus className="h-3.5 w-3.5" />
                Erste Untergruppe
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Regeln werden unter der jeweiligen Zeile mit <span className="font-medium text-foreground">UND</span> oder <span className="font-medium text-foreground">ODER</span> ergänzt.
            </p>
          )
        )}
      </div>

      {group.children.length === 0 && (
        <div className="rounded-lg border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
          {isRoot
            ? "Fügen Sie eine Quelle hinzu, z. B. System, Tech-Info, Disk oder Partition."
            : sourceFields.length === 0
              ? "Für diese Quelle sind in den aktiven Snapshots derzeit keine Felder verfügbar."
              : "Fügen Sie Regeln oder eine Untergruppe hinzu."}
        </div>
      )}

      <div className={cn("space-y-3", !isRoot && "border-l border-border/50 pl-5")}>
        {group.children.map((child, index) => (
          <div key={child.id} className="space-y-3">
            {index > 0 && (
              <GroupConnector operator={group.operator} />
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

      {!isRoot && group.children.length > 0 && (
        <InsertBelowControls
          canAddRule={sourceFields.length > 0}
          onAddRule={(operator) => insertBelow(operator, "rule")}
          onAddGroup={(operator) => insertBelow(operator, "group")}
        />
      )}
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

function GroupConnector({ operator }: { operator: GlobalFilterLogicalOperator }) {
  return (
    <div className="flex items-center gap-3 pl-2">
      <div className="h-px flex-1 bg-border/50" />
      <Badge variant="outline" className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide">
        {operator === "and" ? "UND" : "ODER"}
      </Badge>
      <div className="h-px flex-1 bg-border/50" />
    </div>
  );
}

function InsertBelowControls({
  canAddRule,
  onAddRule,
  onAddGroup,
}: {
  canAddRule: boolean;
  onAddRule: (operator: GlobalFilterLogicalOperator) => void;
  onAddGroup: (operator: GlobalFilterLogicalOperator) => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border/50 bg-muted/10 px-3 py-3">
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => onAddRule("and")} className="h-8" disabled={!canAddRule}>
          <Plus className="h-3.5 w-3.5" />
          UND Regel
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onAddRule("or")} className="h-8" disabled={!canAddRule}>
          <Plus className="h-3.5 w-3.5" />
          ODER Regel
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onAddGroup("and")} className="h-8">
          <GitBranchPlus className="h-3.5 w-3.5" />
          UND Gruppe
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onAddGroup("or")} className="h-8">
          <GitBranchPlus className="h-3.5 w-3.5" />
          ODER Gruppe
        </Button>
      </div>
    </div>
  );
}
