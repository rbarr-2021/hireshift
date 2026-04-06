import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-stone-100 px-4 py-10 text-stone-900 lg:px-6">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,420px)]">
        <section className="rounded-[2rem] bg-stone-900 px-8 py-10 text-white shadow-sm lg:px-12 lg:py-14">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-amber-300">
            Hospitality Staffing Marketplace
          </p>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight lg:text-6xl">
            Direct temporary shift booking for hospitality teams.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-stone-300">
            HireShift connects restaurants, bars, hotels, and event teams with
            ready-to-book chefs, bartenders, servers, and support staff without
            recruiters or subscriptions.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/signup" className="rounded-full bg-amber-400 px-6 py-3 text-sm font-semibold text-stone-900 transition hover:bg-amber-300">
              Create account
            </Link>
            <Link href="/login" className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
              Log in
            </Link>
            <Link href="/dashboard" className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
              Open dashboard
            </Link>
          </div>
        </section>

        <section className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-stone-500">
            Phase 1 Included
          </p>
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl bg-stone-100 p-4">
              <h2 className="text-lg font-semibold">Authentication</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Email/password sign-up and sign-in powered by Supabase Auth.
              </p>
            </div>
            <div className="rounded-2xl bg-stone-100 p-4">
              <h2 className="text-lg font-semibold">Role-driven onboarding</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Worker and business users choose their path and complete a tailored setup flow.
              </p>
            </div>
            <div className="rounded-2xl bg-stone-100 p-4">
              <h2 className="text-lg font-semibold">Protected dashboard shell</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Authenticated users land in a role-aware dashboard foundation for later booking, payments, and reviews work.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
