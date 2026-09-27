import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../client";

export interface RecordItem {
  id: string;
  type: "judge_participation" | "participant_certificate" | "judge_certificate";
  eventId: string;
  subjectUserId: string;
  payload: any;
  payloadHash: string;
  signature: string;
  kid: string;
  issuedAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
}

export function useMyCertificates() {
  return useQuery<{ certificates: RecordItem[] }>({
    queryKey: ["certificates", "me"],
    queryFn: () => apiRequest("/api/me/certificates"),
  });
}

export function useRecord(recordId: string) {
  return useQuery<{ record: RecordItem; valid: boolean }>({
    queryKey: ["record", recordId],
    queryFn: () => apiRequest(`/api/records/${recordId}`),
    enabled: Boolean(recordId),
  });
}

export function useVerifyRecord() {
  return useMutation<
    { valid: boolean; revoked?: boolean; reason?: string },
    Error,
    { payload: unknown; signature: string; kid: string }
  >({
    mutationFn: (body) => apiRequest("/api/records/verify", { method: "POST", body }),
  });
}

export function useRevokeRecord() {
  const queryClient = useQueryClient();
  return useMutation<RecordItem, Error, { recordId: string; reason: string }>({
    mutationFn: ({ recordId, reason }) =>
      apiRequest(`/api/records/${recordId}/revoke`, { method: "POST", body: { reason } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["record"] });
      queryClient.invalidateQueries({ queryKey: ["certificates"] });
    },
  });
}

export function useEventCertificates(eventId: string) {
  return useQuery<{ certificates: RecordItem[] }>({
    queryKey: ["certificates", eventId],
    queryFn: () => apiRequest(`/api/events/${eventId}/certificates`),
    enabled: Boolean(eventId),
  });
}

export function useIssueCertificates(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation<{ issuedCount: number; records: RecordItem[] }, Error>({
    mutationFn: () => apiRequest(`/api/events/${eventId}/certificates/issue`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["certificates", eventId] });
      queryClient.invalidateQueries({ queryKey: ["certificates", "me"] });
    },
  });
}
