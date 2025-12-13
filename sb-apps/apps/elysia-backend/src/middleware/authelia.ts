import { Elysia } from "elysia";

export interface AutheliaUser {
  username: string;
  groups: string[];
  email?: string;
  name?: string;
}

export const autheliaMiddleware = new Elysia({ name: "authelia" })
  .derive({ as: "scoped" }, ({ request }): { user: AutheliaUser | null } => {
    const username = request.headers.get("Remote-User");
    const groups = request.headers.get("Remote-Groups");
    const email = request.headers.get("Remote-Email");
    const name = request.headers.get("Remote-Name");

    if (!username) {
      return { user: null };
    }

    return {
      user: {
        username,
        groups: groups?.split(",").map((g) => g.trim()) ?? [],
        email: email ?? undefined,
        name: name ?? undefined,
      },
    };
  })
  .macro({
    requireAuth: (enabled: boolean) => ({
      beforeHandle({ user, set }) {
        if (enabled && !user) {
          set.status = 401;
          return { error: "Unauthorized" };
        }
      },
    }),
    requireGroup: (group: string) => ({
      beforeHandle({ user, set }) {
        if (!user) {
          set.status = 401;
          return { error: "Unauthorized" };
        }
        if (!user.groups.includes(group)) {
          set.status = 403;
          return { error: "Forbidden" };
        }
      },
    }),
  });
