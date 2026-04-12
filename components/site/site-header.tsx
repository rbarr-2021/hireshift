import Link from "next/link";

type SiteHeaderProps = {
  compact?: boolean;
};

export function SiteHeader({ compact = false }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-black/72 backdrop-blur-xl">
      <div className="public-section flex items-center justify-between gap-4 py-4">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-stone-100 text-lg font-semibold text-stone-900">
            K
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-500">
              KruVo
            </p>
            <p className="text-sm text-stone-600">
              Hospitality crew marketplace
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          <Link href="/login" className="secondary-btn px-5">
            Log in
          </Link>
          <Link href="/signup" className="primary-btn px-5">
            {compact ? "Join KruVo" : "Create account"}
          </Link>
        </nav>
      </div>
    </header>
  );
}
