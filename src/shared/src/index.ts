export {
  platformRoleSchema,
  eventRoleTypeSchema,
  registerBodySchema,
  loginBodySchema,
  publicUserSchema,
  authTokenResponseSchema,
  meResponseSchema,
  patchUserBodySchema,
  adminUserSchema,
  type RegisterBody,
  type LoginBody,
  type PublicUser,
  type MeResponse,
  type PatchUserBody,
} from "./schemas/auth.js";

export {
  trackInputSchema,
  prizeInputSchema,
  createEventBodySchema,
  patchEventBodySchema,
  createTrackBodySchema,
  patchTrackBodySchema,
  createPrizeBodySchema,
  patchPrizeBodySchema,
  type CreateEventBody,
  type PatchEventBody,
  type CreateTrackBody,
  type PatchTrackBody,
  type CreatePrizeBody,
  type PatchPrizeBody,
} from "./schemas/events.js";

export { createTeamBodySchema, type CreateTeamBody } from "./schemas/teams.js";

export {
  createProjectBodySchema,
  patchProjectBodySchema,
  galleryQuerySchema,
  type CreateProjectBody,
  type PatchProjectBody,
  type GalleryQuery,
} from "./schemas/projects.js";

export {
  criterionInputSchema,
  putCriteriaBodySchema,
  judgeInviteBodySchema,
  judgeTracksBodySchema,
  manualAssignmentBodySchema,
  scoreUpdateBodySchema,
  judgeScoresQuerySchema,
  exportQuerySchema,
  auditQuerySchema,
  type PutCriteriaBody,
  type JudgeInviteBody,
  type JudgeTracksBody,
  type ManualAssignmentBody,
  type ScoreUpdateBody,
} from "./schemas/judging.js";

export { castVoteBodySchema, type CastVoteBody } from "./schemas/voting.js";
