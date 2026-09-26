import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../client";
import type { GalleryProject, ProjectDetail } from "../types";

export type GalleryFilters = {
  eventId?: string;
  trackId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
};

function toQuery(filters: GalleryFilters): string {
  const params = new URLSearchParams();
  if (filters.eventId) params.set("eventId", filters.eventId);
  if (filters.trackId) params.set("trackId", filters.trackId);
  if (filters.q) params.set("q", filters.q);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useGallery(filters: GalleryFilters) {
  return useQuery({
    queryKey: ["projects", "gallery", filters],
    queryFn: () =>
      apiRequest<{
        items: GalleryProject[];
        total: number;
        page: number;
        pageSize: number;
      }>(`/api/projects${toQuery(filters)}`),
  });
}

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: ["projects", projectId],
    enabled: Boolean(projectId),
    queryFn: () => apiRequest<{ project: ProjectDetail }>(`/api/projects/${projectId}`),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      eventId?: string;
      title: string;
      summary?: string;
      repoUrl?: string;
      demoUrl?: string;
      trackId?: string | null;
    }) => apiRequest<{ project: ProjectDetail }>("/api/projects", { method: "POST", body }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["teams", "mine"] });
      void queryClient.invalidateQueries({ queryKey: ["projects", data.project.id] });
    },
  });
}

export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title?: string;
      summary?: string;
      repoUrl?: string;
      demoUrl?: string;
      trackId?: string | null;
    }) =>
      apiRequest<{ project: ProjectDetail }>(`/api/projects/${projectId}`, {
        method: "PATCH",
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["teams", "mine"] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "gallery"] });
    },
  });
}

export function useSubmitProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<{ project: ProjectDetail }>(`/api/projects/${projectId}/submit`, {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["teams", "mine"] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "gallery"] });
    },
  });
}
