import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { CURRENT_TERMS_VERSION } from "@/lib/legal";

export default function TermsPage() {
  return (
    <>
      <SiteHeader compact />
      <main className="public-shell py-10">
        <section className="panel mx-auto w-full max-w-4xl p-6 sm:p-8">
          <p className="section-label">Legal</p>
          <h1 className="mt-4 text-2xl font-semibold text-stone-900 sm:text-3xl">
            NexHyr Terms & Conditions
          </h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            These terms are an MVP draft and should be reviewed by your solicitor before launch.
          </p>

          <div className="mt-8 space-y-6 text-sm leading-6 text-stone-700">
            <section>
              <h2 className="text-base font-semibold text-stone-900">1. Platform role</h2>
              <p>
                NexHyr is a staffing marketplace that helps businesses find workers for shift-based
                hospitality roles. NexHyr is not the employer of workers unless explicitly stated.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-stone-900">2. Worker responsibilities</h2>
              <p>
                Workers must keep profile details accurate, attend accepted shifts on time, complete
                work professionally, and follow venue health, safety, and conduct expectations.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-stone-900">3. Business responsibilities</h2>
              <p>
                Businesses must post accurate shift details, provide clear arrival instructions,
                confirm attendance and approved hours fairly, and treat workers professionally.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-stone-900">4. Payments and platform fees</h2>
              <p>
                Businesses pay through NexHyr. Platform fees may apply. Worker payouts are released
                after shift completion and approved hours, subject to payment and risk checks.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-stone-900">5. Approved hours and settlement</h2>
              <p>
                Final settlement is based on approved hours. Under-hours may create refunds. Over-hours
                may require top-up payment before full payout release.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-stone-900">6. Cancellations</h2>
              <p>
                Late cancellations and no-shows may affect reliability status and platform access.
                Charges or penalties may apply under future policy updates.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-stone-900">7. Disputes</h2>
              <p>
                Disputes can pause payout while reviewed. NexHyr may request evidence and apply a
                platform decision to protect both sides.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-stone-900">8. Non-circumvention</h2>
              <p>
                Businesses must not bypass NexHyr by directly engaging, hiring, or arranging work with
                workers introduced through NexHyr outside the platform for a defined period, unless
                agreed in writing by NexHyr.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-stone-900">9. Account suspension</h2>
              <p>
                NexHyr may suspend or restrict accounts for fraud risk, policy breaches, safety concerns,
                payment abuse, or repeated reliability issues.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-stone-900">10. Limitation of liability</h2>
              <p>
                NexHyr provides marketplace technology and is not liable for indirect or consequential
                losses. Liability limits apply to the extent permitted by law.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-stone-900">11. Contact</h2>
              <p>
                For legal queries, contact:{" "}
                <a className="underline" href="mailto:hello@nexhyr.co.uk">
                  hello@nexhyr.co.uk
                </a>
              </p>
            </section>
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-stone-400">
            <p>Version: {CURRENT_TERMS_VERSION}</p>
            <p>Last updated: 30 April 2026</p>
            <p className="mt-2">
              Internal compliance note: final Terms and operating model should be reviewed before live
              launch. Employment business/agency obligations and Key Information Document requirements
              may apply depending on legal structure.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
