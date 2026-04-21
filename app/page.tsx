import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";

const simpleSteps = [
  {
    title: "Businesses post shifts",
    body: "List the cover you need and keep bookings in one place.",
  },
  {
    title: "Workers take the right shifts",
    body: "Browse live hospitality work and accept shifts quickly.",
  },
  {
    title: "KruVii tracks the flow",
    body: "Bookings, completion, and payout stay clear for both sides.",
  },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="public-shell pt-6 sm:pt-8">
        <section className="public-section">
          <div className="panel px-5 py-10 sm:px-8 sm:py-12 lg:px-14 lg:py-16">
            <div className="mx-auto max-w-4xl">
              <p className="section-label">KruVii</p>
              <h1 className="mt-5 text-3xl font-semibold leading-tight text-stone-900 sm:text-5xl lg:text-6xl">
                Hospitality staffing, kept simple.
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-stone-600 sm:text-base sm:leading-8">
                KruVii helps businesses book hospitality staff and helps workers find
                shifts without the usual back-and-forth. Everything stays clear from
                booking through to completion and payout.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/signup?role=worker" className="primary-btn w-full px-8 sm:w-auto">
                  Find Shifts
                </Link>
                <Link href="/signup?role=business" className="secondary-btn w-full px-8 sm:w-auto">
                  Book Staff
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="public-section mt-8">
          <div className="grid gap-4 lg:grid-cols-3">
            {simpleSteps.map((step) => (
              <div key={step.title} className="panel-soft p-5 sm:p-6">
                <h2 className="text-xl font-semibold text-stone-900">{step.title}</h2>
                <p className="mt-3 text-sm leading-7 text-stone-600">{step.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
