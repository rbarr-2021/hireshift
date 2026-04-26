"use client";

type MultiSelectToggleProps = {
  enabled: boolean;
  onToggle: () => void;
};

export function MultiSelectToggle({ enabled, onToggle }: MultiSelectToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onToggle}
      className={`group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[1rem] px-4 py-3 text-sm font-semibold transition duration-200 ease-out sm:w-auto ${
        enabled
          ? "border border-white/20 bg-[linear-gradient(135deg,#3B82F6,#8B5CF6)] text-white shadow-[0_0_20px_rgba(139,92,246,0.35)]"
          : "border border-white/15 bg-black/25 text-stone-200 hover:scale-[1.02] hover:border-[#8B5CF6]/45 hover:shadow-[0_0_20px_rgba(139,92,246,0.25)]"
      }`}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 flex-none">
        <rect x="2.3" y="3" width="6.2" height="6.2" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <rect x="11.5" y="3" width="6.2" height="6.2" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <rect x="2.3" y="10.7" width="6.2" height="6.2" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="m12.6 14 1.9 1.9 3.2-3.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
      <span>{enabled ? "Multi-select On" : "Multi-select"}</span>
    </button>
  );
}

