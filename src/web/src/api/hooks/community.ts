import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../client";
import type {
  BallotResponse,
  CommentItem,
  CommunityResultsResponse,
  CommunityTurnout,
  FlaggedVote,
  EventComment,
} from "../types";

const TURNOUT_POLL_MS = 5000;

export function useBallot(eventId: string) {
  return useQuery({
    queryKey: ["community", "ballot", eventId],
    enabled: Boolean(eventId),
    queryFn: () => apiRequest<BallotResponse>(`/api/events/${eventId}/ballot`),
  });
}

export function useCastVote(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      apiRequest<{ vote: { id: string } }>(`/api/events/${eventId}/votes`, {
        method: "POST",
        body: { projectId },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["community", "ballot", eventId] });
    },
  });
}

export function useRetractVote(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (trackId: string) =>
      apiRequest(`/api/events/${eventId}/votes/${trackId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["community", "ballot", eventId] });
    },
  });
}

export function useProjectComments(projectId: string | undefined) {
  return useQuery({
    queryKey: ["comments", projectId],
    enabled: Boolean(projectId),
    queryFn: () => apiRequest<CommentItem[]>(`/api/projects/${projectId}/comments`),
  });
}

export function usePostComment(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      apiRequest<CommentItem>(`/api/projects/${projectId}/comments`, {
        method: "POST",
        body: { body },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["comments", projectId] });
    },
  });
}

export function useDeleteComment(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      apiRequest(`/api/comments/${commentId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["comments", projectId] });
    },
  });
}

export function useCommunityResults(eventId: string) {
  return useQuery({
    queryKey: ["community", "results", eventId],
    enabled: Boolean(eventId),
    queryFn: () =>
      apiRequest<CommunityResultsResponse>(`/api/events/${eventId}/community-results`),
  });
}

export function useCommunityTurnout(eventId: string, poll: boolean) {
  return useQuery({
    queryKey: ["community", "turnout", eventId],
    enabled: Boolean(eventId),
    queryFn: () => apiRequest<CommunityTurnout>(`/api/events/${eventId}/community-turnout`),
    refetchInterval: poll ? TURNOUT_POLL_MS : false,
  });
}

export function useFlaggedVotes(eventId: string) {
  return useQuery({
    queryKey: ["community", "flagged", eventId],
    enabled: Boolean(eventId),
    queryFn: () => apiRequest<FlaggedVote[]>(`/api/events/${eventId}/votes/flagged`),
  });
}

export function useVoidVote(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ voteId, reason }: { voteId: string; reason: string }) =>
      apiRequest(`/api/votes/${voteId}/void`, { method: "POST", body: { reason } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["community", "flagged", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["community", "turnout", eventId] });
    },
  });
}

export function useRestoreVote(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (voteId: string) =>
      apiRequest(`/api/votes/${voteId}/restore`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["community", "flagged", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["community", "turnout", eventId] });
    },
  });
}

export function useEventComments(eventId: string) {
  return useQuery({
    queryKey: ["community", "comments", eventId],
    enabled: Boolean(eventId),
    queryFn: () => apiRequest<EventComment[]>(`/api/events/${eventId}/comments`),
  });
}

export function useHideComment(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, reason }: { commentId: string; reason: string }) =>
      apiRequest(`/api/comments/${commentId}/hide`, { method: "POST", body: { reason } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["community", "comments", eventId] });
    },
  });
}

export function useUnhideComment(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      apiRequest(`/api/comments/${commentId}/unhide`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["community", "comments", eventId] });
    },
  });
}
