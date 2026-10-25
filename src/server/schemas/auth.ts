import { z } from "zod";
import { USER_ROLES, type Organization, type User } from "../models/entities";

export const PASSWORD_MIN_LENGTH = 8;

/** Trimmed, length-bounded email address. */
const emailField = z.string().trim().max(255).pipe(z.email());

export const userLoginRequestSchema = z.object({
  email: emailField,
  password: z.string().min(1).max(1024),
});

export const bootstrapRequestSchema = z.object({
  admin_email: emailField,
  admin_password: z.string().min(PASSWORD_MIN_LENGTH).max(1024),
  admin_name: z.string().trim().min(1).max(255),
  org_name: z.string().trim().min(1).max(255),
  org_slug: z.string().trim().min(1).max(100),
});

export { DEFAULT_STARTING_CREDITS } from "@/lib/credits";

export const adminCreateUserRequestSchema = z.object({
  email: emailField,
  password: z.string().min(PASSWORD_MIN_LENGTH).max(1024),
  full_name: z.string().trim().min(1).max(255),
  role: z.enum(USER_ROLES).default("MEMBER"),
  /** Credit operators only: create the user in a new workspace with this name (instead of the admin's own). */
  workspace_name: z.string().trim().min(1).max(255).nullable().default(null),
  /** Credit operators only, with `workspace_name`: credits the new workspace starts with. */
  starting_credits: z.number().int().min(0).max(1_000_000).nullable().default(null),
});

export const adminUpdateUserRequestSchema = z.object({
  role: z.enum(USER_ROLES).nullable().default(null),
  is_active: z.boolean().nullable().default(null),
});

export interface UserResponse {
  id: number;
  email: string;
  full_name: string;
  role: string;
  org_id: number;
  is_active: boolean;
}

export interface OrganizationResponse {
  id: number;
  name: string;
  slug: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
  user: UserResponse;
}

export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    org_id: user.org_id,
    is_active: user.is_active,
  };
}

export function toOrganizationResponse(org: Organization): OrganizationResponse {
  return { id: org.id, name: org.name, slug: org.slug };
}
