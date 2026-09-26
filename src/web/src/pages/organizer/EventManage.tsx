import { Link, useParams, useSearchParams } from "react-router-dom";
import { useEvent } from "../../api/hooks/events";
import { RequireRole } from "../../auth/RequireRole";
import { ErrorMessage } from "../../components/ErrorMessage";
import { AssignmentsTab } from "./tabs/AssignmentsTab";
import { AuditTab } from "./tabs/AuditTab";
import { CommunityTab } from "./tabs/CommunityTab";
import { DashboardTab } from "./tabs/DashboardTab";
import { JudgesTab } from "./tabs/JudgesTab";
import { ResultsTab } from "./tabs/ResultsTab";
import { RubricTab } from "./tabs/RubricTab";
import { SettingsTab } from "./tabs/SettingsTab";

const TABS = [
  { id: "settings", label: "Settings" },
  { id: "rubric", label: "Rubric" },
  { id: "judges", label: "Judges" },
  { id: "assignments", label: "Assignments" },
  { id: "dashboard", label: "Dashboard" },
  { id: "results", label: "Results" },
  { id: "community", label: "Community" },
  { id: "audit", label: "Audit" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function isTabId(value: string | null): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

function EventManageContent() {
  const { eventId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const eventQuery = useEvent(eventId);
  const tabParam = params.get("tab");
  const activeTab: TabId = isTabId(tabParam) ? tabParam : "settings";

  if (eventQuery.isLoading) return <p className="text-slate-600">Loading…</p>;
  if (eventQuery.isError) return <ErrorMessage error={eventQuery.error} />;
  const event = eventQuery.data?.event;
  if (!event) return null;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/organize" className="text-sm text-indigo-600 hover:underline">
          Back to organize
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">{event.name}</h1>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2 text-sm">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={
              activeTab === tab.id
                ? "font-medium text-indigo-600"
                : "text-slate-500 hover:text-slate-800"
            }
            onClick={() => {
              const next = new URLSearchParams(params);
              if (tab.id === "settings") next.delete("tab");
              else next.set("tab", tab.id);
              setParams(next);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "settings" ? <SettingsTab eventId={eventId} /> : null}
      {activeTab === "rubric" ? <RubricTab eventId={eventId} /> : null}
      {activeTab === "judges" ? <JudgesTab eventId={eventId} /> : null}
      {activeTab === "assignments" ? <AssignmentsTab eventId={eventId} /> : null}
      {activeTab === "dashboard" ? <DashboardTab eventId={eventId} /> : null}
      {activeTab === "results" ? <ResultsTab eventId={eventId} /> : null}
      {activeTab === "community" ? <CommunityTab eventId={eventId} /> : null}
      {activeTab === "audit" ? <AuditTab eventId={eventId} /> : null}
    </div>
  );
}

export function EventManagePage() {
  return (
    <RequireRole platformRoles={["ORGANIZER", "ADMIN"]}>
      <EventManageContent />
    </RequireRole>
  );
}
