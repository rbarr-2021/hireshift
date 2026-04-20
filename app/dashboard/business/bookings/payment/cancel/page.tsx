import Link from "next/link";

export default async function BusinessPaymentCancelPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="mobile-empty-state">
      <h1 className="text-2xl font-semibold text-stone-900">Payment not completed</h1>
      <p className="mt-3 text-sm leading-6 text-stone-600">
        No charge was confirmed. You can return and pay for the booking whenever you&apos;re ready.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {params.booking ? (
          <Link
            href={`/dashboard/business/bookings/${params.booking}/pay`}
            className="primary-btn px-6"
          >
            Return to payment
          </Link>
        ) : null}
        <Link href="/dashboard/business" className="secondary-btn px-6">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

