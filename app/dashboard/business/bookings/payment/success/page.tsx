import Link from "next/link";

export default async function BusinessPaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="mobile-empty-state">
      <h1 className="text-2xl font-semibold text-stone-900">Payment received</h1>
      <p className="mt-3 text-sm leading-6 text-stone-600">
        Stripe has your payment. We&apos;re updating the booking status now.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {params.booking ? (
          <Link
            href={`/dashboard/business/bookings/${params.booking}/pay`}
            className="secondary-btn px-6"
          >
            View booking
          </Link>
        ) : null}
        <Link href="/dashboard/business" className="primary-btn px-6">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

