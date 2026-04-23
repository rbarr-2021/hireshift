"use client";

import { useMemo, useState } from "react";
import { ShiftTimeRangePicker } from "@/components/forms/shift-time-range-picker";
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

function statusCardClass(status: WorkerAvailabilityStatus, active: boolean) {
  const base =
    "w-full rounded-2xl border px-4 py-4 text-left transition shadow-[0_12px_30px_rgba(2,8,23,0.22)]";

  if (active && status === "available") {
    return `${base} border-[rgba(166,255,52,0.5)] bg-[rgba(166,255,52,0.22)]`;
  }

  if (active && status === "partial") {
    return `${base} border-[rgba(16,215,255,0.5)] bg-[rgba(16,215,255,0.2)]`;
  }

  if (active && status === "unavailable") {
    return `${base} border-[rgba(255,82,82,0.45)] bg-[rgba(255,82,82,0.18)]`;
  }

  return `${base} border-white/10 bg-black/40 hover:border-[#00A7FF]/30 hover:bg-black/50`;
}

function calendarCellClass(status?: WorkerAvailabilityStatus, selected = false, today = false) {
  const base =
    "relative flex min-h-[3.85rem] w-full min-w-0 flex-col rounded-[1rem] border px-2 py-2 text-left transition sm:min-h-[4.35rem] lg:min-h-[4.75rem] lg:rounded-[1.15rem] lg:px-3 lg:py-3";

  const selection = selected
    ? " border-[#00A7FF] ring-2 ring-[#00A7FF]/35"
    : today
      ? " border-[#10D7FF]/35"
      : " border-white/8";

  if (status === "available") {
    return `${base}${selection} bg-[rgba(166,255,52,0.14)]`;
  }

  if (status === "partial") {
    return `${base}${selection} bg-[rgba(16,215,255,0.12)]`;
  }

  if (status === "unavailable") {
    return `${base}${selection} bg-[rgba(255,82,82,0.12)]`;
  }

  return `${base}${selection} bg-black/30`;
}

function calendarDotClass(status: WorkerAvailabilityStatus) {
  if (status === "available") return "bg-[#A6FF34]";
  if (status === "partial") return "bg-[#10D7FF]";
  return "bg-[#FF6B6B]";
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
    ? `${startTime} - ${endTime} (next day)`
    : `${startTime} - ${endTime}`;
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
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);

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

  const selectedStartTime =
    getTimePart(selectedEntry?.start_datetime ?? null) ?? DEFAULT_PARTIAL_START;
  const selectedEndTime =
    getTimePart(selectedEntry?.end_datetime ?? null) ?? DEFAULT_PARTIAL_END;
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

  const selectedDayEditor = (
    <div className="panel-soft p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-stone-500">Selected day</p>
          <h3 className="mt-1 text-xl font-semibold text-stone-100">
            {formatLongDate(selectedDateKey)}
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedStatus ? (
              <span className={statusBadgeClass(selectedStatus)}>
                {statusLabel(selectedStatus)}
              </span>
            ) : (
              <span className="status-badge">No availability set yet</span>
            )}
            {selectedEntry?.status !== "unavailable" && selectedEntry ? (
              <span className="status-badge">{formatEntryTimeLabel(selectedEntry)}</span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={handleCopyPreviousDay}
            className="secondary-btn px-4"
          >
            Copy previous day
          </button>
          <button
            type="button"
            onClick={clearSelectedDate}
            className="secondary-btn px-4"
          >
            Clear day
          </button>
          <button
            type="button"
            onClick={() => setMobileEditorOpen(false)}
            className="secondary-btn px-4 sm:hidden"
          >
            Done
          </button>
        </div>
      </div>

      {selectedStatus === "available" || selectedStatus === "partial" ? (
        <div className="mt-6 space-y-4 rounded-[1.5rem] border border-white/10 bg-black/30 p-4 sm:p-5">
          <div>
            <p className="text-sm font-medium text-stone-100">Hours</p>
            <p className="mt-1 text-sm leading-6 text-stone-500">
              If the end time is earlier than the start time, it saves as overnight.
            </p>
          </div>

          <ShiftTimeRangePicker
            startTime={selectedStartTime}
            endTime={selectedEndTime}
            onStartTimeChange={(value) => handleTimeChange("start", value)}
            onEndTimeChange={(value) => handleTimeChange("end", value)}
          />

          {isZeroLength(selectedStartTime, selectedEndTime) ? (
            <p className="text-sm text-red-300">
              Start and end time cannot be the same.
            </p>
          ) : overnightPreview ? (
            <p className="text-sm text-[#10D7FF]">
              This availability will be saved as an overnight range ending the next day.
            </p>
          ) : (
            <p className="text-sm text-stone-500">
              These hours will stay on the same day unless the end time rolls past midnight.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-black/30 px-4 py-4">
          <p className="text-sm leading-6 text-stone-500">
            Choose an availability state above. You only need to set hours when the
            day is available or partly available.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="panel-soft p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <p className="text-sm font-medium text-stone-500">Calendar availability</p>
            <div className="flex flex-wrap gap-2">
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
            <p className="max-w-2xl text-sm leading-6 text-stone-500">
              Pick a day, then set your status.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
              className="secondary-btn px-4"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => {
                const today = startOfMonth(new Date());
                setVisibleMonth(today);
                setSelectedDateKey(todayKey);
              }}
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

        <div className="mt-6 grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_18rem] 2xl:items-start">
          <div className="min-w-0 rounded-[1.75rem] border border-white/10 bg-black/35 p-2.5 sm:p-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-stone-100">
                {formatMonthLabel(visibleMonth)}
              </h3>
              <div className="hidden flex-wrap gap-2 sm:flex">
                <span className="text-xs uppercase tracking-[0.16em] text-stone-500">
                  Tap a day to edit
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500 sm:gap-2 sm:text-xs">
              {WEEKDAY_LABELS.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>

            <div className="mt-3 grid min-w-0 grid-cols-7 gap-1.5 sm:gap-2">
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
                      setMobileEditorOpen(true);
                    }}
                    className={calendarCellClass(entry?.status, isSelected, isToday)}
                  >
                    <span
                      className={`text-sm font-semibold leading-none sm:text-base ${
                        inMonth ? "text-stone-100" : "text-stone-500"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    {isToday ? (
                      <span className="mt-1 text-[9px] uppercase tracking-[0.1em] text-[#10D7FF] sm:text-[10px]">
                        Today
                      </span>
                    ) : null}
                    {entry ? (
                      <span className="mt-auto inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-stone-700">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${calendarDotClass(entry.status)}`}
                        />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="rounded-[1.75rem] border border-white/10 bg-black/35 p-4 sm:p-5 2xl:sticky 2xl:top-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
              Set selected day
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 2xl:grid-cols-1">
              <button
                type="button"
                onClick={() => handleStatusChange("available")}
                className={statusCardClass("available", selectedStatus === "available")}
              >
                <p className="text-base font-semibold text-stone-100">Available all day</p>
                <p className="mt-2 text-sm text-stone-400">Open for shifts</p>
              </button>
              <button
                type="button"
                onClick={() => handleStatusChange("partial")}
                className={statusCardClass("partial", selectedStatus === "partial")}
              >
                <p className="text-base font-semibold text-stone-100">Specific hours</p>
                <p className="mt-2 text-sm text-stone-400">Choose a time range</p>
              </button>
              <button
                type="button"
                onClick={() => handleStatusChange("unavailable")}
                className={statusCardClass("unavailable", selectedStatus === "unavailable")}
              >
                <p className="text-base font-semibold text-stone-100">Unavailable</p>
                <p className="mt-2 text-sm text-stone-400">Not taking work</p>
              </button>
            </div>
          </aside>
        </div>
      </div>

      <div className="sm:hidden">
        <button
          type="button"
          onClick={() => setMobileEditorOpen(true)}
          className="panel-soft flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-stone-100">Edit selected day</p>
            <p className="mt-1 text-sm text-stone-500">{formatLongDate(selectedDateKey)}</p>
          </div>
          <span className="status-badge">
            {selectedStatus ? statusLabel(selectedStatus) : "Set status"}
          </span>
        </button>
      </div>

      <div className="hidden sm:block">{selectedDayEditor}</div>

      {mobileEditorOpen ? (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] sm:hidden">
          <button
            type="button"
            aria-label="Close availability editor"
            onClick={() => setMobileEditorOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-[2rem] border border-white/10 bg-[rgba(4,12,22,0.98)] p-4 shadow-2xl">
            <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-white/15" />
            {selectedDayEditor}
          </div>
        </div>
      ) : null}
    </div>
  );
}
