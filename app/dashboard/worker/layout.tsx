import { AuthGuard } from "@/components/auth/auth-guard";

export default function WorkerDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard requireOnboarding allowedRoles={["worker"]}>
      {children}
    </AuthGuard>
  );
}
