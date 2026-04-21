import { AdminUsersManager } from "@/components/admin/admin-users-manager";

export default function AdminUsersPage() {
  return (
    <AdminUsersManager
      title="All users"
      description="Review workers and businesses, suspend access, delete accounts, or send a direct message."
      initialTab="all"
    />
  );
}
