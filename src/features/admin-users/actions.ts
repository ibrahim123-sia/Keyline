"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { users } from "@/db/schema/auth";
import { adminAction } from "@/lib/actions";
import { writeAudit } from "@/lib/audit";

/** Light / dark preference per admin (02 §3). A personal preference, so allowed in read-only mode. */
const saveAdminThemeAction = adminAction(z.enum(["light", "dark"]), {}, async (theme, ctx) => {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.update(users).set({ adminTheme: theme }).where(eq(users.id, ctx.user.id));
    await writeAudit(tx, {
      actor: ctx.actor,
      action: "user.theme",
      entityType: "user",
      entityId: ctx.user.id,
      before: { adminTheme: ctx.user.adminTheme },
      after: { adminTheme: theme },
    });
  });
  refresh();
  return theme;
});

export async function saveAdminTheme(theme: "light" | "dark"): Promise<void> {
  await saveAdminThemeAction(theme);
}
