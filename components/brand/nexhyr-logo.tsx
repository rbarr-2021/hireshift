type NexHyrLogoProps = {
  variant?: "full" | "mark";
  className?: string;
  markClassName?: string;
  textClassName?: string;
  label?: string;
};

export function NexHyrLogo({
  variant = "full",
  className,
  markClassName,
  textClassName,
  label = "NexHyr",
}: NexHyrLogoProps) {
  const join = (...values: Array<string | undefined>) =>
    values.filter((value) => Boolean(value)).join(" ");

  return (
    <span
      className={join("inline-flex items-center gap-2.5", className)}
      aria-label={label}
    >
      <span
        className={join(
          "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-[rgba(11,18,32,0.88)] shadow-[0_10px_28px_rgba(56,189,248,0.24)]",
          markClassName,
        )}
      >
        <svg
          viewBox="0 0 80 80"
          aria-hidden="true"
          className="h-7 w-7"
          role="img"
        >
          <defs>
            <linearGradient id="nexhyr-logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="55%" stopColor="#3B82F6" />
              <stop offset="100%" stopColor="#8B5CF6" />
            </linearGradient>
          </defs>
          <path
            d="M10 12v56l20-17-6-6-8 7V28l35 30V32l-9 7-6-6 23-21v56L10 12z"
            fill="url(#nexhyr-logo-gradient)"
          />
        </svg>
      </span>
      {variant === "full" ? (
        <span
          className={join(
            "text-xl font-semibold tracking-tight text-stone-100",
            textClassName,
          )}
        >
          <span className="text-white">Nex</span>
          <span className="bg-[linear-gradient(135deg,#38BDF8,#3B82F6,#8B5CF6)] bg-clip-text text-transparent">
            Hyr
          </span>
        </span>
      ) : null}
    </span>
  );
}
