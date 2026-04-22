"use client";

import { deriveShiftEndDate } from "@/lib/shift-listings";

type ShiftTimeRangePickerProps = {
  startTime: string;
  endTime: string;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hours = String(Math.floor(index / 2)).padStart(2, "0");
  const minutes = index % 2 === 0 ? "00" : "30";
  const value = `${hours}:${minutes}`;

  return {
    value,
    label: value,
  };
});

export function ShiftTimeRangePicker({
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
  disabled = false,
  className = "",
}: ShiftTimeRangePickerProps) {
  const isOvernight = Boolean(startTime && endTime && endTime <= startTime);
  const helperDate = "2026-01-01";
  const shiftEndDate = deriveShiftEndDate(helperDate, startTime, endTime);

  return (
    <div className={`space-y-3 ${className}`.trim()}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 space-y-2 text-sm text-stone-600">
          <span className="font-medium text-stone-900">Start time</span>
          <select
            value={startTime}
            onChange={(event) => onStartTimeChange(event.target.value)}
            className="input"
            disabled={disabled}
          >
            {TIME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1 space-y-2 text-sm text-stone-600">
          <span className="font-medium text-stone-900">End time</span>
          <select
            value={endTime}
            onChange={(event) => onEndTimeChange(event.target.value)}
            className="input"
            disabled={disabled}
          >
            {TIME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-stone-500">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-stone-100">
            {startTime} {"->"} {endTime}
          </span>
          {shiftEndDate > helperDate ? (
            <span className="status-badge status-badge--rating">Ends next day</span>
          ) : null}
        </div>
        <p className="mt-2 text-xs leading-5">
          {isOvernight
            ? "This will be treated as an overnight shift and saved as ending the next day."
            : "Choose a start time and finish time directly."}
        </p>
      </div>
    </div>
  );
}
