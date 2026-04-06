export default function BusinessDashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">
          Business Dashboard
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-stone-900">
          Your hiring workspace is in place
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          Phase 1 sets up secure entry, role-specific onboarding, and the
          underlying booking, payments, and reviews schema for the marketplace.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-3xl bg-stone-100 p-5">
          <p className="text-sm font-medium text-stone-500">Business profile</p>
          <p className="mt-2 text-2xl font-semibold text-stone-900">Set up</p>
          <p className="mt-2 text-sm text-stone-600">
            Capture venue details, address, sector, and contact info.
          </p>
        </section>
        <section className="rounded-3xl bg-stone-100 p-5">
          <p className="text-sm font-medium text-stone-500">Search and booking</p>
          <p className="mt-2 text-2xl font-semibold text-stone-900">Phase 2</p>
          <p className="mt-2 text-sm text-stone-600">
            Worker search, booking flow, and shift management are the next MVP
            build-out.
          </p>
        </section>
        <section className="rounded-3xl bg-stone-100 p-5">
          <p className="text-sm font-medium text-stone-500">Payments</p>
          <p className="mt-2 text-2xl font-semibold text-stone-900">Schema ready</p>
          <p className="mt-2 text-sm text-stone-600">
            The payments table is ready for Stripe Connect charge and payout
            integration in the next phase.
          </p>
        </section>
      </div>
    </div>
  );
}
