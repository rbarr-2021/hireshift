export function Skeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-[linear-gradient(90deg,rgba(16,31,52,0.92),rgba(16,215,255,0.12),rgba(16,31,52,0.92))] bg-[length:220%_100%] ${className ?? ""}`}
    />
  );
}
