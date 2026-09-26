import { useAdminUsers, useUpdateUserRole } from "../../api/hooks/admin";
import type { AdminUser } from "../../api/types";
import { RequireRole } from "../../auth/RequireRole";
import { ErrorMessage } from "../../components/ErrorMessage";
import { Select } from "../../components/Select";
import { Table } from "../../components/Table";

function AdminUsersContent() {
  const usersQuery = useAdminUsers();
  const updateRole = useUpdateUserRole();

  if (usersQuery.isLoading) return <p className="text-slate-600">Loading users…</p>;
  if (usersQuery.isError) return <ErrorMessage error={usersQuery.error} />;

  const users = usersQuery.data?.users ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Admin — users</h1>
      {updateRole.isError ? <ErrorMessage error={updateRole.error} /> : null}
      <Table
        rows={users}
        rowKey={(user) => user.id}
        columns={[
          { key: "name", header: "Name", render: (user) => user.name },
          { key: "email", header: "Email", render: (user) => user.email },
          {
            key: "role",
            header: "Platform role",
            render: (user: AdminUser) => (
              <Select
                label="Role"
                value={user.platformRole}
                onChange={(e) =>
                  void updateRole.mutateAsync({
                    userId: user.id,
                    platformRole: e.target.value as AdminUser["platformRole"],
                  })
                }
                options={[
                  { value: "USER", label: "USER" },
                  { value: "ORGANIZER", label: "ORGANIZER" },
                  { value: "ADMIN", label: "ADMIN" },
                ]}
              />
            ),
          },
        ]}
      />
    </div>
  );
}

export function AdminUsersPage() {
  return (
    <RequireRole platformRoles={["ADMIN"]}>
      <AdminUsersContent />
    </RequireRole>
  );
}
