import { AuthGuard } from "@/components/auth/auth-guard";
import BusinessSetup from "./business";

export default function BusinessSetupPage() {
  return (
    <AuthGuard allowedRoles={["business"]}>
      <BusinessSetup />
    </AuthGuard>
  );
}
