import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  JudgeInviteBody,
  JudgeTracksBody,
  PutCriteriaBody,
  ScoreUpdateBody,
} from "@dogfood/shared";
import { apiDownload, apiRequest } from "../client";
import type {
  AssignmentRow,
  AuditItem,
  Criterion,
  Dashboard,
  JudgeAssignmentDetail,
  JudgeAssignmentSummary,
  JudgeRow,
  JudgeScoreItem,
  ResultsResponse,
} from "../types";

const DASHBOARD_POLL_MS = 5000;

export function useCriteria(eventId: string) {
  return useQuery({
    queryKey: ["events", eventId, "criteria"],
    enabled: Boolean(eventId),
    queryFn: () => apiRequest<{ criteria: Criterion[] }>(`/api/events/${eventId}/criteria`),
  });
}

export function usePutCriteria(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PutCriteriaBody) =>
      apiRequest<{ criteria: Criterion[] }>(`/api/events/${eventId}/criteria`, {
        method: "PUT",
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["events", eventId, "criteria"] });
    },
  });
}

export function useJudges(eventId: string) {
  return useQuery({
    queryKey: ["events", eventId, "judges"],
    enabled: Boolean(eventId),
    queryFn: () => apiRequest<{ judges: JudgeRow[] }>(`/api/events/${eventId}/judges`),
  });
}

export function useCreateJudgeInvite(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: JudgeInviteBody) =>
      apiRequest<{ inviteUrl: string; expiresAt: string }>(
        `/api/events/${eventId}/judges/invites`,
        { method: "POST", body },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["events", eventId, "judges"] });
    },
  });
}

export function useSetJudgeTracks(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, body }: { userId: string; body: JudgeTracksBody }) =>
      apiRequest(`/api/events/${eventId}/judges/${userId}/tracks`, {
        method: "PUT",
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["events", eventId, "judges"] });
    },
  });
}

export function useRemoveJudge(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiRequest(`/api/events/${eventId}/judges/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["events", eventId, "judges"] });
      void queryClient.invalidateQueries({ queryKey: ["events", eventId, "assignments"] });
    },
  });
}

export function useAssignments(eventId: string) {
  return useQuery({
    queryKey: ["events", eventId, "assignments"],
    enabled: Boolean(eventId),
    queryFn: () =>
      apiRequest<{ assignments: AssignmentRow[] }>(`/api/events/${eventId}/assignments`),
  });
}

export function useAutoAssign(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<{
        created: number;
        unassignable: Array<{ projectId: string; reason: string }>;
      }>(`/api/events/${eventId}/assignments/auto`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["events", eventId, "assignments"] });
      void queryClient.invalidateQueries({ queryKey: ["events", eventId, "dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["events", eventId, "judges"] });
    },
  });
}

export function useDeleteAssignment(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) =>
      apiRequest(`/api/assignments/${assignmentId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["events", eventId, "assignments"] });
      void queryClient.invalidateQueries({ queryKey: ["events", eventId, "dashboard"] });
    },
  });
}

export function useDashboard(eventId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["events", eventId, "dashboard"],
    enabled: Boolean(eventId) && enabled,
    refetchInterval: DASHBOARD_POLL_MS,
    queryFn: () => apiRequest<Dashboard>(`/api/events/${eventId}/dashboard`),
  });
}

export function useEventResults(eventId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["events", eventId, "results"],
    enabled: Boolean(eventId) && enabled,
    queryFn: () => apiRequest<ResultsResponse>(`/api/events/${eventId}/results`),
  });
}

export function usePublishResults(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<{ resultsPublishedAt: string | null }>(
        `/api/events/${eventId}/results/publish`,
        { method: "POST" },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["events", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["events", eventId, "results"] });
      void queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useUnpublishResults(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<{ resultsPublishedAt: string | null }>(
        `/api/events/${eventId}/results/unpublish`,
        { method: "POST" },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["events", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["events", eventId, "results"] });
      void queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useAuditLog(eventId: string, page: number) {
  return useQuery({
    queryKey: ["events", eventId, "audit", page],
    enabled: Boolean(eventId),
    queryFn: () =>
      apiRequest<{
        total: number;
        page: number;
        pageSize: number;
        items: AuditItem[];
      }>(`/api/events/${eventId}/audit?page=${page}&pageSize=50`),
  });
}

export async function downloadEventCsv(
  eventId: string,
  type: "results" | "scores",
): Promise<void> {
  await apiDownload(
    `/api/events/${eventId}/export.csv?type=${type}`,
    `${eventId}-${type}.csv`,
  );
}

export function useJudgeInvitePreview(token: string | undefined) {
  return useQuery({
    queryKey: ["judge-invites", token],
    enabled: Boolean(token),
    queryFn: () =>
      apiRequest<{ eventId: string; eventName: string; email: string }>(
        `/api/judge-invites/${token}`,
      ),
  });
}

export function useAcceptJudgeInvite(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest(`/api/judge-invites/${token}/accept`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      void queryClient.invalidateQueries({ queryKey: ["judge"] });
    },
  });
}

export function useMyJudgeAssignments(eventId?: string) {
  const search = eventId ? `?eventId=${encodeURIComponent(eventId)}` : "";
  return useQuery({
    queryKey: ["judge", "assignments", eventId ?? "all"],
    queryFn: () =>
      apiRequest<{ assignments: JudgeAssignmentSummary[] }>(`/api/judge/assignments${search}`),
  });
}

export function useJudgeAssignment(assignmentId: string | undefined) {
  return useQuery({
    queryKey: ["judge", "assignments", assignmentId],
    enabled: Boolean(assignmentId),
    queryFn: () =>
      apiRequest<{ assignment: JudgeAssignmentDetail }>(
        `/api/judge/assignments/${assignmentId}`,
      ),
  });
}

export function useUpdateScores(assignmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ScoreUpdateBody) =>
      apiRequest<{ assignment: JudgeAssignmentDetail }>(
        `/api/judge/assignments/${assignmentId}/scores`,
        { method: "PUT", body },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["judge"] });
    },
  });
}

export function useMyJudgeScores() {
  return useQuery({
    queryKey: ["judge", "scores"],
    queryFn: () => apiRequest<{ items: JudgeScoreItem[] }>("/api/judge/scores"),
  });
}
