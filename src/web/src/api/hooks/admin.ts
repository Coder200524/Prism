import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PatchUserBody } from "@dogfood/shared";
import { apiRequest } from "../client";
import type { AdminUser } from "../types";

export function useAdminUsers() {
  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => apiRequest<{ users: AdminUser[] }>("/api/admin/users"),
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, platformRole }: { userId: string; platformRole: PatchUserBody["platformRole"] }) =>
      apiRequest<{ user: AdminUser }>(`/api/admin/users/${userId}`, {
        method: "PATCH",
        body: { platformRole },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}
