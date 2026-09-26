import type { PlatformRole } from "@prisma/client";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  platformRole: PlatformRole;
  createdAt: Date;
};

export type RequestSession = {
  id: string;
  tokenHash: string;
};

declare global {
  // Express augments Request via its namespace pattern.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      session?: RequestSession;
    }
  }
}

export {};
