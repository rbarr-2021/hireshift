import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";

const audienceCards = [
  {
    label: "For businesses",
    title: "Book hospitality staff fast",
    body: "Browse workers, check profiles, send the shift, and pay cleanly.",
    cta: "Find staff",
    href: "/signup",
  },
  {
    label: "For workers",
    title: "Get seen for the right shifts",
    body: "Build your profile, set availability, and start getting booked.",
    cta: "Find work",
    href: "/signup",
  },
];

const proofPoints = [
  "Structured roles",
  "Clear availability",
  "Secure booking flow",
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
                  Hospitality staffing that moves at service speed.
                </h1>
                <p className="mt-5 max-w-2xl text-sm leading-7 text-stone-600 sm:text-base sm:leading-8">
                  Find staff, fill shifts, and manage bookings without the usual back-and-forth.
                </p>
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/signup" className="primary-btn w-full px-8 sm:w-auto">
                  Create account
                </Link>
                <Link href="/login" className="secondary-btn w-full px-8 sm:w-auto">
                  Log in
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
          <div className="panel px-5 py-8 text-center sm:px-8 sm:py-10">
            <h2 className="text-2xl font-semibold text-stone-900 sm:text-3xl">
              Get started in minutes.
            </h2>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/signup" className="primary-btn w-full px-8 sm:w-auto">
                Join KruVii
              </Link>
              <Link href="/dashboard/business/discover" className="secondary-btn w-full px-8 sm:w-auto">
                Explore marketplace
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
