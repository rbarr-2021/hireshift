import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";

const howItWorks = [
  {
    title: "Choose your side",
    body: "Join as a business hiring staff or a worker looking for shifts.",
  },
  {
    title: "Create your profile",
    body: "Add the essentials so the marketplace can match the right people fast.",
  },
  {
    title: "Move with confidence",
    body: "Use clear profiles, trust signals, and guided next steps to keep momentum.",
  },
];

const audienceCards = [
  {
    label: "For businesses",
    title: "Find reliable hospitality staff faster",
    body: "Discover workers by role, rate, and availability without recruiter friction.",
    cta: "Find Staff",
    href: "/signup",
  },
  {
    label: "For workers",
    title: "Get discovered for the shifts you want",
    body: "Build a strong profile, show your availability, and get ready for real hiring demand.",
    cta: "Find Work",
    href: "/signup",
  },
];

const trustSignals = [
  "Role-based onboarding",
  "Verified account flow",
  "Availability-first profiles",
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="public-shell pt-6 sm:pt-8">
        <section className="public-section">
          <div className="panel px-5 py-10 sm:px-8 sm:py-12 lg:px-14 lg:py-16">
            <div className="mx-auto max-w-4xl text-center">
              <p className="section-label">KruVii</p>
              <h1 className="mt-5 text-3xl font-semibold leading-tight text-stone-900 sm:text-4xl lg:text-6xl">
                Hospitality staffing, simplified.
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-stone-600 sm:text-base sm:leading-8 lg:text-lg">
                KruVii helps businesses find staff and helps workers find opportunities
                through a cleaner, faster hospitality marketplace.
              </p>

              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link href="/signup" className="primary-btn w-full px-8 sm:w-auto">
                  Find Staff
                </Link>
                <Link href="/signup" className="secondary-btn w-full px-8 sm:w-auto">
                  Find Work
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="public-section mt-8">
          <div className="grid gap-4 lg:grid-cols-3">
            {howItWorks.map((item, index) => (
              <div key={item.title} className="panel-soft p-6">
                <p className="text-xs uppercase tracking-[0.2em] text-stone-500">
                  Step {index + 1}
                </p>
                <h2 className="mt-3 text-xl font-semibold text-stone-900">
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
                <p className="mt-4 text-sm leading-7 text-stone-600">{card.body}</p>
                <Link href={card.href} className="primary-btn mt-6 w-full px-6 sm:inline-flex sm:w-auto">
                  {card.cta}
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="public-section mt-8">
          <div className="panel-soft p-7">
            <p className="section-label">Why it feels trusted</p>
            <div className="mt-5 flex flex-wrap gap-3">
              {trustSignals.map((signal) => (
                <span key={signal} className="status-badge status-badge--rating">
                  {signal}
                </span>
              ))}
            </div>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-stone-600">
              The MVP focuses on the essentials: clear onboarding, structured profiles,
              and the trust signals both sides need before booking starts.
            </p>
          </div>
        </section>

        <section className="public-section mt-8">
          <div className="panel px-5 py-8 text-center sm:px-8 sm:py-10">
            <p className="section-label">Ready to start</p>
            <h2 className="mt-4 text-2xl font-semibold text-stone-900 sm:text-3xl">
              Join KruVii and choose your path.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-stone-600">
              Whether you need staff or want work, the next step is the same:
              create your account and complete the right setup.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/signup" className="primary-btn w-full px-8 sm:w-auto">
                Create account
              </Link>
              <Link href="/login" className="secondary-btn w-full px-8 sm:w-auto">
                Log in
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
