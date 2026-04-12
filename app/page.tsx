import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";

const highlights = [
  "Direct staffing bookings with no recruiter overhead",
  "Worker and business onboarding tailored to each side",
  "Profile, availability, and trust signals built for fast hiring",
];

const metrics = [
  { label: "Response-first UX", value: "Mobile" },
  { label: "Role-aware flows", value: "2-sided" },
  { label: "Marketplace readiness", value: "MVP+" },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="public-shell pt-8">
        <section className="public-section grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_420px]">
          <div className="panel overflow-hidden px-8 py-10 lg:px-12 lg:py-14">
            <div className="status-badge status-badge--rating">
              KruVo marketplace for premium hospitality crews
            </div>
            <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-tight text-stone-900 lg:text-6xl">
              Book trusted hospitality crew with speed, clarity, and neon-clean confidence.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-stone-600">
              KruVo helps restaurants, bars, hotels, and event teams discover
              skilled workers, review availability, and move toward booking
              without noise, recruiter churn, or bloated workflows.
            </p>

            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/signup" className="primary-btn px-6">
                Start on KruVo
              </Link>
              <Link href="/login" className="secondary-btn px-6">
                Log in
              </Link>
              <Link href="/dashboard" className="secondary-btn px-6">
                Open dashboard
              </Link>
            </div>

            <div className="mt-10 grid gap-3 md:grid-cols-3">
              {metrics.map((metric) => (
                <div key={metric.label} className="panel-soft p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-stone-500">
                    {metric.label}
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-stone-900">
                    {metric.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <aside className="panel px-6 py-8 lg:px-8">
            <p className="section-label">Why KruVo</p>
            <div className="mt-6 space-y-4">
              {highlights.map((item, index) => (
                <div key={item} className="panel-soft p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-stone-500">
                    0{index + 1}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-stone-600">{item}</p>
                </div>
              ))}
            </div>

            <div className="info-banner mt-6">
              Businesses get cleaner discovery and stronger trust signals.
              Workers get a sharper profile, better visibility, and a clearer next step.
            </div>
          </aside>
        </section>
      </main>
    </>
  );
}
