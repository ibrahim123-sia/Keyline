import { and, asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { apiTokens, users } from "@/db/schema/auth";

export type AdminRow = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  readOnly: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  invitedByName: string | null;
  /** Invited but has never signed in. */
  pending: boolean;
};

export async function listAdmins(db?: DbOrTx): Promise<AdminRow[]> {
  const conn = db ?? (await getDb());
  const inviter = alias(users, "inviter");
  const rows = await conn
    .select({
      user: users,
      invitedByName: inviter.name,
    })
    .from(users)
    .leftJoin(inviter, eq(inviter.id, users.invitedBy))
    .where(and(eq(users.role, "admin"), eq(users.agencyId, currentAgencyId())))
    .orderBy(desc(users.isActive), asc(sql`lower(${users.name})`));
  return rows.map(({ user: u, invitedByName }) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    isActive: u.isActive,
    readOnly: u.readOnly,
    twoFactorEnabled: u.twoFactorEnabled,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    invitedByName,
    pending: u.lastLoginAt === null && u.invitedBy !== null,
  }));
}

export type ApiTokenRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  ownerId: string;
  ownerName: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  expired: boolean;
};

/** Every admin's API tokens (MCP, 10 §4); admins can revoke any of them. */
export async function listApiTokens(db?: DbOrTx): Promise<ApiTokenRow[]> {
  const conn = db ?? (await getDb());
  const rows = await conn
    .select({ token: apiTokens, ownerName: users.name })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(eq(apiTokens.agencyId, currentAgencyId()))
    .orderBy(desc(apiTokens.createdAt));
  const now = Date.now();
  return rows.map(({ token: t, ownerName }) => ({
    id: t.id,
    name: t.name,
    prefix: t.tokenPrefix,
    scopes: t.scopes,
    ownerId: t.userId,
    ownerName,
    createdAt: t.createdAt.toISOString(),
    lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
    expiresAt: t.expiresAt?.toISOString() ?? null,
    revokedAt: t.revokedAt?.toISOString() ?? null,
    expired: t.expiresAt !== null && t.expiresAt.getTime() < now,
  }));
}
