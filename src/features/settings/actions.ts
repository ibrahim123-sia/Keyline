"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { settingGroups, type SettingGroup } from "@/db/schema/system";
import { requireAdmin } from "@/lib/auth/guards";
import { ActionError, errorsByPath, toActionError, type ActionResult } from "@/lib/actions";
import { tags } from "@/lib/cache-tags";
import { saveSettings } from "./mutations";
import { parseGroupInput, type SettingsOf } from "./schema";

/** Changing these needs a recent sign-in (03 rules: re-auth for sensitive actions). */
const sensitiveGroups: readonly SettingGroup[] = ["security", "integrations"];

const inputSchema = z.object({ group: z.enum(settingGroups), value: z.unknown() }).strict();

/**
 * Saves one Settings tab (04): strict validation of the whole group (unknown keys refused),
 * audit entry with only the changed keys, then the group's cache tag is refreshed.
 */
export async function saveSettingsGroup<G extends SettingGroup>(input: {
  group: G;
  value: SettingsOf<G>;
}): Promise<ActionResult<SettingsOf<G>>> {
  try {
    const { group, value } = inputSchema.parse(input);
    const ctx = await requireAdmin({ write: true, sensitive: sensitiveGroups.includes(group) });
    const parsed = parseGroupInput(group, value);
    if (!parsed.success) {
      const { fieldErrors, formErrors } = errorsByPath(parsed.error);
      throw new ActionError(
        formErrors[0] ?? "Please check the highlighted fields.",
        "VALIDATION",
        fieldErrors,
      );
    }
    const db = await getDb();
    const saved = await db.transaction((tx) =>
      saveSettings(tx, group, parsed.data as SettingsOf<typeof group>, ctx.actor),
    );
    updateTag(tags.settings(group));
    return { ok: true, data: saved as SettingsOf<G> };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, error: "Unknown settings group.", code: "VALIDATION" };
    }
    return toActionError(err);
  }
}
