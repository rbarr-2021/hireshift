import Link from "next/link";
import { NexHyrLogo } from "@/components/brand/nexhyr-logo";

export function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-white/10 bg-[rgba(2,6,23,0.72)]">
      <div className="public-section flex flex-col gap-5 px-4 py-6 sm:px-0 sm:py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <NexHyrLogo />
          <p className="text-xs uppercase tracking-[0.18em] text-[#BFDBFE]">
            Smarter Hiring. Better Hospitality.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-stone-400">
          <Link href="/signup?role=worker" className="hover:text-stone-100">
            Find Shift
          </Link>
          <Link href="/signup?role=business" className="hover:text-stone-100">
            Book Staff
          </Link>
          <Link href="/terms" className="hover:text-stone-100">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-stone-100">
            Privacy
          </Link>
          <span className="text-stone-500">© {new Date().getFullYear()} NexHyr</span>
        </div>
      </div>
    </footer>
  );
}
