import Link from "next/link";
import type { UserRole } from "@/lib/models";

type OnboardingProgressProps = {
  role?: UserRole | null;
  step: "role" | "profile" | "ready";
};

const stepOrder = ["role", "profile", "ready"] as const;

function stepStatus(current: OnboardingProgressProps["step"], item: typeof stepOrder[number]) {
  const currentIndex = stepOrder.indexOf(current);
  const itemIndex = stepOrder.indexOf(item);

  if (itemIndex < currentIndex) return "complete";
  if (itemIndex === currentIndex) return "current";
  return "upcoming";
}

export function OnboardingProgress({ role, step }: OnboardingProgressProps) {
  const profileHref =
    role === "business" ? "/profile/setup/business" : "/profile/setup/worker";
  const dashboardHref =
    role === "business" ? "/dashboard/business" : "/dashboard/worker";

  const items = [
    { key: "role", label: "Choose role", href: "/role-select" },
    { key: "profile", label: role === "business" ? "Venue setup" : "Crew profile", href: profileHref },
    { key: "ready", label: "Dashboard ready", href: dashboardHref },
  ] as const;

  return (
    <div className="panel-soft mb-6 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Onboarding progress</p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {items.map((item, index) => {
          const status = stepStatus(step, item.key);
          return (
            <Link key={item.key} href={item.href} className="rounded-2xl border border-white/5 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Step {index + 1}</p>
              <p className="mt-2 font-semibold text-stone-900">{item.label}</p>
              <span
                className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
                  status === "complete"
                    ? "status-badge status-badge--ready"
                    : status === "current"
                      ? "status-badge status-badge--rating"
                      : "status-badge"
                }`}
              >
                {status === "complete" ? "Done" : status === "current" ? "Current" : "Next"}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
