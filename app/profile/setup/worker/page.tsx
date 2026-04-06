import { AuthGuard } from "@/components/auth/auth-guard";
import { WorkerProfileForm } from "@/components/worker/worker-profile-form";

export default function WorkerSetupPage() {
  return (
    <AuthGuard>
      <WorkerProfileForm mode="onboarding" />
    </AuthGuard>
  );
}
