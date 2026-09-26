import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AdminUsersPage } from "./pages/admin/Users";
import { AcceptJudgeInvitePage } from "./pages/judge/AcceptJudgeInvite";
import { JudgeHomePage } from "./pages/judge/JudgeHome";
import { MyScoresPage } from "./pages/judge/MyScores";
import { ScoreFormPage } from "./pages/judge/ScoreForm";
import { CreateTeamPage } from "./pages/participant/CreateTeam";
import { JoinTeamPage } from "./pages/participant/JoinTeam";
import { MyTeamsPage } from "./pages/participant/MyTeams";
import { SubmitProjectPage } from "./pages/participant/SubmitProject";
import { EventFormPage } from "./pages/organizer/EventForm";
import { EventManagePage } from "./pages/organizer/EventManage";
import { OrganizerHomePage } from "./pages/organizer/OrganizerHome";
import { CommunityResultsPage } from "./pages/public/CommunityResultsPage";
import { EventPage } from "./pages/public/EventPage";
import { EventsPage } from "./pages/public/Events";
import { GalleryPage } from "./pages/public/Gallery";
import { HomePage } from "./pages/public/Home";
import { LoginPage } from "./pages/public/Login";
import { ProjectPage } from "./pages/public/ProjectPage";
import { RegisterPage } from "./pages/public/Register";
import { ResultsPage } from "./pages/public/Results";
import { VotePage } from "./pages/public/VotePage";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="gallery" element={<GalleryPage />} />
        <Route path="events/:eventId" element={<EventPage />} />
        <Route path="events/:eventId/results" element={<ResultsPage />} />
        <Route path="events/:eventId/vote" element={<VotePage />} />
        <Route path="events/:eventId/community-results" element={<CommunityResultsPage />} />
        <Route path="projects/:projectId" element={<ProjectPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="teams" element={<MyTeamsPage />} />
        <Route path="teams/:teamId/project" element={<SubmitProjectPage />} />
        <Route path="events/:eventId/team/new" element={<CreateTeamPage />} />
        <Route path="join/:code" element={<JoinTeamPage />} />
        <Route path="organize" element={<OrganizerHomePage />} />
        <Route path="organize/new" element={<EventFormPage />} />
        <Route path="organize/:eventId" element={<EventManagePage />} />
        <Route path="judge" element={<JudgeHomePage />} />
        <Route path="judge/scores" element={<MyScoresPage />} />
        <Route path="judge/assignments/:assignmentId" element={<ScoreFormPage />} />
        <Route path="judge-invite/:token" element={<AcceptJudgeInvitePage />} />
        <Route path="admin" element={<AdminUsersPage />} />
      </Route>
    </Routes>
  );
}
