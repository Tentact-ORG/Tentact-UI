import "server-only";
import { getCodec, getDb } from "@/server/core/database";
import { toUser, type User } from "@/server/models/entities";

export interface SignedInUser {
  user: User;
  /** Display name of the user's organization, shown as the workspace name. */
  workspaceName: string;
}

/** The user with this id if the account exists and is active, together with its workspace name. */
export async function loadActiveUser(userId: number): Promise<SignedInUser | null> {
  const row = await getDb()
    .selectFrom("users")
    .innerJoin("organizations", "organizations.id", "users.org_id")
    .selectAll("users")
    .select("organizations.name as org_name")
    .where("users.id", "=", userId)
    .executeTakeFirst();
  if (!row) return null;

  const { org_name: orgName, ...userRow } = row;
  const user = toUser(getCodec(), userRow);
  if (!user.is_active) return null;
  return { user, workspaceName: orgName };
}
