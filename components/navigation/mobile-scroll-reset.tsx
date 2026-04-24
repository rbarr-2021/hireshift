"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const MOBILE_BREAKPOINT_PX = 768;

export function MobileScrollReset() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.innerWidth >= MOBILE_BREAKPOINT_PX) {
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, searchParams]);

  return null;
}
