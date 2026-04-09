import { AuthGuard } from "@/components/auth/auth-guard";
import RoleSelect from "@/app/roleselect/role-select";

export default function RoleSelectPage() {
  return (
    <AuthGuard>
      <RoleSelect />
    </AuthGuard>
  );
}
