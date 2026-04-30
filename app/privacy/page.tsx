import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { CURRENT_PRIVACY_VERSION } from "@/lib/legal";

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader compact />
      <main className="public-shell py-10">
        <section className="panel mx-auto w-full max-w-4xl p-6 sm:p-8">
          <p className="section-label">Legal</p>
          <h1 className="mt-4 text-2xl font-semibold text-stone-900 sm:text-3xl">
            NexHyr Privacy Policy
          </h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            This privacy policy is an MVP draft and should be reviewed by your solicitor before launch.
          </p>

          <div className="mt-8 space-y-6 text-sm leading-6 text-stone-700">
            <section>
              <h2 className="text-base font-semibold text-stone-900">1. Data we collect</h2>
              <p>
                We collect account details, profile information, booking and attendance data, payment
                references, messages, and operational activity needed to run NexHyr safely.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-stone-900">2. Why we collect it</h2>
              <p>
                We use data to provide marketplace access, match workers and businesses, manage bookings,
                support payments, prevent fraud, and provide customer support.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-stone-900">3. How data is used</h2>
              <p>
                Data is used for account setup, role-based access, booking operations, attendance approval,
                payout processing, notifications, and service improvement.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-stone-900">4. Sharing</h2>
              <p>
                We may share data with trusted processors (for example hosting, payments, email delivery),
                and with relevant users where required to operate a shift booking.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-stone-900">5. Retention</h2>
              <p>
                We keep data for as long as needed for operational, legal, accounting, and dispute-handling
                reasons, then remove or anonymise when appropriate.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-stone-900">6. Your rights</h2>
              <p>
                You may request access, correction, or deletion of personal data, subject to legal or
                operational retention obligations.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-stone-900">7. Cookies and analytics</h2>
              <p>
                NexHyr may use essential cookies/session storage for login and security, and basic analytics
                for product performance where enabled.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-stone-900">8. Contact</h2>
              <p>
                For privacy requests, contact:{" "}
                <a className="underline" href="mailto:hello@nexhyr.co.uk">
                  hello@nexhyr.co.uk
                </a>
              </p>
            </section>
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-stone-400">
            <p>Version: {CURRENT_PRIVACY_VERSION}</p>
            <p>Last updated: 30 April 2026</p>
            <p className="mt-2">
              Internal compliance note: final privacy wording and regulatory obligations should be
              reviewed before launch.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
