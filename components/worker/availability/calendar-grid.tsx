"use client";

import { CalendarCell } from "@/components/worker/availability/calendar-cell";
import type { WorkerAvailabilityRecord } from "@/lib/models";

type CalendarGridDay = {
  dateKey: string;
  dayOfMonth: number;
  weekdayLabel: string;
  inMonth: boolean;
  isToday: boolean;
};

type CalendarGridProps = {
  days: CalendarGridDay[];
  selectedDateKeys: string[];
  entryMap: Record<string, WorkerAvailabilityRecord>;
  isDragging: boolean;
  weekPreviewIndex: number | null;
  onWeekPreview: (index: number | null) => void;
  onDayClick: (dateKey: string) => void;
  onDragStart: (dateKey: string) => void;
  onDragEnter: (dateKey: string) => void;
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function CalendarGrid({
  days,
  selectedDateKeys,
  entryMap,
  isDragging,
  weekPreviewIndex,
  onWeekPreview,
  onDayClick,
  onDragStart,
  onDragEnter,
}: CalendarGridProps) {
  const selectedSet = new Set(selectedDateKeys);
  const rows = Array.from({ length: 6 }, (_, rowIndex) =>
    days.slice(rowIndex * 7, rowIndex * 7 + 7),
  );

  return (
    <div className="min-w-0 rounded-[1.35rem] border border-white/10 bg-black/35 p-2 sm:rounded-[1.6rem] sm:p-4">
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-500 sm:gap-2 sm:text-xs sm:tracking-[0.14em] lg:gap-3">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="mt-2 space-y-1.5 sm:mt-3 sm:space-y-2 lg:space-y-3">
        {rows.map((row, rowIndex) => {
          const isWeekPreviewed = weekPreviewIndex === rowIndex;

          return (
            <div
              key={`row-${rowIndex}`}
              className={`rounded-xl p-1 transition ${
                isWeekPreviewed
                  ? "bg-[rgba(139,92,246,0.12)]"
                  : "hover:bg-[rgba(139,92,246,0.08)]"
              }`}
              onMouseEnter={() => onWeekPreview(rowIndex)}
              onMouseLeave={() => onWeekPreview(null)}
            >
              <div
                className="grid min-w-0 grid-cols-7 gap-1 sm:gap-2 lg:gap-3"
                onPointerMove={(event) => {
                  if (!isDragging) {
                    return;
                  }

                  const target = document
                    .elementFromPoint(event.clientX, event.clientY)
                    ?.closest<HTMLElement>("[data-date-key]");

                  const nextDateKey = target?.dataset.dateKey;

                  if (!nextDateKey) {
                    return;
                  }

                  onDragEnter(nextDateKey);
                }}
              >
                {row.map((day) => (
                  <CalendarCell
                    key={day.dateKey}
                    dateKey={day.dateKey}
                    dayOfMonth={day.dayOfMonth}
                    weekdayLabel={day.weekdayLabel}
                    inMonth={day.inMonth}
                    isToday={day.isToday}
                    isSelected={selectedSet.has(day.dateKey)}
                    isPreviewed={isWeekPreviewed && !selectedSet.has(day.dateKey)}
                    status={entryMap[day.dateKey]?.status}
                    onClick={onDayClick}
                    onDragStart={onDragStart}
                    onDragEnter={onDragEnter}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
