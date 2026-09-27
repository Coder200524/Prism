import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../client";

export interface WebhookItem {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

export interface WebhookDeliveryItem {
  id: string;
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  statusCode: number | null;
  responseBody: string | null;
  error: string | null;
  attempts: number;
  deliveredAt: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
}

export function useWebhooks(eventId: string) {
  return useQuery<{ webhooks: WebhookItem[] }>({
    queryKey: ["webhooks", eventId],
    queryFn: () => apiRequest(`/api/events/${eventId}/webhooks`),
    enabled: Boolean(eventId),
  });
}

export function useCreateWebhook(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation<{ webhook: WebhookItem; secret: string }, Error, { url: string; events: string[]; secret?: string }>({
    mutationFn: (body) => apiRequest(`/api/events/${eventId}/webhooks`, { method: "POST", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks", eventId] });
    },
  });
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient();
  return useMutation<{ success: boolean }, Error, string>({
    mutationFn: (id: string) => apiRequest(`/api/webhooks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
    },
  });
}

export function useWebhookDeliveries(webhookId: string) {
  return useQuery<{ deliveries: WebhookDeliveryItem[] }>({
    queryKey: ["webhook-deliveries", webhookId],
    queryFn: () => apiRequest(`/api/webhooks/${webhookId}/deliveries`),
    enabled: Boolean(webhookId),
  });
}

export function useTestWebhook() {
  const queryClient = useQueryClient();
  return useMutation<{ success: boolean; delivery: WebhookDeliveryItem }, Error, string>({
    mutationFn: (webhookId: string) => apiRequest(`/api/webhooks/${webhookId}/test`, { method: "POST" }),
    onSuccess: (_, webhookId) => {
      queryClient.invalidateQueries({ queryKey: ["webhook-deliveries", webhookId] });
    },
  });
}

export function useRedeliverWebhook() {
  const queryClient = useQueryClient();
  return useMutation<{ success: boolean; delivery: WebhookDeliveryItem }, Error, { webhookId: string; deliveryId: string }>({
    mutationFn: ({ deliveryId }) => apiRequest(`/api/webhooks/deliveries/${deliveryId}/redeliver`, { method: "POST" }),
    onSuccess: (_, { webhookId }) => {
      queryClient.invalidateQueries({ queryKey: ["webhook-deliveries", webhookId] });
    },
  });
}
