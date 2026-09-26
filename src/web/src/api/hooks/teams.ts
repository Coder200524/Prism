import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../client";
import type { Team } from "../types";

export function useMyTeams() {
  return useQuery({
    queryKey: ["teams", "mine"],
    queryFn: () => apiRequest<{ teams: Team[] }>("/api/teams/mine"),
  });
}

export function useCreateTeam(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string }) =>
      apiRequest<{ team: Team; inviteUrl: string }>(`/api/events/${eventId}/teams`, {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["teams", "mine"] });
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}

export function useInvitePreview(code: string | undefined) {
  return useQuery({
    queryKey: ["teams", "invite", code],
    enabled: Boolean(code),
    queryFn: () =>
      apiRequest<{
        teamName: string;
        eventName: string;
        eventId: string;
        memberCount: number;
        maxTeamSize: number;
      }>(`/api/teams/invite/${code}`),
  });
}

export function useJoinTeam(code: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<{ team: Team }>(`/api/teams/invite/${code}/join`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["teams", "mine"] });
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}

export function useRotateInvite(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<{ team: Team; inviteUrl: string }>(`/api/teams/${teamId}/invite/rotate`, {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["teams", "mine"] });
    },
  });
}
