import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../client";

export interface DryRunSummary {
  dryRun: boolean;
  valid: boolean;
  summary: {
    teamsToCreate?: number;
    projectsToCreate?: number;
    judgesToImport?: number;
    errors?: string[];
    [key: string]: unknown;
  };
}

export function useImportJson(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation<DryRunSummary, Error, { payload: unknown; dryRun: boolean }>({
    mutationFn: ({ payload, dryRun }) =>
      apiRequest(`/api/events/${eventId}/import.json${dryRun ? "?dryRun=true" : ""}`, {
        method: "POST",
        body: payload,
      }),
    onSuccess: (data) => {
      if (!data.dryRun) {
        queryClient.invalidateQueries({ queryKey: ["events", eventId] });
      }
    },
  });
}

export function useImportCsvJudges(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation<DryRunSummary, Error, { csvText: string; dryRun: boolean }>({
    mutationFn: ({ csvText, dryRun }) =>
      apiRequest(`/api/events/${eventId}/import/judges.csv${dryRun ? "?dryRun=true" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        rawBody: csvText,
      }),
    onSuccess: (data) => {
      if (!data.dryRun) {
        queryClient.invalidateQueries({ queryKey: ["events", eventId] });
      }
    },
  });
}
