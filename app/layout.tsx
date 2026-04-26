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
  description: "Smarter Hiring. Better Hospitality.",
  openGraph: {
    title: "NexHyr",
    description: "Smarter Hiring. Better Hospitality.",
    url: siteUrl,
    siteName: "NexHyr",
    type: "website",
    images: [{ url: "/icon.svg", width: 512, height: 512, alt: "NexHyr logo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "NexHyr",
    description: "Smarter Hiring. Better Hospitality.",
    images: ["/icon.svg"],
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
