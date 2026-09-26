import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { useEvent } from "../../api/hooks/events";
import {
  useCreateProject,
  useProject,
  useSubmitProject,
  useUpdateProject,
} from "../../api/hooks/projects";
import { useMyTeams } from "../../api/hooks/teams";
import type { ProjectDetail } from "../../api/types";
import { RequireRole } from "../../auth/RequireRole";
import { Button } from "../../components/Button";
import { ErrorMessage } from "../../components/ErrorMessage";
import { Input } from "../../components/Input";
import { Select } from "../../components/Select";
import { Textarea } from "../../components/Textarea";

function SubmitProjectForm() {
  const { teamId = "" } = useParams();
  const teamsQuery = useMyTeams();
  const team = teamsQuery.data?.teams.find((entry) => entry.id === teamId);
  const eventQuery = useEvent(team?.eventId);
  const projectId = team?.project?.id;
  const projectQuery = useProject(projectId);
  const createProject = useCreateProject();
  const updateProject = useUpdateProject(projectId ?? "pending");
  const submitProject = useSubmitProject(projectId ?? "pending");

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [demoUrl, setDemoUrl] = useState("");
  const [trackId, setTrackId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  useEffect(() => {
    const project = projectQuery.data?.project;
    if (!project) return;
    setTitle(project.title);
    setSummary(project.summary);
    setRepoUrl(project.repoUrl);
    setDemoUrl(project.demoUrl);
    setTrackId(project.trackId ?? "");
  }, [projectQuery.data]);

  if (teamsQuery.isLoading || eventQuery.isLoading || (projectId && projectQuery.isLoading)) {
    return <p className="text-slate-600">Loading project form…</p>;
  }
  if (teamsQuery.isError) return <ErrorMessage error={teamsQuery.error} />;
  if (!team) return <ErrorMessage error={new Error("Team not found")} />;
  if (eventQuery.isError) return <ErrorMessage error={eventQuery.error} />;

  const currentTeam = team;
  const event = eventQuery.data?.event;
  const closed = event?.phase !== "submissions";
  const project = projectQuery.data?.project;
  const busy = createProject.isPending || updateProject.isPending || submitProject.isPending;

  async function saveDraft(eventForm: FormEvent) {
    eventForm.preventDefault();
    setMessage(null);
    setActionError(null);
    try {
      if (!projectId) {
        await createProject.mutateAsync({
          eventId: currentTeam.eventId,
          title,
          summary,
          repoUrl,
          demoUrl,
          trackId: trackId || null,
        });
        await teamsQuery.refetch();
      } else {
        await updateProject.mutateAsync({
          title,
          summary,
          repoUrl,
          demoUrl,
          trackId: trackId || null,
        });
      }
      setMessage("Draft saved.");
    } catch (error) {
      setActionError(error);
    }
  }

  async function onSubmit() {
    setMessage(null);
    setActionError(null);
    try {
      let id = projectId;
      if (!id) {
        const created = await createProject.mutateAsync({
          eventId: currentTeam.eventId,
          title,
          summary,
          repoUrl,
          demoUrl,
          trackId: trackId || null,
        });
        id = created.project.id;
        await apiRequest<{ project: ProjectDetail }>(`/api/projects/${id}/submit`, {
          method: "POST",
        });
      } else {
        await updateProject.mutateAsync({
          title,
          summary,
          repoUrl,
          demoUrl,
          trackId: trackId || null,
        });
        await submitProject.mutateAsync();
      }
      setMessage("Project submitted.");
      await teamsQuery.refetch();
    } catch (error) {
      setActionError(error);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <Link to="/teams" className="text-sm text-indigo-600 hover:underline">
          Back to my teams
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">{team.name} — project</h1>
        <p className="text-sm text-slate-600">{event?.name}</p>
      </div>

      {closed ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Submissions closed
        </p>
      ) : null}

      <form onSubmit={(e) => void saveDraft(e)} className="space-y-4">
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          disabled={closed}
        />
        <Textarea
          label="Summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          disabled={closed}
        />
        <Select
          label="Track"
          value={trackId}
          onChange={(e) => setTrackId(e.target.value)}
          disabled={closed}
          options={[
            { value: "", label: "Select a track" },
            ...(event?.tracks.map((track) => ({ value: track.id, label: track.name })) ?? []),
          ]}
        />
        <Input
          label="Repository URL"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          disabled={closed}
        />
        <Input
          label="Demo URL"
          value={demoUrl}
          onChange={(e) => setDemoUrl(e.target.value)}
          disabled={closed}
        />

        {actionError ? <ErrorMessage error={actionError} /> : null}
        {message ? <p className="text-sm text-green-700">{message}</p> : null}
        {project ? <p className="text-sm text-slate-600">Status: {project.status}</p> : null}

        {!closed ? (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" disabled={busy}>
              Save draft
            </Button>
            <Button type="button" disabled={busy} onClick={() => void onSubmit()}>
              Submit
            </Button>
          </div>
        ) : null}
      </form>
    </div>
  );
}

export function SubmitProjectPage() {
  return (
    <RequireRole>
      <SubmitProjectForm />
    </RequireRole>
  );
}
