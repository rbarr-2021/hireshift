"use client";

import { useMemo, useState } from "react";
import type {
  WorkerAvailabilityRecord,
  WorkerAvailabilityStatus,
} from "@/lib/models";

type AvailabilityCalendarProps = {
  entries: WorkerAvailabilityRecord[];
  onChange: (entries: WorkerAvailabilityRecord[]) => void;
};

const DEFAULT_ALL_DAY_START = "00:00";
const DEFAULT_ALL_DAY_END = "23:59";
const DEFAULT_PARTIAL_START = "09:00";
const DEFAULT_PARTIAL_END = "17:00";
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

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

function getNextDateKey(value: string) {
  const current = parseDateKey(value);
  return getDateKey(new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1));
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseDateKey(value));
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

function buildCalendarDays(month: Date) {
  const days: Date[] = [];
  const gridStart = startOfCalendarGrid(month);

  for (let index = 0; index < 42; index += 1) {
    days.push(
      new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index),
    );
  }

  return days;
}

function isSameMonth(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function statusLabel(status: WorkerAvailabilityStatus) {
  if (status === "available") return "Available";
  if (status === "partial") return "Partially available";
  return "Unavailable";
}

function statusBadgeClass(status: WorkerAvailabilityStatus) {
  if (status === "available") return "status-badge status-badge--ready";
  if (status === "partial") return "status-badge status-badge--rating";
  return "status-badge";
}

function calendarCellClass(status?: WorkerAvailabilityStatus, selected = false, today = false) {
  const base =
    "relative flex aspect-square min-h-[3.4rem] w-full flex-col items-start justify-start rounded-2xl border px-2 py-2 text-left text-sm transition sm:min-h-[4.5rem] sm:px-3";

  const selection = selected
    ? " border-[#00A7FF] ring-2 ring-[#00A7FF]/40"
    : today
      ? " border-[#10D7FF]/50"
      : " border-white/10";

  if (status === "available") {
    return `${base}${selection} bg-[#A6FF34]/16 text-stone-900`;
  }

  if (status === "partial") {
    return `${base}${selection} bg-[#10D7FF]/14 text-stone-900`;
  }

  if (status === "unavailable") {
    return `${base}${selection} bg-red-500/12 text-stone-900`;
  }

  return `${base}${selection} bg-black/40 text-stone-100`;
}

function getTimePart(value: string | null) {
  return value ? value.slice(11, 16) : null;
}

function getDatePart(value: string | null) {
  return value ? value.slice(0, 10) : null;
}

function isOvernightEntry(entry: WorkerAvailabilityRecord) {
  if (!entry.start_datetime || !entry.end_datetime) {
    return false;
  }

  return getDatePart(entry.start_datetime) !== getDatePart(entry.end_datetime);
}

function formatEntryTimeLabel(entry: WorkerAvailabilityRecord) {
  if (!entry.start_datetime || !entry.end_datetime) {
    return "No hours set";
  }

  const startTime = getTimePart(entry.start_datetime);
  const endTime = getTimePart(entry.end_datetime);

  if (!startTime || !endTime) {
    return "No hours set";
  }

  return isOvernightEntry(entry)
    ? `${startTime} – ${endTime} (next day)`
    : `${startTime} – ${endTime}`;
}

function toLocalDateTime(dateKey: string, time: string) {
  return `${dateKey}T${time}:00`;
}

function buildDateTimeRange(dateKey: string, startTime: string, endTime: string) {
  const startDateTime = toLocalDateTime(dateKey, startTime);
  const endDateKey = endTime < startTime ? getNextDateKey(dateKey) : dateKey;
  const endDateTime = toLocalDateTime(endDateKey, endTime);

  return { startDateTime, endDateTime };
}

function isZeroLength(startTime: string, endTime: string) {
  return startTime === endTime;
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

export function AvailabilityCalendar({
  entries,
  onChange,
}: AvailabilityCalendarProps) {
  const todayKey = getDateKey(new Date());
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(new Date()));
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const entryMap = useMemo(
    () =>
      entries.reduce<Record<string, WorkerAvailabilityRecord>>((accumulator, entry) => {
        accumulator[entry.availability_date] = entry;
        return accumulator;
      }, {}),
    [entries],
  );

  const selectedEntry = entryMap[selectedDateKey];
  const selectedStatus = selectedEntry?.status ?? null;
  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);

  const counts = useMemo(
    () => ({
      available: entries.filter((entry) => entry.status === "available").length,
      partial: entries.filter((entry) => entry.status === "partial").length,
      unavailable: entries.filter((entry) => entry.status === "unavailable").length,
    }),
    [entries],
  );

  const selectedStartTime = getTimePart(selectedEntry?.start_datetime ?? null) ?? DEFAULT_PARTIAL_START;
  const selectedEndTime = getTimePart(selectedEntry?.end_datetime ?? null) ?? DEFAULT_PARTIAL_END;
  const overnightPreview =
    Boolean(selectedStatus && selectedStatus !== "unavailable") &&
    selectedEndTime < selectedStartTime;

  const saveEntry = (
    status: WorkerAvailabilityStatus,
    startTime: string | null,
    endTime: string | null,
  ) => {
    let startDateTime: string | null = null;
    let endDateTime: string | null = null;

    if (status !== "unavailable" && startTime && endTime && !isZeroLength(startTime, endTime)) {
      const range = buildDateTimeRange(selectedDateKey, startTime, endTime);
      startDateTime = range.startDateTime;
      endDateTime = range.endDateTime;
    }

    const nextEntry: WorkerAvailabilityRecord = {
      id: selectedEntry?.id ?? `draft-${selectedDateKey}`,
      worker_id: selectedEntry?.worker_id ?? "",
      availability_date: selectedDateKey,
      status,
      start_datetime: startDateTime,
      end_datetime: endDateTime,
      created_at: selectedEntry?.created_at ?? "",
      updated_at: selectedEntry?.updated_at ?? "",
    };

    onChange(upsertEntry(entries, nextEntry));
  };

  const handleStatusChange = (status: WorkerAvailabilityStatus) => {
    if (status === "unavailable") {
      saveEntry("unavailable", null, null);
      return;
    }

    const defaultStart =
      getTimePart(selectedEntry?.start_datetime ?? null) ??
      (status === "available" ? DEFAULT_ALL_DAY_START : DEFAULT_PARTIAL_START);
    const defaultEnd =
      getTimePart(selectedEntry?.end_datetime ?? null) ??
      (status === "available" ? DEFAULT_ALL_DAY_END : DEFAULT_PARTIAL_END);

    saveEntry(status, defaultStart, defaultEnd);
  };

  const handleTimeChange = (field: "start" | "end", value: string) => {
    const nextStart = field === "start" ? value : selectedStartTime;
    const nextEnd = field === "end" ? value : selectedEndTime;

    saveEntry(selectedStatus ?? "partial", nextStart, nextEnd);
  };

  const handleCopyPreviousDay = () => {
    const selectedDate = parseDateKey(selectedDateKey);
    const previousDate = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate() - 1,
    );
    const previousEntry = entryMap[getDateKey(previousDate)];

    if (!previousEntry) {
      return;
    }

    saveEntry(
      previousEntry.status,
      getTimePart(previousEntry.start_datetime) ?? null,
      getTimePart(previousEntry.end_datetime) ?? null,
    );
  };

  const clearSelectedDate = () => {
    onChange(entries.filter((entry) => entry.availability_date !== selectedDateKey));
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="rounded-[1.75rem] border border-white/10 bg-black/40 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-stone-500">Calendar availability</p>
            <h3 className="mt-1 text-lg font-semibold text-stone-100">
              {formatMonthLabel(visibleMonth)}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
              className="secondary-btn px-4"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setVisibleMonth(startOfMonth(new Date()))}
              className="secondary-btn px-4"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
              className="secondary-btn px-4"
            >
              Next
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-7 gap-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500 sm:text-xs">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-7 gap-2">
          {calendarDays.map((day) => {
            const dateKey = getDateKey(day);
            const entry = entryMap[dateKey];
            const isSelected = dateKey === selectedDateKey;
            const isToday = dateKey === todayKey;
            const inMonth = isSameMonth(day, visibleMonth);

            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => {
                  setSelectedDateKey(dateKey);
                  setVisibleMonth(startOfMonth(day));
                }}
                className={calendarCellClass(entry?.status, isSelected, isToday)}
              >
                <span
                  className={`text-sm font-semibold sm:text-base ${
                    inMonth ? "text-stone-100" : "text-stone-500"
                  }`}
                >
                  {day.getDate()}
                </span>
                {isToday ? (
                  <span className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[#10D7FF]">
                    Today
                  </span>
                ) : null}
                {entry ? (
                  <span className="mt-auto text-[10px] font-medium uppercase tracking-[0.12em] text-stone-700">
                    {entry.status === "available"
                      ? "Available"
                      : entry.status === "partial"
                        ? "Partial"
                        : "Off"}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <span className="status-badge status-badge--ready">
            {counts.available} available
          </span>
          <span className="status-badge status-badge--rating">
            {counts.partial} partial
          </span>
          <span className="status-badge">
            {counts.unavailable} unavailable
          </span>
        </div>
      </div>

      <div className="rounded-[1.75rem] border border-white/10 bg-black/40 p-4 sm:p-5">
        <p className="text-sm font-medium text-stone-500">Selected day</p>
        <h3 className="mt-1 text-lg font-semibold text-stone-100">
          {formatLongDate(selectedDateKey)}
        </h3>

        <div className="mt-4 flex flex-wrap gap-2">
          {selectedStatus ? (
            <span className={statusBadgeClass(selectedStatus)}>
              {statusLabel(selectedStatus)}
            </span>
          ) : (
            <span className="status-badge">No availability set</span>
          )}
        </div>

        {selectedEntry?.status !== "unavailable" && selectedEntry ? (
          <p className="mt-3 text-sm text-stone-500">{formatEntryTimeLabel(selectedEntry)}</p>
        ) : null}

        <div className="mt-5 grid gap-2">
          <button
            type="button"
            onClick={() => handleStatusChange("available")}
            className="primary-btn w-full justify-center"
          >
            Mark available all day
          </button>
          <button
            type="button"
            onClick={() => handleStatusChange("partial")}
            className="secondary-btn w-full justify-center"
          >
            Set available hours
          </button>
          <button
            type="button"
            onClick={() => handleStatusChange("unavailable")}
            className="secondary-btn w-full justify-center"
          >
            Mark unavailable
          </button>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          <button
            type="button"
            onClick={handleCopyPreviousDay}
            className="secondary-btn w-full justify-center"
          >
            Copy previous day
          </button>
          <button
            type="button"
            onClick={clearSelectedDate}
            className="secondary-btn w-full justify-center"
          >
            Clear day
          </button>
        </div>

        {selectedStatus === "available" || selectedStatus === "partial" ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <label className="space-y-2 text-sm text-stone-500">
              <span className="font-medium text-stone-100">Start time</span>
              <input
                type="time"
                value={selectedStartTime}
                onChange={(event) => handleTimeChange("start", event.target.value)}
                className="input"
              />
            </label>
            <label className="space-y-2 text-sm text-stone-500">
              <span className="font-medium text-stone-100">End time</span>
              <input
                type="time"
                value={selectedEndTime}
                onChange={(event) => handleTimeChange("end", event.target.value)}
                className="input"
              />
            </label>
            <div className="sm:col-span-2 xl:col-span-1">
              {isZeroLength(selectedStartTime, selectedEndTime) ? (
                <p className="text-sm text-red-300">
                  Start and end time cannot be the same.
                </p>
              ) : overnightPreview ? (
                <p className="text-sm text-[#10D7FF]">
                  This will be saved as an overnight range ending the next day.
                </p>
              ) : (
                <p className="text-sm text-stone-500">
                  Hours are saved for this date unless the end time falls after midnight.
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-5 text-sm leading-6 text-stone-500">
            Pick an availability state for this date. Hours are only needed when the
            day is available or partially available.
          </p>
        )}
      </div>
    </div>
  );
}
