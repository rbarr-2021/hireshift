"use client";

import type { WorkerAvailabilityStatus } from "@/lib/models";

type BottomActionBarProps = {
  selectedCount: number;
  visible: boolean;
  onApplyStatus: (status: WorkerAvailabilityStatus) => void;
  onClear: () => void;
  placement?: "mobile" | "desktop";
};

function actionClass(status: WorkerAvailabilityStatus) {
  if (status === "available") {
    return "border-[#3B82F6]/50 bg-[rgba(59,130,246,0.2)] text-[#DBEAFF] hover:bg-[rgba(59,130,246,0.3)]";
  }

  if (status === "partial") {
    return "border-[#8B5CF6]/50 bg-[rgba(139,92,246,0.2)] text-[#EFE4FF] hover:bg-[rgba(139,92,246,0.3)]";
  }

  return "border-white/20 bg-white/[0.08] text-stone-200 hover:bg-white/[0.14]";
}

export function BottomActionBar({
  selectedCount,
  visible,
  onApplyStatus,
  onClear,
  placement = "mobile",
}: BottomActionBarProps) {
  if (placement === "desktop") {
    if (!visible) {
      return (
        <aside className="rounded-[1.5rem] border border-white/10 bg-[rgba(8,14,27,0.78)] p-6 text-sm text-stone-500 shadow-[0_16px_36px_rgba(0,0,0,0.26)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
            Set availability
          </p>
          <p className="mt-3 leading-6">
            Select one or more days to set availability.
          </p>
          <p className="mt-1 leading-6">
            The action panel updates instantly as you select.
          </p>
        </aside>
      );
    }

    return (
      <aside className="rounded-[1.5rem] border border-white/10 bg-[rgba(8,14,27,0.92)] p-6 shadow-[0_18px_42px_rgba(0,0,0,0.3)]">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
          Set availability
        </p>
        <p className="mt-3 text-sm text-stone-200">
          Apply to {selectedCount} {selectedCount === 1 ? "day" : "days"}
        </p>
        <div className="mt-5 space-y-2.5">
          <button type="button" onClick={() => onApplyStatus("available")} className={`w-full rounded-xl border px-3 py-3 text-sm font-semibold transition ${actionClass("available")}`}>
            Available
          </button>
          <button type="button" onClick={() => onApplyStatus("partial")} className={`w-full rounded-xl border px-3 py-3 text-sm font-semibold transition ${actionClass("partial")}`}>
            Partial
          </button>
          <button type="button" onClick={() => onApplyStatus("unavailable")} className={`w-full rounded-xl border px-3 py-3 text-sm font-semibold transition ${actionClass("unavailable")}`}>
            Unavailable
          </button>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="mt-3 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-stone-300 transition hover:border-[#8B5CF6]/45 hover:text-stone-100"
        >
          Clear selection
        </button>
      </aside>
    );
  }

  return (
    <div
      className={`fixed inset-x-3 z-50 rounded-[1.35rem] border border-white/10 bg-[rgba(8,14,27,0.94)] p-3 shadow-[0_20px_42px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-all duration-200 sm:hidden ${
        visible ? "bottom-20 translate-y-0 opacity-100" : "pointer-events-none -bottom-8 translate-y-8 opacity-0"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
        Set availability
      </p>
      <p className="mt-1 text-sm text-stone-200">
        {selectedCount} {selectedCount === 1 ? "day selected" : "days selected"}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button type="button" onClick={() => onApplyStatus("available")} className={`rounded-xl border px-2 py-2.5 text-xs font-semibold transition ${actionClass("available")}`}>
          Available
        </button>
        <button type="button" onClick={() => onApplyStatus("partial")} className={`rounded-xl border px-2 py-2.5 text-xs font-semibold transition ${actionClass("partial")}`}>
          Partial
        </button>
        <button type="button" onClick={() => onApplyStatus("unavailable")} className={`rounded-xl border px-2 py-2.5 text-xs font-semibold transition ${actionClass("unavailable")}`}>
          Unavailable
        </button>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-300 transition hover:border-[#8B5CF6]/45 hover:text-stone-100"
      >
        Clear selection
      </button>
    </div>
  );
}
