import type { Metadata } from "next";
import { Suspense } from "react";
import { Manrope } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";
import { MobileScrollReset } from "@/components/navigation/mobile-scroll-reset";
import { ToastProvider } from "@/components/ui/toast-provider";

const disneyStyleSans = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ui",
});

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://nexhyr.co.uk").replace(
  /\/+$/,
  "",
);

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "NexHyr",
    template: "%s | NexHyr",
  },
  description: "NexHyr is the hospitality staffing marketplace for fast shift cover and clear payouts.",
  openGraph: {
    title: "NexHyr",
    description:
      "NexHyr helps businesses book trusted hospitality workers and helps workers find reliable shifts.",
    url: siteUrl,
    siteName: "NexHyr",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NexHyr",
    description:
      "Fast hospitality staffing for businesses and workers, from booking through payout.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${disneyStyleSans.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AuthProvider>
          <ToastProvider>
            <Suspense fallback={null}>
              <MobileScrollReset />
            </Suspense>
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
