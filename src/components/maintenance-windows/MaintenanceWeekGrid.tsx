import { useRef, useState } from "react";
import type { MaintenanceWindowDefinition } from "@/domain/models/types";

type WeeklySlots = MaintenanceWindowDefinition["weeklySlots"];
type PaintMode = "allow" | "block";

const DAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"] as const;
const SLOTS_PER_DAY = 48;
const TOTAL_SLOTS = DAYS.length * SLOTS_PER_DAY;

export interface MaintenanceWeekGridProps {
  value: WeeklySlots;
  onChange: (value: WeeklySlots) => void;
  paintMode: PaintMode;
  disabled?: boolean;
  compact?: boolean;
}

function slotTime(slot: number) {
  const startMinutes = slot * 30;
  const endMinutes = (startMinutes + 30) % (24 * 60);
  const format = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return `${format(startMinutes)}–${format(endMinutes)}`;
}

function cloneWithPaint(value: WeeklySlots, day: number, slot: number, allowed: boolean): WeeklySlots {
  const next = value.map((daySlots) => [...daySlots]) as WeeklySlots;
  next[day][slot] = allowed;
  return next;
}

function classNames(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function MaintenanceWeekGrid({
  value,
  onChange,
  paintMode,
  disabled = false,
  compact = false,
}: MaintenanceWeekGridProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const latestValue = useRef(value);
  const isPainting = useRef(false);
  const ignoreNextClick = useRef(false);
  latestValue.current = value;

  const applyPaint = (day: number, slot: number) => {
    if (disabled) return;

    const allowed = paintMode === "allow";
    const current = latestValue.current;
    if (current[day][slot] === allowed) return;

    const next = cloneWithPaint(current, day, slot, allowed);
    latestValue.current = next;
    onChange(next);
  };

  const moveFocus = (index: number, direction: "ArrowRight" | "ArrowLeft" | "ArrowDown" | "ArrowUp") => {
    const day = Math.floor(index / SLOTS_PER_DAY);
    const slot = index % SLOTS_PER_DAY;
    let nextIndex = index;

    if (direction === "ArrowRight") nextIndex = (index + 1) % TOTAL_SLOTS;
    if (direction === "ArrowLeft") nextIndex = (index + TOTAL_SLOTS - 1) % TOTAL_SLOTS;
    if (direction === "ArrowDown") nextIndex = ((day + 1) % DAYS.length) * SLOTS_PER_DAY + slot;
    if (direction === "ArrowUp") nextIndex = ((day + DAYS.length - 1) % DAYS.length) * SLOTS_PER_DAY + slot;

    setActiveIndex(nextIndex);
    cellRefs.current[nextIndex]?.focus();
  };

  if (compact) {
    const allowedSlots = value.flat().filter(Boolean).length;
    return (
      <div
        className="maintenance-grid maintenance-grid--compact"
        role="img"
        aria-label={`Wochenübersicht: ${allowedSlots} von ${TOTAL_SLOTS} Zeitfenstern erlaubt`}
      >
        {value.map((daySlots, day) => (
          <div className="maintenance-grid__compact-row" key={DAYS[day]} aria-hidden="true">
            {daySlots.map((allowed, slot) => (
              <span
                className={classNames("maintenance-grid__compact-cell", allowed && "is-allowed", slot % 2 === 0 && "is-hour-start")}
                data-allowed={allowed}
                data-day={day}
                data-slot={slot}
                key={`${day}-${slot}`}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <section className="maintenance-grid-shell" aria-label="Wöchentliche Zeitplanung">
      <div className="maintenance-grid__legend" aria-label="Legende">
        <span><i className="maintenance-grid__legend-symbol maintenance-grid__legend-symbol--allowed" aria-hidden="true" /> Erlaubt</span>
        <span><i className="maintenance-grid__legend-symbol maintenance-grid__legend-symbol--blocked" aria-hidden="true" /> Gesperrt</span>
      </div>
      <p className="sr-only" id="maintenance-grid-instructions">
        Jede Zelle steht für 30 Minuten. Mit den Pfeiltasten bewegen Sie sich durch die Woche; am Rand wird zur gegenüberliegenden Seite umgebrochen. Leertaste oder Enter übernimmt den aktuellen Malmodus.
      </p>
      <div className="maintenance-grid__scroll">
        <div className="maintenance-grid" role="grid" aria-label="Wöchentlicher Zeitplan" aria-describedby="maintenance-grid-instructions">
          <div className="maintenance-grid__time-row" aria-hidden="true">
            <span className="maintenance-grid__corner">Tag / Zeit</span>
            {Array.from({ length: SLOTS_PER_DAY }, (_, slot) => (
              <span className={classNames("maintenance-grid__time-label", slot % 2 === 0 && "is-hour-start")} key={slot}>
                {slot % 2 === 0 ? slotTime(slot).slice(0, 2) : ""}
              </span>
            ))}
          </div>
          {value.map((daySlots, day) => (
            <div className="maintenance-grid__row" role="row" key={DAYS[day]}>
              <span className="maintenance-grid__day-label" role="rowheader">{DAYS[day].slice(0, 2)}</span>
              {daySlots.map((allowed, slot) => {
                const index = day * SLOTS_PER_DAY + slot;
                const label = `${DAYS[day]} ${slotTime(slot)}, ${allowed ? "erlaubt" : "gesperrt"}`;
                return (
                  <button
                    aria-label={label}
                    aria-selected={allowed}
                    className={classNames("maintenance-grid__cell", allowed && "is-allowed", slot % 2 === 0 && "is-hour-start")}
                    data-allowed={allowed}
                    data-day={day}
                    data-slot={slot}
                    disabled={disabled}
                    key={`${day}-${slot}`}
                    onClick={() => {
                      if (ignoreNextClick.current) {
                        ignoreNextClick.current = false;
                        return;
                      }
                      applyPaint(day, slot);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === " " || event.key === "Spacebar" || event.key === "Enter") {
                        event.preventDefault();
                        applyPaint(day, slot);
                        return;
                      }
                      if (event.key === "ArrowRight" || event.key === "ArrowLeft" || event.key === "ArrowDown" || event.key === "ArrowUp") {
                        event.preventDefault();
                        moveFocus(index, event.key);
                      }
                    }}
                    onPointerDown={(event) => {
                      if (disabled || (event.button !== 0 && event.button !== undefined)) return;
                      isPainting.current = true;
                      ignoreNextClick.current = false;
                      event.currentTarget.setPointerCapture?.(event.pointerId);
                      event.preventDefault();
                      applyPaint(day, slot);
                    }}
                    onPointerEnter={() => {
                      if (isPainting.current) applyPaint(day, slot);
                    }}
                    onPointerUp={() => {
                      if (isPainting.current) ignoreNextClick.current = true;
                      isPainting.current = false;
                    }}
                    onPointerCancel={() => {
                      isPainting.current = false;
                    }}
                    ref={(element) => { cellRefs.current[index] = element; }}
                    role="gridcell"
                    tabIndex={index === activeIndex ? 0 : -1}
                    type="button"
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
