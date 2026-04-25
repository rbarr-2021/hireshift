import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="public-shell pt-6 sm:pt-8">
        <section className="public-section sm:hidden">
          <div className="panel px-4 py-6">
            <div className="mx-auto max-w-md">
              <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(12,22,40,0.96),rgba(7,15,28,0.98))] px-5 py-5 shadow-[0_20px_50px_rgba(0,0,0,0.32)]">
                <div className="max-w-[16rem]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#67B7FF]">
                    KruVii
                  </p>
                  <p className="display-headline mt-2.5 text-[2.45rem] leading-[0.9] text-stone-900">
                    Work on your terms.
                  </p>
                  <p className="mt-1.5 text-lg font-medium leading-6 text-stone-200">
                    Fast shifts. Real venues. Clear pay flow.
                  </p>
                </div>

                <div className="mt-4 overflow-hidden rounded-[1.6rem] border border-white/8 bg-[#07111f] shadow-[0_16px_34px_rgba(0,0,0,0.24)]">
                  <div className="relative">
                    <Image
                      src="/hero-mobile-kruvii-wide.png"
                      alt="Modern hospitality service scene showing fast-paced shift work and staffing coordination"
                      width={720}
                      height={520}
                      className="h-44 w-full object-cover object-center"
                      priority
                    />
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(6,11,23,0.06),rgba(6,11,23,0.22)_70%,rgba(6,11,23,0.34))]" />
                  </div>
                </div>

                <div className="mt-4 space-y-1.5">
                  <p className="text-sm leading-6 text-stone-300">
                    Hospitality shifts for workers. Reliable cover for venues.
                  </p>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#9BD0FF]">
                    Fast payout after confirmed shifts
                  </p>
                </div>

                <div className="mt-5 grid gap-2.5">
                  <Link href="/signup?role=worker" className="primary-btn w-full px-8">
                    Find Shift
                  </Link>
                  <Link
                    href="/signup?role=business"
                    className="secondary-btn w-full border-[rgba(95,184,255,0.24)] bg-transparent px-8"
                  >
                    Book Staff
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="public-section hidden sm:block">
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

        <section className="public-section mt-8 hidden sm:block">
          <div className="grid gap-4 lg:grid-cols-3">
            {[
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
            ].map((step) => (
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
