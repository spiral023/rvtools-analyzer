import type { ReactNode } from "react";
import { Database, Info, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { DetailDossier, DetailField, DetailKpi, DetailSection as DetailSectionModel, DetailTable } from "@/lib/detailExport";
import { DetailExportDialog } from "@/components/detail/DetailExportDialog";

export function SystemDetailContent({
  icon,
  eyebrow,
  title,
  subtitle,
  badges,
  dossier,
  children,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  subtitle?: string;
  badges?: ReactNode;
  dossier: DetailDossier;
  children: ReactNode;
}) {
  return (
    <TooltipProvider>
      <DialogContent
        overlayClassName="bg-black/65 backdrop-blur-[2px]"
        showCloseButton={false}
        className="system-detail-dialog flex h-[92vh] w-[96vw] max-w-[1480px] flex-col gap-0 overflow-hidden border-0 bg-background p-0 shadow-2xl sm:rounded-2xl"
      >
        <DialogHeader className="relative shrink-0 border-b border-border/70 bg-card px-5 py-3 text-left sm:px-7">
          <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.12)]">
                {icon}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
                <DialogTitle className="truncate text-lg font-semibold tracking-tight text-balance">
                  {title}
                </DialogTitle>
                {/* Untertitel und Badges teilen eine Zeile: beide sind Kontext, keiner braucht eine eigene. */}
                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                  <DialogDescription className="truncate text-xs text-pretty">{subtitle || "Systemdetails"}</DialogDescription>
                  {badges}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <DetailExportDialog dossier={dossier} />
              <DialogClose
                aria-label="Detailansicht schließen"
                className="grid size-10 place-items-center rounded-xl bg-background text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border)/0.75),0_1px_2px_hsl(var(--foreground)/0.06)] transition-[scale,color,background-color,box-shadow] duration-150 ease-out hover:bg-muted hover:text-foreground active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <X className="size-4" />
              </DialogClose>
            </div>
          </div>
        </DialogHeader>
        <div className="system-detail-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <main className="mx-auto w-full max-w-[1380px] space-y-4 p-4 sm:px-6 sm:py-5">{children}</main>
        </div>
      </DialogContent>
    </TooltipProvider>
  );
}

export function DetailNarrative({ children, source }: { children: ReactNode; source?: string }) {
  return (
    <div className="detail-surface relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.08] via-card to-card px-4 py-3.5 shadow-[var(--detail-surface-shadow)] sm:px-5">
      <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
      <div className="w-full text-sm leading-6 text-pretty">{children}</div>
      {source && (
        <p className="mt-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
          <Database className="size-3" /> {source}
        </p>
      )}
    </div>
  );
}

export function DetailKpiGrid({ items }: { items: DetailKpi[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
      {items.map((item) => {
        const card = (
          <div className={cn(
            "detail-surface rounded-xl bg-card px-3 py-2.5 shadow-[var(--detail-surface-shadow)]",
            item.info && "cursor-help",
          )}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">{item.label}</p>
            <p className={cn(
              "mt-1 truncate font-mono text-base font-semibold tabular-nums tracking-tight",
              item.tone === "good" && "text-success",
              item.tone === "warning" && "text-warning",
              item.tone === "critical" && "text-destructive",
            )} title={item.value}>{item.value}</p>
            {item.hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={item.hint}>{item.hint}</p>}
          </div>
        );
        return item.info
          ? <InfoTooltip key={item.label} entry={item.info} example={item.infoExample} side="bottom">{card}</InfoTooltip>
          : <div key={item.label}>{card}</div>;
      })}
    </div>
  );
}

export function DetailSection({
  icon,
  title,
  description,
  aside,
  children,
  className,
  info,
  infoExample,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  info?: DetailSectionModel["info"];
  infoExample?: string;
}) {
  return (
    <section className={cn("detail-surface rounded-2xl bg-card p-4 shadow-[var(--detail-surface-shadow)] sm:p-5", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">{icon}</div>
          <div>
            {info
              ? <InfoTooltip entry={info} example={infoExample} side="bottom"><h2 className="w-fit cursor-help text-sm font-semibold tracking-tight text-balance">{title}</h2></InfoTooltip>
              : <h2 className="text-sm font-semibold tracking-tight text-balance">{title}</h2>}
            {description && <p className="mt-1 text-xs leading-5 text-muted-foreground text-pretty">{description}</p>}
          </div>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function DetailFieldGrid({ fields, columns = 3 }: { fields: DetailField[]; columns?: 2 | 3 | 4 }) {
  return (
    <dl className={cn(
      "grid gap-x-5 gap-y-0",
      columns === 2 && "md:grid-cols-2",
      columns === 3 && "md:grid-cols-2 xl:grid-cols-3",
      columns === 4 && "md:grid-cols-2 xl:grid-cols-4",
    )}>
      {fields.map((field) => (
        <div key={field.label} className="min-w-0 border-b border-border/55 py-2.5 last:border-b-0">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {field.info
              ? <InfoTooltip entry={field.info} example={field.infoExample} side="bottom"><span className="w-fit cursor-help decoration-dotted underline-offset-4">{field.label}</span></InfoTooltip>
              : field.label}
          </dt>
          <dd className={cn(
            "mt-1 break-words font-mono text-xs leading-5 tabular-nums",
            field.tone === "good" && "font-semibold text-success",
            field.tone === "warning" && "font-semibold text-warning",
            field.tone === "critical" && "font-semibold text-destructive",
          )} title={field.value}>{field.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DetailUnavailable({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-24 items-start gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-4">
      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground text-pretty">{description}</p>
      </div>
    </div>
  );
}

export function DetailCountBadge({ children }: { children: ReactNode }) {
  return <Badge variant="secondary" className="rounded-full px-2.5 font-mono text-[10px] tabular-nums">{children}</Badge>;
}

export function DetailTableView({
  table,
  onRowClick,
}: {
  table: DetailTable;
  onRowClick?: (rowIndex: number) => void;
}) {
  if (table.rows.length === 0) {
    return <DetailUnavailable title="Keine Datensätze" description="Für dieses Objekt wurden in der aktuellen Datenquelle keine passenden Einträge gefunden." />;
  }
  return (
    <div className="overflow-x-auto rounded-xl shadow-[inset_0_0_0_1px_hsl(var(--border)/0.7)]">
      <table className="w-full min-w-[680px] text-left text-xs">
        <thead className="bg-muted/55">
          <tr>
            {table.headers.map((header) => (
              <th key={header} className="whitespace-nowrap px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr
              key={`${rowIndex}-${row.join("-")}`}
              className={cn(
                "border-t border-border/55 transition-[background-color] duration-150",
                onRowClick && "cursor-pointer hover:bg-muted/35 focus-within:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              )}
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? "button" : undefined}
              onClick={onRowClick ? () => onRowClick(rowIndex) : undefined}
              onKeyDown={onRowClick ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onRowClick(rowIndex);
                }
              } : undefined}
            >
              {table.headers.map((header, columnIndex) => (
                <td key={`${header}-${columnIndex}`} className="max-w-80 px-3 py-2.5 font-mono tabular-nums first:font-semibold">
                  <span className="block truncate" title={row[columnIndex] || "—"}>{row[columnIndex] || "—"}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
