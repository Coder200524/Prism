import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

interface ProjectEmbedItem {
  id: string;
  title: string;
  summary: string;
  repoUrl: string;
  demoUrl: string;
  submittedAt: string | null;
  teamName: string;
  trackId: string | null;
  trackName: string | null;
  eventId: string;
  eventName: string;
}

export function EmbedGalleryPage() {
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get("eventId") || "";
  const trackId = searchParams.get("trackId") || "";
  const theme = searchParams.get("theme") === "dark" ? "dark" : "light";
  const limit = searchParams.get("limit") || "10";

  const [projects, setProjects] = useState<ProjectEmbedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (eventId) params.set("eventId", eventId);
    if (trackId) params.set("trackId", trackId);
    if (theme) params.set("theme", theme);
    if (limit) params.set("limit", limit);

    fetch(`/api/embed/gallery?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setProjects(data.projects || []);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [eventId, trackId, theme, limit]);

  // Post height to parent window for auto-resizing iframe
  useEffect(() => {
    const notifyHeight = () => {
      if (window.parent && window.parent !== window) {
        const height = document.body.scrollHeight;
        window.parent.postMessage({ type: "dogfood:resize", height }, "*");
      }
    };
    notifyHeight();
    const timer = setTimeout(notifyHeight, 300);
    return () => clearTimeout(timer);
  }, [projects, isLoading]);

  const isDark = theme === "dark";

  return (
    <div
      className={`p-4 font-sans transition-colors ${
        isDark ? "bg-stone-900 text-stone-100" : "bg-df-bg text-stone-900"
      }`}
    >
      {isLoading ? (
        <div className="py-8 text-center text-sm text-stone-500">Loading gallery...</div>
      ) : error ? (
        <div className="py-4 text-center text-sm text-red-500">Failed to load gallery</div>
      ) : projects.length === 0 ? (
        <div className={`py-8 text-center text-sm ${isDark ? "text-stone-400" : "text-stone-500"}`}>
          No published projects available.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className={`flex flex-col justify-between rounded-lg border p-4 shadow-sm transition-all hover:shadow-md ${
                isDark
                  ? "border-stone-800 bg-stone-800/80 hover:border-stone-700"
                  : "border-stone-200 bg-stone-50 hover:border-stone-300"
              }`}
            >
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className={`font-semibold ${isDark ? "text-indigo-400" : "text-df-pink"}`}>
                    {project.teamName}
                  </span>
                  {project.trackName && (
                    <span
                      className={`rounded px-2 py-0.5 font-medium ${
                        isDark ? "bg-stone-700 text-stone-300" : "bg-stone-200 text-stone-700"
                      }`}
                    >
                      {project.trackName}
                    </span>
                  )}
                </div>

                <h3 className="mt-2 text-base font-bold tracking-tight">
                  <a
                    href={`/projects/${project.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-df-cyan transition-colors font-mono"
                  >
                    {project.title}
                  </a>
                </h3>

                <p
                  className={`mt-2 text-xs line-clamp-3 ${
                    isDark ? "text-stone-300" : "text-stone-600"
                  }`}
                >
                  {project.summary}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-stone-700/20 pt-3 text-xs">
                <a
                  href={`/projects/${project.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`font-semibold ${
                    isDark ? "text-indigo-400 hover:text-indigo-300" : "text-df-pink hover:text-indigo-800"
                  }`}
                >
                  View Project &rarr;
                </a>
                <span className={`text-[10px] ${isDark ? "text-stone-500" : "text-stone-400"}`}>
                  {project.eventName}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
