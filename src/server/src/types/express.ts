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

export type RequestApiKey = {
  id: string;
  eventId: string | null;
  ownerId: string;
  name: string;
  prefix: string;
  scopes: string[];
};

declare global {
  // Express augments Request via its namespace pattern.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      session?: RequestSession;
      apiKey?: RequestApiKey;
    }
  }
}

export {};
