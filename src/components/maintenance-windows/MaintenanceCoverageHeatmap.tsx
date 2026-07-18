import type { CoverageSlot } from "@/lib/maintenanceWindowCoverage";
import { formatSlotTime, mondayBasedWeekday } from "@/lib/maintenanceWindowCoverage";
import { DAY_LABELS } from "@/lib/maintenanceWindows";

const SLOTS_PER_DAY = 48;

export interface MaintenanceCoverageHeatmapProps {
  slots: readonly CoverageSlot[];
  currentIndex: number | null;
}

function classNames(...values: Array<string | false | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function MaintenanceCoverageHeatmap({ slots, currentIndex }: MaintenanceCoverageHeatmapProps) {
  const dayCount = slots.length / SLOTS_PER_DAY;
  const maxCount = Math.max(1, ...slots.map((entry) => entry.count));

  return (
    <div className="maintenance-heatmap-shell">
      <div className="maintenance-heatmap__scroll">
        <div
          className="maintenance-heatmap"
          role="img"
          aria-label="Wartungsfenster-Auslastung im Monatsverlauf, Tage gegen Uhrzeit"
        >
          <div className="maintenance-heatmap__time-row" aria-hidden="true">
            <span className="maintenance-heatmap__corner" />
            {Array.from({ length: SLOTS_PER_DAY }, (_, slot) => (
              <span key={slot} className="maintenance-heatmap__time-label">
                {slot % 4 === 0 ? formatSlotTime(slot).slice(0, 2) : ""}
              </span>
            ))}
          </div>
          {Array.from({ length: dayCount }, (_, dayIndex) => {
            const dayEntries = slots.slice(dayIndex * SLOTS_PER_DAY, (dayIndex + 1) * SLOTS_PER_DAY);
            const date = dayEntries[0].date;
            return (
              <div className="maintenance-heatmap__row" key={date.toISOString()} aria-hidden="true">
                <span className="maintenance-heatmap__day-label">
                  {String(date.getDate()).padStart(2, "0")} {DAY_LABELS[mondayBasedWeekday(date)].slice(0, 2)}
                </span>
                {dayEntries.map((entry) => {
                  const globalIndex = dayIndex * SLOTS_PER_DAY + entry.slot;
                  const intensity = entry.count > 0 ? Math.max(entry.count / maxCount, 0.12) : 0;
                  const label = `${date.toLocaleDateString("de-DE")} ${formatSlotTime(entry.slot)}, ${entry.count} Systeme`;
                  return (
                    <span
                      key={entry.slot}
                      className={classNames("maintenance-heatmap__cell", globalIndex === currentIndex && "is-current")}
                      style={{ backgroundColor: `hsl(var(--primary) / ${intensity})` }}
                      data-count={entry.count}
                      title={label}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
