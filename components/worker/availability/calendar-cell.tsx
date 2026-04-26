"use client";

import type { WorkerAvailabilityStatus } from "@/lib/models";

type CalendarCellProps = {
  dateKey: string;
  dayOfMonth: number;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  status?: WorkerAvailabilityStatus;
  onClick: (dateKey: string) => void;
  onDragStart: (dateKey: string) => void;
  onDragEnter: (dateKey: string) => void;
};

function dotClass(status: WorkerAvailabilityStatus) {
  if (status === "available") return "bg-[#3B82F6]";
  if (status === "partial") return "bg-[#8B5CF6]";
  return "bg-white/30";
}

function cellClass({
  status,
  isSelected,
  isToday,
}: {
  status?: WorkerAvailabilityStatus;
  isSelected: boolean;
  isToday: boolean;
}) {
  const base =
    "relative flex aspect-square w-full min-w-0 flex-col overflow-hidden rounded-[0.9rem] border p-2 text-left transition duration-150 sm:rounded-[1rem] sm:p-2.5";

  if (isSelected) {
    return `${base} border-[#8B5CF6]/80 bg-[linear-gradient(135deg,rgba(59,130,246,0.52),rgba(139,92,246,0.56))] text-white shadow-[0_0_14px_rgba(139,92,246,0.45)]`;
  }

  if (status === "available") {
    return `${base} border-[#3B82F6]/25 bg-[rgba(59,130,246,0.18)] text-stone-100`;
  }

  if (status === "partial") {
    return `${base} border-[#8B5CF6]/25 bg-[rgba(139,92,246,0.16)] text-stone-100`;
  }

  if (status === "unavailable") {
    return `${base} border-white/10 bg-white/[0.04] text-stone-400 opacity-70`;
  }

  if (isToday) {
    return `${base} border-[#8B5CF6]/70 bg-black/30 text-white shadow-[0_0_10px_rgba(139,92,246,0.5)]`;
  }

  return `${base} border-white/10 bg-black/30 text-stone-100 hover:border-[#3B82F6]/35 hover:bg-[rgba(59,130,246,0.1)]`;
}

export function CalendarCell({
  dateKey,
  dayOfMonth,
  inMonth,
  isToday,
  isSelected,
  status,
  onClick,
  onDragStart,
  onDragEnter,
}: CalendarCellProps) {
  const inactiveMonthText = inMonth || isSelected ? "" : "text-stone-500";

  return (
    <button
      type="button"
      data-date-key={dateKey}
      onClick={() => onClick(dateKey)}
      onPointerDown={(event) => {
        if (event.button !== 0 && event.pointerType !== "touch") {
          return;
        }

        onDragStart(dateKey);
      }}
      onPointerEnter={() => onDragEnter(dateKey)}
      className={cellClass({ status, isSelected, isToday })}
    >
      <span
        className={`text-sm font-semibold leading-none sm:text-base ${inactiveMonthText}`}
      >
        {dayOfMonth}
      </span>
      {status ? (
        <span className="mt-auto inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.08em] text-stone-200/85">
          <span className={`h-2 w-2 rounded-full ${dotClass(status)}`} />
          <span className="sr-only">
            {status === "available"
              ? "Available"
              : status === "partial"
                ? "Partially available"
                : "Unavailable"}
          </span>
        </span>
      ) : null}
      {isToday ? <span className="sr-only">(Today)</span> : null}
    </button>
  );
}
