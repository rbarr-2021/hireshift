import { AuthGuard } from "@/components/auth/auth-guard";
import { WorkerProfileForm } from "@/components/worker/worker-profile-form";

export default function WorkerSetupPage() {
  return (
    <AuthGuard allowedRoles={["worker"]}>
      <WorkerProfileForm mode="onboarding" />
    </AuthGuard>
  );
}
