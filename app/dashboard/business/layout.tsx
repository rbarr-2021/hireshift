import { AuthGuard } from "@/components/auth/auth-guard";

export default function BusinessDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard requireOnboarding allowedRoles={["business"]}>
      {children}
    </AuthGuard>
  );
}
