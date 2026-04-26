"use client";

import { useMemo, useState } from "react";
import { BottomActionBar } from "@/components/worker/availability/bottom-action-bar";
import { CalendarGrid } from "@/components/worker/availability/calendar-grid";
import { MultiSelectToggle } from "@/components/worker/availability/multi-select-toggle";
import { useSelectionStateManager } from "@/components/worker/availability/selection-state-manager";
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

function getTimePart(value: string | null) {
  return value ? value.slice(11, 16) : null;
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
  const [multiSelectEnabled, setMultiSelectEnabled] = useState(false);

  const {
    selectedDateKeys,
    isDragging,
    handleDayClick,
    startDragSelection,
    continueDragSelection,
    clearSelection,
    setSelectedDateKeys,
  } = useSelectionStateManager({
    multiSelectEnabled,
  });

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

  const counts = useMemo(
    () => ({
      available: entries.filter((entry) => entry.status === "available").length,
      partial: entries.filter((entry) => entry.status === "partial").length,
      unavailable: entries.filter((entry) => entry.status === "unavailable").length,
    }),
    [entries],
  );

  const selectedSummary = useMemo(() => {
    if (selectedDateKeys.length === 0) {
      return "Select one or more days to set availability.";
    }

    if (selectedDateKeys.length === 1) {
      return new Intl.DateTimeFormat("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(parseDateKey(selectedDateKeys[0]));
    }

    return `${selectedDateKeys.length} days selected`;
  }, [selectedDateKeys]);

  const applyStatusToSelectedDays = (status: WorkerAvailabilityStatus) => {
    if (selectedDateKeys.length === 0) {
      return;
    }

    const nextEntries = selectedDateKeys.reduce((currentEntries, dateKey) => {
      const existingEntry = entryMap[dateKey];
      let startDateTime: string | null = null;
      let endDateTime: string | null = null;

      if (status !== "unavailable") {
        const fallbackStart =
          getTimePart(existingEntry?.start_datetime ?? null) ??
          (status === "available" ? DEFAULT_ALL_DAY_START : DEFAULT_PARTIAL_START);
        const fallbackEnd =
          getTimePart(existingEntry?.end_datetime ?? null) ??
          (status === "available" ? DEFAULT_ALL_DAY_END : DEFAULT_PARTIAL_END);

        if (!isZeroLength(fallbackStart, fallbackEnd)) {
          const range = buildDateTimeRange(dateKey, fallbackStart, fallbackEnd);
          startDateTime = range.startDateTime;
          endDateTime = range.endDateTime;
        }
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

  return (
    <div className="space-y-5 pb-28 sm:pb-0">
      <div className="panel-soft p-4 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <p className="text-sm font-medium text-stone-500">Calendar availability</p>
            <div className="flex flex-wrap gap-2">
              <span className="status-badge status-badge--ready">
                {counts.available} available
              </span>
              <span className="status-badge status-badge--rating">
                {counts.partial} partial
              </span>
              <span className="status-badge">{counts.unavailable} unavailable</span>
            </div>
            <div className="pt-1">
              <MultiSelectToggle
                enabled={multiSelectEnabled}
                onToggle={() => {
                  setMultiSelectEnabled((current) => !current);
                }}
              />
              {multiSelectEnabled ? (
                <p className="mt-2 text-sm text-[#BFD4FF]">
                  Tap or drag across days to select multiple.
                </p>
              ) : null}
            </div>
            <p className="max-w-2xl text-sm leading-6 text-stone-500">
              {selectedSummary}
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

        <div className="mt-6 grid items-start gap-6 2xl:grid-cols-[minmax(0,2.35fr)_360px] 2xl:gap-8">
          <div className="min-w-0 2xl:flex 2xl:flex-col 2xl:justify-center">
            <h3 className="mb-3 text-lg font-semibold text-stone-100">
              {formatMonthLabel(visibleMonth)}
            </h3>
            <CalendarGrid
              days={calendarDays}
              selectedDateKeys={selectedDateKeys}
              entryMap={entryMap}
              isDragging={isDragging}
              onDayClick={handleDayClick}
              onDragStart={startDragSelection}
              onDragEnter={continueDragSelection}
            />
          </div>

          <div className="hidden 2xl:block 2xl:min-w-[360px]">
            <BottomActionBar
              placement="desktop"
              visible={selectedDateKeys.length > 0}
              selectedCount={selectedDateKeys.length}
              onApplyStatus={applyStatusToSelectedDays}
              onClear={clearSelection}
            />
          </div>
        </div>
      </div>

      <BottomActionBar
        placement="mobile"
        visible={selectedDateKeys.length > 0}
        selectedCount={selectedDateKeys.length}
        onApplyStatus={applyStatusToSelectedDays}
        onClear={clearSelection}
      />
    </div>
  );
}
