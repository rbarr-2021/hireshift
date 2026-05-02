"use client";

import { useMemo, useState } from "react";
import type { WorkerAvailabilityRecord } from "@/lib/models";

type AvailabilityCalendarProps = {
  entries: WorkerAvailabilityRecord[];
  onChange: (entries: WorkerAvailabilityRecord[]) => void;
};

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function startOfCalendarGrid(date: Date) {
  const firstDayOfMonth = startOfMonth(date);
  const weekday = (firstDayOfMonth.getDay() + 6) % 7;
  return new Date(
    firstDayOfMonth.getFullYear(),
    firstDayOfMonth.getMonth(),
    firstDayOfMonth.getDate() - weekday,
  );
}

function buildCalendarDays(month: Date, todayKey: string) {
  const days: Array<{
    dateKey: string;
    dayOfMonth: number;
    inMonth: boolean;
    isToday: boolean;
  }> = [];
  const gridStart = startOfCalendarGrid(month);

  for (let index = 0; index < 42; index += 1) {
    const day = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + index,
    );
    const dateKey = getDateKey(day);

    days.push({
      dateKey,
      dayOfMonth: day.getDate(),
      inMonth: day.getMonth() === month.getMonth() && day.getFullYear() === month.getFullYear(),
      isToday: dateKey === todayKey,
    });
  }

  return days;
}

function upsertEntry(entries: WorkerAvailabilityRecord[], nextEntry: WorkerAvailabilityRecord) {
  const exists = entries.some(
    (entry) => entry.availability_date === nextEntry.availability_date,
  );

  if (!exists) {
    return [...entries, nextEntry].sort((left, right) =>
      left.availability_date.localeCompare(right.availability_date),
    );
  }

  return entries.map((entry) =>
    entry.availability_date === nextEntry.availability_date ? nextEntry : entry,
  );
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function AvailabilityCalendar({
  entries,
  onChange,
}: AvailabilityCalendarProps) {
  const todayKey = getDateKey(new Date());
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(new Date()));
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const entryMap = useMemo(
    () =>
      entries.reduce<Record<string, WorkerAvailabilityRecord>>((accumulator, entry) => {
        accumulator[entry.availability_date] = entry;
        return accumulator;
      }, {}),
    [entries],
  );

  const calendarDays = useMemo(
    () => buildCalendarDays(visibleMonth, todayKey),
    [todayKey, visibleMonth],
  );

  const availableCount = useMemo(
    () => entries.filter((entry) => entry.status === "available").length,
    [entries],
  );

  const toggleDayAvailability = (dateKey: string) => {
    const existingEntry = entryMap[dateKey];
    const isAvailable = existingEntry?.status === "available";

    const nextEntry: WorkerAvailabilityRecord = {
      id: existingEntry?.id ?? `draft-${dateKey}`,
      worker_id: existingEntry?.worker_id ?? "",
      availability_date: dateKey,
      status: isAvailable ? "unavailable" : "available",
      start_datetime: isAvailable ? null : `${dateKey}T09:00:00`,
      end_datetime: isAvailable ? null : `${dateKey}T17:00:00`,
      created_at: existingEntry?.created_at ?? "",
      updated_at: existingEntry?.updated_at ?? "",
    };

    onChange(upsertEntry(entries, nextEntry));
    setUpdatedAt(Date.now());
  };

  const showUpdatedMessage = updatedAt && Date.now() - updatedAt < 1800;

  return (
    <div className="space-y-4">
      <div className="panel-soft p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
            className="secondary-btn min-h-10 px-3 py-2 text-sm"
          >
            Prev
          </button>
          <h3 className="text-lg font-semibold text-stone-100">
            {formatMonthLabel(visibleMonth)}
          </h3>
          <button
            type="button"
            onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
            className="secondary-btn min-h-10 px-3 py-2 text-sm"
          >
            Next
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="status-badge status-badge--ready">{availableCount} available days</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/25 px-2 py-1 text-stone-400">
            <span className="h-2 w-2 rounded-full bg-[#3B82F6]" />
            Available
          </span>
        </div>
      </div>

      <div className="rounded-[1.2rem] border border-white/10 bg-black/35 p-2 sm:rounded-[1.5rem] sm:p-4">
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-500 sm:gap-2">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1 sm:gap-2">
          {calendarDays.map((day) => {
            const entry = entryMap[day.dateKey];
            const isAvailable = entry?.status === "available";
            const isCurrentMonth = day.inMonth;

            return (
              <button
                key={day.dateKey}
                type="button"
                onClick={() => toggleDayAvailability(day.dateKey)}
                className={`relative aspect-square rounded-xl border p-1 text-left transition sm:p-2 ${
                  day.isToday
                    ? "border-[#8B5CF6]/70 shadow-[0_0_10px_rgba(139,92,246,0.4)]"
                    : "border-white/10"
                } ${
                  isAvailable
                    ? "bg-[rgba(59,130,246,0.2)] text-white"
                    : "bg-black/30 text-stone-200 hover:border-[#3B82F6]/40"
                } ${isCurrentMonth ? "" : "opacity-45"}`}
                aria-label={`${day.dateKey} ${isAvailable ? "available" : "not available"}`}
              >
                <span className="text-sm font-semibold leading-none sm:text-base">{day.dayOfMonth}</span>
                {isAvailable ? (
                  <span className="absolute inset-x-2 bottom-1 h-1.5 rounded-full bg-[#3B82F6] sm:bottom-2" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <p className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-stone-500">
        Tap a date once to mark available. Tap again to remove availability.
      </p>

      {showUpdatedMessage ? (
        <p className="text-sm text-[#BFD4FF]">Availability updated.</p>
      ) : null}
    </div>
  );
}
