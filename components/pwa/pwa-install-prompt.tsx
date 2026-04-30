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

export function PwaInstallPrompt() {
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [isStandalone, setIsStandalone] = useState(true);
  const [isIos, setIsIos] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsStandalone(isStandaloneMode());

    const ua = window.navigator.userAgent || "";
    const ios = /iPhone|iPad|iPod/i.test(ua);
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    setIsIos(ios);
    setIsMobile(mobile);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setIsStandalone(true);
      setInstallPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const showAndroidInstall = useMemo(
    () => Boolean(isMobile && !isIos && !isStandalone && installPromptEvent),
    [installPromptEvent, isIos, isMobile, isStandalone],
  );

  const showIosHint = useMemo(
    () => Boolean(isMobile && isIos && !isStandalone),
    [isIos, isMobile, isStandalone],
  );

  const onInstall = async () => {
    if (!installPromptEvent) return;
    await installPromptEvent.prompt();
    await installPromptEvent.userChoice.catch(() => null);
    setInstallPromptEvent(null);
  };

  if (!showAndroidInstall && !showIosHint) return null;

  return (
    <div className="fixed bottom-24 left-4 right-4 z-40 sm:left-auto sm:right-6 sm:w-[360px]">
      <div className="rounded-2xl border border-white/15 bg-slate-900/95 p-3 text-sm text-slate-100 shadow-xl backdrop-blur">
        <p className="font-semibold">Install NexHyr</p>
        {showAndroidInstall ? (
          <>
            <p className="mt-1 text-slate-300">Add NexHyr to your home screen for faster access.</p>
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
