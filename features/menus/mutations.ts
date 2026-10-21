import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DbOrTx, Tx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { pages } from "@/db/schema/cms";
import { menus, postCategories } from "@/db/schema/content";
import { locations } from "@/db/schema/master-data";
import { projects } from "@/db/schema/projects";
import { auditChange, writeAudit, type AuditActor } from "@/lib/audit";
import { menuLinkLabels, type MenuData, type MenuItemData, type MenuLinkType } from "./schema";

type Located = { path: string; type: MenuLinkType; target: string };

function targetsOf(items: MenuItemData[]): Located[] {
  return items.flatMap((item, i) => [
    { path: `items.${i}.target`, type: item.type, target: item.target },
    ...item.children.map((c, j) => ({
      path: `items.${i}.children.${j}.target`,
      type: c.type,
      target: c.target,
    })),
  ]);
}

/**
 * Field errors for links whose page, area, project or category no longer exists (drafts are
 * fine: their links show once they are published).
 */
export async function missingTargets(
  db: DbOrTx,
  items: MenuItemData[],
): Promise<Record<string, string[]>> {
  const agency = currentAgencyId();
  const all = targetsOf(items).filter((t) => t.type !== "url" && t.type !== "search");
  const want = (type: MenuLinkType) => [
    ...new Set(all.filter((t) => t.type === type).map((t) => t.target)),
  ];
  const found = new Set<string>();
  const note = (type: MenuLinkType, ids: Array<{ id: string }>) =>
    ids.forEach((r) => found.add(`${type}:${r.id}`));

  if (want("page").length)
    note(
      "page",
      await db
        .select({ id: pages.id })
        .from(pages)
        .where(
          and(eq(pages.agencyId, agency), inArray(pages.id, want("page")), isNull(pages.deletedAt)),
        ),
    );
  if (want("project").length)
    note(
      "project",
      await db
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.agencyId, agency),
            inArray(projects.id, want("project")),
            isNull(projects.deletedAt),
          ),
        ),
    );
  if (want("area").length)
    note(
      "area",
      await db
        .select({ id: locations.id })
        .from(locations)
        .where(and(eq(locations.agencyId, agency), inArray(locations.id, want("area")))),
    );
  if (want("category").length)
    note(
      "category",
      await db
        .select({ id: postCategories.id })
        .from(postCategories)
        .where(
          and(eq(postCategories.agencyId, agency), inArray(postCategories.id, want("category"))),
        ),
    );

  const errors: Record<string, string[]> = {};
  for (const t of all)
    if (!found.has(`${t.type}:${t.target}`))
      errors[t.path] = [`This ${menuLinkLabels[t.type].toLowerCase()} no longer exists`];
  return errors;
}

/** Saves one menu location (one row per location), audited. */
export async function writeMenu(
  tx: Tx,
  data: MenuData,
  actor: AuditActor,
): Promise<typeof menus.$inferSelect> {
  const agency = currentAgencyId();
  const [before] = await tx
    .select()
    .from(menus)
    .where(and(eq(menus.agencyId, agency), eq(menus.location, data.location)))
    .limit(1);
  const values = { title: data.title || null, items: data.items, updatedBy: actor.id };
  if (before) {
    const [after] = await tx.update(menus).set(values).where(eq(menus.id, before.id)).returning();
    await auditChange(tx, {
      actor,
      action: "menu.update",
      entityType: "menu",
      entityId: before.id,
      before: { title: before.title, items: before.items },
      after: { title: after!.title, items: after!.items },
    });
    return after!;
  }
  const [created] = await tx
    .insert(menus)
    .values({ location: data.location, ...values, createdBy: actor.id })
    .returning();
  await writeAudit(tx, {
    actor,
    action: "menu.create",
    entityType: "menu",
    entityId: created!.id,
    before: null,
    after: { location: created!.location, title: created!.title, items: created!.items },
  });
  return created!;
}
