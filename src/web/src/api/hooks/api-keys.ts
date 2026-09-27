import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../client";

export interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreateApiKeyResponse {
  apiKey: ApiKeyItem;
  secretKey: string;
}

export function useApiKeys(eventId: string) {
  return useQuery<{ apiKeys: ApiKeyItem[] }>({
    queryKey: ["api-keys", eventId],
    queryFn: () => apiRequest(`/api/events/${eventId}/api-keys`),
    enabled: Boolean(eventId),
  });
}

export function useCreateApiKey(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation<{ id: string; key: string; name: string; prefix: string; scopes: string[] }, Error, { name: string; scopes?: string[] }>({
    mutationFn: (body) => apiRequest(`/api/events/${eventId}/api-keys`, { method: "POST", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys", eventId] });
    },
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation<{ success: boolean }, Error, string>({
    mutationFn: (id: string) => apiRequest(`/api/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}
