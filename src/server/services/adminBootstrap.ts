import { getCodec, getDb } from "../core/database";
import { getLogger } from "../core/logger";
import { hashPassword } from "../core/security";
import { toOrganization, toUser, UserRole, type Organization, type User } from "../models/entities";
import { auditService } from "./auditService";

const logger = getLogger("leadgen.bootstrap");

export class AlreadyBootstrappedError extends Error {
  constructor() {
    super("Application is already bootstrapped. An administrator account already exists.");
    this.name = "AlreadyBootstrappedError";
  }
}

export interface BootstrapInput {
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  orgName: string;
  orgSlug: string;
}

class AdminBootstrapService {
  async isAdminBootstrapped(): Promise<boolean> {
    const row = await getDb().selectFrom("users").select("id").where("role", "=", UserRole.ADMIN).limit(1).executeTakeFirst();
    return row !== undefined;
  }

  /**
   * Creates the primary organization and the initial administrator account.
   * Refused once any administrator exists.
   */
  async bootstrapInitialAdmin(input: BootstrapInput): Promise<{ user: User; organization: Organization }> {
    const db = getDb();
    const codec = getCodec();
    const hashedPassword = await hashPassword(input.adminPassword);

    const { user, organization } = await db.transaction().execute(async (trx) => {
      const existingAdmin = await trx.selectFrom("users").select("id").where("role", "=", UserRole.ADMIN).limit(1).executeTakeFirst();
      if (existingAdmin) throw new AlreadyBootstrappedError();

      const now = codec.date(new Date());
      let orgRow = await trx.selectFrom("organizations").selectAll().where("slug", "=", input.orgSlug).executeTakeFirst();
      if (!orgRow) {
        orgRow = await trx
          .insertInto("organizations")
          .values({ name: input.orgName, slug: input.orgSlug, created_at: now })
          .returningAll()
          .executeTakeFirstOrThrow();
      }
      const userRow = await trx
        .insertInto("users")
        .values({
          org_id: orgRow.id,
          email: input.adminEmail.trim().toLowerCase(),
          hashed_password: hashedPassword,
          full_name: input.adminName.trim(),
          role: UserRole.ADMIN,
          is_active: codec.bool(true),
          created_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return { user: toUser(codec, userRow), organization: toOrganization(codec, orgRow) };
    });

    await auditService.logEvent({
      action: "BOOTSTRAP_ADMIN",
      resource: `user:${user.id}`,
      status: "SUCCESS",
      orgId: organization.id,
      userId: user.id,
      details: { email: user.email, org_slug: organization.slug },
    });
    logger.info(`Initial administrator bootstrapped: ${user.email} (Org: ${organization.name})`);
    return { user, organization };
  }
}

export const adminBootstrapService = new AdminBootstrapService();
