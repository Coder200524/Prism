import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateEventBody, PatchEventBody } from "@dogfood/shared";
import { apiRequest } from "../client";
import type { EventSummary } from "../types";

export function useEvents() {
  return useQuery({
    queryKey: ["events"],
    queryFn: () => apiRequest<{ events: EventSummary[] }>("/api/events"),
  });
}

export function useEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: ["events", eventId],
    enabled: Boolean(eventId),
    queryFn: () => apiRequest<{ event: EventSummary }>(`/api/events/${eventId}`),
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateEventBody) =>
      apiRequest<{ event: EventSummary }>("/api/events", { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useUpdateEvent(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PatchEventBody) =>
      apiRequest<{ event: EventSummary }>(`/api/events/${eventId}`, {
        method: "PATCH",
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["events", eventId] });
    },
  });
}

export function usePublishEvent(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<{ event: EventSummary }>(`/api/events/${eventId}/publish`, {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["events", eventId] });
    },
  });
}

export function useCreateTrack(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string }) =>
      apiRequest(`/api/events/${eventId}/tracks`, { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["events", eventId] });
    },
  });
}

export function useDeleteTrack(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (trackId: string) =>
      apiRequest(`/api/events/${eventId}/tracks/${trackId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["events", eventId] });
    },
  });
}

export function useCreatePrize(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      description?: string;
      value?: string;
      place?: number | null;
      trackId?: string | null;
    }) => apiRequest(`/api/events/${eventId}/prizes`, { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["events", eventId] });
    },
  });
}

export function useDeletePrize(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (prizeId: string) =>
      apiRequest(`/api/events/${eventId}/prizes/${prizeId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["events", eventId] });
    },
  });
}
