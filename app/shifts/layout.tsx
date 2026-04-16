import { AuthGuard } from "@/components/auth/auth-guard";
import { SiteHeader } from "@/components/site/site-header";

export default function ShiftBrowseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard allowedRoles={["worker"]}>
      <SiteHeader compact />
      <main className="public-shell pt-6 sm:pt-8">{children}</main>
    </AuthGuard>
  );
}
