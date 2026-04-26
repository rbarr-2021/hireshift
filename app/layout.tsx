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

export const metadata: Metadata = {
  title: "KruVii",
  description: "Premium hospitality crew marketplace",
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
