import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";

const audienceCards = [
  {
    label: "For businesses",
    title: "Book vetted staff with payout control",
    body: "Browse workers, lock in the right shift cover, and approve payout only after the work is done.",
    cta: "Book Staff",
    href: "/signup?role=business",
  },
  {
    label: "For workers",
    title: "Find shifts and get paid fast",
    body: "Pick up hospitality work, complete the shift, and move through a clean payout flow without chasing agencies.",
    cta: "Find Shifts",
    href: "/signup?role=worker",
  },
];

const proofPoints = ["Fast payout", "Structured bookings", "Clear approval flow"];

const payoutSteps = [
  {
    step: "1",
    title: "Book or accept",
    body: "Businesses book quickly and workers lock in the right shift.",
  },
  {
    step: "2",
    title: "Work the shift",
    body: "Everything stays tracked in one booking record.",
  },
  {
    step: "3",
    title: "Confirm completion",
    body: "Completion is approved before payout is released.",
  },
  {
    step: "4",
    title: "Get paid fast",
    body: "Workers see payout status clearly instead of chasing timesheets.",
  },
];

const benefitColumns = [
  {
    label: "Workers",
    title: "Flexible shifts with fast payout",
    points: [
      "See real shifts and pick up work quickly.",
      "Track booking, completion, and payout in one place.",
      "No chasing agencies for updates.",
    ],
  },
  {
    label: "Businesses",
    title: "Clear staffing with approval before release",
    points: [
      "Book trusted staff without messy back-and-forth.",
      "Keep a clean record of bookings, attendance, and pay.",
      "Approve payout only after the shift is confirmed.",
    ],
  },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="public-shell pt-6 sm:pt-8">
        <section className="public-section">
          <div className="panel px-5 py-10 sm:px-8 sm:py-12 lg:px-14 lg:py-16">
            <div className="mx-auto max-w-5xl">
              <div className="max-w-3xl">
                <p className="section-label">KruVii</p>
                <h1 className="mt-5 text-3xl font-semibold leading-tight text-stone-900 sm:text-5xl lg:text-6xl">
                  Get paid directly after your shift ends.
                </h1>
                <p className="mt-5 max-w-2xl text-sm leading-7 text-stone-600 sm:text-base sm:leading-8">
                  Flexible hospitality shifts with fast payout for workers and cleaner booking control for businesses. Payment is released after shift completion is confirmed.
                </p>
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/signup?role=worker" className="primary-btn w-full px-8 sm:w-auto">
                  Find Shifts
                </Link>
                <Link href="/signup?role=business" className="secondary-btn w-full px-8 sm:w-auto">
                  Book Staff
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                {proofPoints.map((point) => (
                  <span key={point} className="status-badge status-badge--rating">
                    {point}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="public-section mt-8">
          <div className="grid gap-4 lg:grid-cols-4">
            {payoutSteps.map((item) => (
              <div key={item.step} className="panel-soft p-5 sm:p-6">
                <p className="text-xs uppercase tracking-[0.2em] text-stone-500">
                  Step {item.step}
                </p>
                <h2 className="mt-4 text-xl font-semibold text-stone-900">
                  {item.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-stone-600">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="public-section mt-8">
          <div className="grid gap-4 lg:grid-cols-2">
            {audienceCards.map((card) => (
              <div key={card.label} className="panel-soft p-5 sm:p-7">
                <p className="text-xs uppercase tracking-[0.2em] text-stone-500">
                  {card.label}
                </p>
                <h2 className="mt-4 text-2xl font-semibold text-stone-900">
                  {card.title}
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-7 text-stone-600">
                  {card.body}
                </p>
                <Link
                  href={card.href}
                  className="primary-btn mt-6 w-full px-6 sm:inline-flex sm:w-auto"
                >
                  {card.cta}
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="public-section mt-8">
          <div className="panel-soft p-5 sm:p-7">
            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <p className="section-label">How payout works</p>
                <h2 className="mt-4 text-2xl font-semibold text-stone-900 sm:text-3xl">
                  Fast payout, with the right checks in place.
                </h2>
              </div>
              <div className="space-y-3 text-sm leading-7 text-stone-600 sm:text-base">
                <p>Workers accept shifts. Businesses get the cover they need.</p>
                <p>The shift is completed, then confirmed before payout is released.</p>
                <p>That keeps the process fast for workers and protected for businesses if an issue needs to be flagged.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="public-section mt-8">
          <div className="grid gap-4 lg:grid-cols-2">
            {benefitColumns.map((column) => (
              <div key={column.label} className="panel-soft p-5 sm:p-7">
                <p className="text-xs uppercase tracking-[0.2em] text-stone-500">
                  {column.label}
                </p>
                <h2 className="mt-4 text-2xl font-semibold text-stone-900">
                  {column.title}
                </h2>
                <div className="mt-4 space-y-3 text-sm leading-7 text-stone-600">
                  {column.points.map((point) => (
                    <p key={point}>{point}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="public-section mt-8">
          <div className="panel px-5 py-8 text-center sm:px-8 sm:py-10">
            <h2 className="text-2xl font-semibold text-stone-900 sm:text-3xl">
              Move from booking to confirmed payout without the usual admin drag.
            </h2>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/signup?role=worker" className="primary-btn w-full px-8 sm:w-auto">
                Find Shifts
              </Link>
              <Link href="/dashboard/business/discover" className="secondary-btn w-full px-8 sm:w-auto">
                Book Staff
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
