import { AdminUsersManager } from "@/components/admin/admin-users-manager";

export default function AdminBusinessesPage() {
  return (
    <AdminUsersManager
      title="Businesses"
      description="Review all business accounts and manage access, messaging, or account removal."
      initialTab="business"
      lockedRole="business"
    />
  );
}
