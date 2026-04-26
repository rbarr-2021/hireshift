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

const DEFAULT_ALL_DAY_START = "09:00";
const DEFAULT_ALL_DAY_END = "17:00";
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

function formatSelectedDateLabel(dateKeys: string[]) {
  if (dateKeys.length === 1) {
    return formatLongDate(dateKeys[0]);
  }

  return `${dateKeys.length} days selected`;
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
    "relative flex min-h-[3.65rem] w-full min-w-0 flex-col overflow-hidden rounded-[0.9rem] border px-1.5 py-1.5 text-left transition sm:min-h-[4.35rem] sm:rounded-[1rem] sm:px-2 sm:py-2 lg:min-h-[4.75rem] lg:rounded-[1.15rem] lg:px-3 lg:py-3";

  const selection = selected
    ? " border-[#00A7FF] ring-2 ring-[#00A7FF]/35"
    : today
      ? " border-[#8B5CF6]/70 text-white shadow-[0_0_10px_rgba(139,92,246,0.5)]"
      : " border-white/8";

  const todaySurface = !selected && today
    ? " bg-[linear-gradient(135deg,rgba(59,130,246,0.38),rgba(139,92,246,0.38))]"
    : "";

  if (status === "available") {
    return `${base}${selection}${todaySurface || " bg-[rgba(166,255,52,0.14)]"}`;
  }

  if (status === "partial") {
    return `${base}${selection}${todaySurface || " bg-[rgba(16,215,255,0.12)]"}`;
  }

  if (status === "unavailable") {
    return `${base}${selection}${todaySurface || " bg-[rgba(255,82,82,0.12)]"}`;
  }

  return `${base}${selection}${todaySurface || " bg-black/30"}`;
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
  const [selectedDateKeys, setSelectedDateKeys] = useState([todayKey]);
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
  const [mobileMultiSelectEnabled, setMobileMultiSelectEnabled] = useState(false);

  const entryMap = useMemo(
    () =>
      entries.reduce<Record<string, WorkerAvailabilityRecord>>((accumulator, entry) => {
        accumulator[entry.availability_date] = entry;
        return accumulator;
      }, {}),
    [entries],
  );

  const selectedDateKey = selectedDateKeys[selectedDateKeys.length - 1] ?? todayKey;
  const selectedEntry = entryMap[selectedDateKey];
  const selectedStatuses = selectedDateKeys
    .map((dateKey) => entryMap[dateKey]?.status ?? null)
    .filter((status): status is WorkerAvailabilityStatus => Boolean(status));
  const selectedStatus =
    selectedStatuses.length > 0 && selectedStatuses.every((status) => status === selectedStatuses[0])
      ? selectedStatuses[0]
      : null;
  const hasMixedSelection =
    selectedDateKeys.length > 1 &&
    new Set(selectedDateKeys.map((dateKey) => entryMap[dateKey]?.status ?? "unset")).size > 1;
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
    dateKeys = selectedDateKeys,
  ) => {
    const nextEntries = dateKeys.reduce((currentEntries, dateKey) => {
      const existingEntry = entryMap[dateKey];
      let startDateTime: string | null = null;
      let endDateTime: string | null = null;

      if (status !== "unavailable" && startTime && endTime && !isZeroLength(startTime, endTime)) {
        const range = buildDateTimeRange(dateKey, startTime, endTime);
        startDateTime = range.startDateTime;
        endDateTime = range.endDateTime;
      }

      const nextEntry: WorkerAvailabilityRecord = {
        id: existingEntry?.id ?? `draft-${dateKey}`,
        worker_id: existingEntry?.worker_id ?? "",
        availability_date: dateKey,
        status,
        start_datetime: startDateTime,
        end_datetime: endDateTime,
        created_at: existingEntry?.created_at ?? "",
        updated_at: existingEntry?.updated_at ?? "",
      };

      return upsertEntry(currentEntries, nextEntry);
    }, entries);

    onChange(nextEntries);
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
    onChange(
      entries.filter((entry) => !selectedDateKeys.includes(entry.availability_date)),
    );
  };

  const handleDateSelect = (dateKey: string, { singleSelect = false }: { singleSelect?: boolean } = {}) => {
    if (singleSelect) {
      setSelectedDateKeys([dateKey]);
      return;
    }

    setSelectedDateKeys((current) => {
      if (current.includes(dateKey)) {
        return current.length === 1 ? current : current.filter((entry) => entry !== dateKey);
      }

      return [...current, dateKey].sort();
    });
  };

  const renderSelectedDayEditor = ({ compact = false }: { compact?: boolean } = {}) => (
    <div className={compact ? "rounded-[1.5rem] border border-white/10 bg-black/35 p-4" : "panel-soft p-5 sm:p-6"}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className={`${compact ? "text-xs uppercase tracking-[0.16em]" : "text-sm"} font-medium text-stone-500`}>
            {selectedDateKeys.length > 1 ? "Selected days" : "Selected day"}
          </p>
          <h3 className={`${compact ? "mt-2 text-lg" : "mt-1 text-xl"} font-semibold text-stone-100`}>
            {formatSelectedDateLabel(selectedDateKeys)}
          </h3>
          <div className={`${compact ? "mt-2" : "mt-3"} flex flex-wrap gap-2`}>
            {hasMixedSelection ? (
              <span className="status-badge status-badge--rating">Mixed selection</span>
            ) : selectedStatus ? (
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
        <div className={`flex flex-col gap-2 sm:flex-row ${compact ? "hidden" : ""}`}>
          {selectedDateKeys.length === 1 && !compact ? (
            <button
              type="button"
              onClick={handleCopyPreviousDay}
              className="secondary-btn px-4"
            >
              Copy previous day
            </button>
          ) : null}
          {!compact ? (
            <button
              type="button"
              onClick={clearSelectedDate}
              className="secondary-btn px-4"
            >
              {selectedDateKeys.length > 1 ? "Clear days" : "Clear day"}
            </button>
          ) : null}
        </div>
      </div>

      {selectedStatus === "partial" ? (
        <div className={`${compact ? "mt-4" : "mt-6"} space-y-4 rounded-[1.5rem] border border-white/10 bg-black/30 p-4 sm:p-5`}>
          <div>
            <p className="text-sm font-medium text-stone-100">Set hours</p>
            <p className="mt-1 text-sm leading-6 text-stone-500">End before start saves as overnight.</p>
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
            <p className="text-sm text-stone-500">These hours stay on the same day.</p>
          )}
        </div>
      ) : selectedStatus === "available" ? (
        <div className={`${compact ? "mt-4" : "mt-6"} rounded-[1.5rem] border border-white/10 bg-black/30 px-4 py-4`}>
          <p className="text-sm leading-6 text-stone-500">
            Saved as available from 9am to 5pm.
          </p>
        </div>
      ) : selectedStatus === "unavailable" ? (
        <div className={`${compact ? "mt-4" : "mt-6"} rounded-[1.5rem] border border-white/10 bg-black/30 px-4 py-4`}>
          <p className="text-sm leading-6 text-stone-500">Marked as unavailable.</p>
        </div>
      ) : (
        <div className={`${compact ? "mt-4" : "mt-6"} rounded-[1.5rem] border border-white/10 bg-black/30 px-4 py-4`}>
          <p className="text-sm leading-6 text-stone-500">Choose availability below.</p>
        </div>
      )}
    </div>
  );

  const renderSelectedDayStatusControls = ({
    compact = false,
  }: {
    compact?: boolean;
  } = {}) => (
    <aside className={`${compact ? "rounded-[1.5rem] border border-white/10 bg-black/35 p-4" : "rounded-[1.75rem] border border-white/10 bg-black/35 p-4 sm:p-5 2xl:sticky 2xl:top-4"}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
        {compact ? "Choose availability" : "Set selected day"}
      </p>
      <div className={`mt-4 grid gap-3 ${compact ? "grid-cols-1" : "sm:grid-cols-3 2xl:grid-cols-1"}`}>
        <button
          type="button"
          onClick={() => handleStatusChange("available")}
          className={statusCardClass("available", selectedStatus === "available")}
        >
          <p className="text-base font-semibold text-stone-100">Available 9am-5pm</p>
          {!compact ? <p className="mt-2 text-sm text-stone-400">Quick day preset</p> : null}
        </button>
        <button
          type="button"
          onClick={() => handleStatusChange("partial")}
          className={statusCardClass("partial", selectedStatus === "partial")}
        >
          <p className="text-base font-semibold text-stone-100">Specific hours</p>
          {!compact ? <p className="mt-2 text-sm text-stone-400">Choose a time range</p> : null}
        </button>
        <button
          type="button"
          onClick={() => handleStatusChange("unavailable")}
          className={statusCardClass("unavailable", selectedStatus === "unavailable")}
        >
          <p className="text-base font-semibold text-stone-100">Unavailable</p>
          {!compact ? <p className="mt-2 text-sm text-stone-400">Not taking work</p> : null}
        </button>
      </div>
    </aside>
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
              Tap one or more days, then set your status.
            </p>
            <div className="sm:hidden">
              <button
                type="button"
                onClick={() => setMobileMultiSelectEnabled((current) => !current)}
                className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                  mobileMultiSelectEnabled
                    ? "border-[rgba(29,185,84,0.45)] bg-[rgba(29,185,84,0.2)] text-[#9ff0b7]"
                    : "border-white/10 bg-black/25 text-stone-300"
                }`}
              >
                {mobileMultiSelectEnabled ? "Select multiple: on" : "Select multiple"}
              </button>
            </div>
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
                setSelectedDateKeys([todayKey]);
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
          <div className="min-w-0 rounded-[1.4rem] border border-white/10 bg-black/35 p-1.5 sm:rounded-[1.75rem] sm:p-4">
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

            <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-stone-500 sm:gap-2 sm:text-xs sm:tracking-[0.14em]">
              {WEEKDAY_LABELS.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>

            <div className="mt-2.5 grid min-w-0 grid-cols-7 gap-1 sm:mt-3 sm:gap-2">
              {calendarDays.map((day) => {
                const dateKey = getDateKey(day);
                const entry = entryMap[dateKey];
                const isSelected = selectedDateKeys.includes(dateKey);
                const isToday = dateKey === todayKey;
                const inMonth = isSameMonth(day, visibleMonth);

                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => {
                      handleDateSelect(dateKey, { singleSelect: !mobileMultiSelectEnabled });
                      setVisibleMonth(startOfMonth(day));
                      setMobileEditorOpen(true);
                    }}
                    className={calendarCellClass(entry?.status, isSelected, isToday)}
                  >
                    <span
                      className={`text-[13px] font-semibold leading-none sm:text-base ${
                        isToday && !isSelected
                          ? "text-white"
                          : inMonth
                            ? "text-stone-100"
                            : "text-stone-500"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    {entry ? (
                      <span className="mt-auto inline-flex items-center gap-1 text-[9px] font-medium uppercase tracking-[0.08em] text-stone-700 sm:gap-1.5 sm:text-[10px] sm:tracking-[0.12em]">
                        <span
                          className={`h-2 w-2 rounded-full sm:h-2.5 sm:w-2.5 ${calendarDotClass(entry.status)}`}
                        />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="hidden sm:block">{renderSelectedDayStatusControls()}</div>
        </div>
      </div>

      <div className="hidden sm:block">{renderSelectedDayEditor()}</div>

      {mobileEditorOpen ? (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] sm:hidden">
          <button
            type="button"
            aria-label="Close availability editor"
            onClick={() => setMobileEditorOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[86vh] overflow-y-auto rounded-t-[2rem] border border-white/10 bg-[rgba(4,12,22,0.98)] p-4 shadow-2xl">
            <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-white/15" />
            <div className="space-y-4">
              {renderSelectedDayEditor({ compact: true })}
              {renderSelectedDayStatusControls({ compact: true })}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={clearSelectedDate}
                  className="secondary-btn w-full px-4"
                >
                  {selectedDateKeys.length > 1 ? "Clear days" : "Clear day"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileEditorOpen(false);
                    setMobileMultiSelectEnabled(false);
                  }}
                  className="primary-btn w-full px-4"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
