import { Link, useParams } from "react-router-dom";
import { useProject } from "../../api/hooks/projects";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorMessage } from "../../components/ErrorMessage";
import { DateTime } from "../../lib/datetime";
import { isSafeUrl } from "../../lib/url";

export function ProjectPage() {
  const { projectId } = useParams();
  const projectQuery = useProject(projectId);

  if (projectQuery.isLoading) return <p className="text-slate-600">Loading project…</p>;
  if (projectQuery.isError) return <ErrorMessage error={projectQuery.error} />;
  const project = projectQuery.data?.project;
  if (!project) return <EmptyState title="Project not found" />;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-500">
          <Link to={`/events/${project.eventId}`} className="text-indigo-600 hover:underline">
            Back to event
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">{project.title}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {project.teamName} · {project.trackName ?? "No track"} · {project.status}
        </p>
      </div>
      <Card title="Summary">
        <p className="whitespace-pre-wrap text-slate-700">{project.summary || "—"}</p>
      </Card>
      <Card title="Links">
        <ul className="space-y-2 text-sm">
          <li>
            Repo:{" "}
            {isSafeUrl(project.repoUrl) ? (
              <a className="text-indigo-600 hover:underline" href={project.repoUrl} target="_blank" rel="noopener noreferrer">
                {project.repoUrl}
              </a>
            ) : (
              "—"
            )}
          </li>
          <li>
            Demo:{" "}
            {isSafeUrl(project.demoUrl) ? (
              <a className="text-indigo-600 hover:underline" href={project.demoUrl} target="_blank" rel="noopener noreferrer">
                {project.demoUrl}
              </a>
            ) : (
              "—"
            )}
          </li>
          <li>
            Submitted: <DateTime value={project.submittedAt} />
          </li>
        </ul>
      </Card>
    </div>
  );
}
