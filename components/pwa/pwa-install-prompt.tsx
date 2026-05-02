"use client";

import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

const DISMISS_KEY = "nexhyr_install_prompt_dismissed";
const MOBILE_TABLET_MAX_WIDTH = 1024;

export function PwaInstallPrompt() {
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [isStandalone, setIsStandalone] = useState(true);
  const [isIos, setIsIos] = useState(false);
  const [isMobileOrTabletViewport, setIsMobileOrTabletViewport] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsStandalone(isStandaloneMode());
    setIsDismissed(window.localStorage.getItem(DISMISS_KEY) === "true");

    const ua = window.navigator.userAgent || "";
    const ios = /iPhone|iPad|iPod/i.test(ua);
    setIsIos(ios);
    setIsMobileOrTabletViewport(window.innerWidth <= MOBILE_TABLET_MAX_WIDTH);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setIsStandalone(true);
      setInstallPromptEvent(null);
    };

    const onResize = () => {
      setIsMobileOrTabletViewport(window.innerWidth <= MOBILE_TABLET_MAX_WIDTH);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const showAndroidInstall = useMemo(
    () =>
      Boolean(
        isMobileOrTabletViewport &&
          !isIos &&
          !isStandalone &&
          !isDismissed &&
          installPromptEvent,
      ),
    [installPromptEvent, isDismissed, isIos, isMobileOrTabletViewport, isStandalone],
  );

  const showIosHint = useMemo(
    () =>
      Boolean(
        isMobileOrTabletViewport && isIos && !isStandalone && !isDismissed,
      ),
    [isDismissed, isIos, isMobileOrTabletViewport, isStandalone],
  );

  const onInstall = async () => {
    if (!installPromptEvent) return;
    await installPromptEvent.prompt();
    await installPromptEvent.userChoice.catch(() => null);
    setInstallPromptEvent(null);
  };

  const onDismiss = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, "true");
    }
    setIsDismissed(true);
  };

  if (!showAndroidInstall && !showIosHint) return null;

  return (
    <div className="fixed bottom-24 left-4 right-4 z-40 sm:left-auto sm:right-6 sm:w-[360px]">
      <div className="rounded-2xl border border-white/15 bg-slate-900/95 p-3 text-sm text-slate-100 shadow-xl backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold">Install NexHyr</p>
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs font-semibold text-slate-300 underline hover:text-white"
          >
            Dismiss
          </button>
        </div>
        {showAndroidInstall ? (
          <>
            <p className="mt-1 text-slate-300">Add NexHyr to your home screen for quick access.</p>
            <button
              type="button"
              onClick={onInstall}
              className="mt-3 w-full rounded-xl bg-gradient-to-r from-sky-500 to-violet-500 px-3 py-2 font-semibold text-white"
            >
              Install NexHyr
            </button>
          </>
        ) : (
          <p className="mt-1 text-slate-300">
            Add NexHyr to your home screen for quick access. Tap Share then Add to Home Screen.
          </p>
        )}
      </div>
    </div>
  );
}
