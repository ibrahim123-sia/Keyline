import "server-only";
import { and, asc, count, desc, eq, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { contacts, leads } from "@/db/schema/crm";
import { leadStages } from "@/db/schema/master-data";
import type { TableParams } from "@/lib/table-params";

export const contactSortable = ["name", "created", "activity"] as const;
export type ContactSort = (typeof contactSortable)[number];

export type ContactRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  leads: number;
  openLeads: number;
  lastActivityAt: string | null;
  createdAt: string;
  tags: string[];
};

const leadCount = sql<number>`(select count(*)::int from ${leads} where ${leads.contactId} = ${contacts.id} and ${leads.mergedIntoId} is null)`;
const openCount = sql<number>`(select count(*)::int from ${leads} where ${leads.contactId} = ${contacts.id} and ${leads.mergedIntoId} is null and ${leads.status} = 'open')`;
const lastActivity = sql<Date | null>`(select max(${leads.lastActivityAt}) from ${leads} where ${leads.contactId} = ${contacts.id})`;

function searchWhere(q: string): SQL[] {
  const where: SQL[] = [eq(contacts.agencyId, currentAgencyId()), isNull(contacts.mergedIntoId)];
  if (q) {
    const digits = q.replace(/\D/g, "");
    const parts: SQL[] = [
      sql`lintel_normalize(${contacts.name}) like '%' || lintel_normalize(${q}) || '%'`,
      sql`${contacts.email} like ${`%${q.toLowerCase()}%`}`,
    ];
    if (digits.length >= 4) parts.push(sql`${contacts.phone} like ${`%${digits}%`}`);
    where.push(sql`(${sql.join(parts, sql` or `)})`);
  }
  return where;
}

/** Admin -> Contacts (09 §4): people, each with their leads. */
export async function listContacts(
  params: TableParams<ContactSort>,
  db: DbOrTx,
): Promise<{ rows: ContactRow[]; total: number }> {
  const where = and(...searchWhere(params.q));
  const column =
    params.sort.id === "name"
      ? sql`lower(${contacts.name})`
      : params.sort.id === "activity"
        ? lastActivity
        : sql`${contacts.createdAt}`;
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
      phone: contacts.phone,
      leads: leadCount,
      openLeads: openCount,
      lastActivityAt: lastActivity,
      createdAt: contacts.createdAt,
      tags: contacts.tags,
    })
    .from(contacts)
    .where(where)
    .orderBy(
      params.sort.desc ? sql`${column} desc nulls last` : sql`${column} asc nulls last`,
      asc(contacts.id),
    )
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);
  const [{ n }] = (await db.select({ n: count() }).from(contacts).where(where)) as [{ n: number }];
  return {
    rows: rows.map((r) => ({
      ...r,
      lastActivityAt: r.lastActivityAt ? new Date(r.lastActivityAt).toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    })),
    total: n,
  };
}

/** One contact, their leads, and other contacts that may be the same person. */
export async function loadContactPage(db: DbOrTx, id: string) {
  const agency = currentAgencyId();
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.agencyId, agency)));
  if (!contact) return null;
  const leadRows = await db
    .select({
      id: leads.id,
      type: leads.type,
      status: leads.status,
      source: leads.source,
      stageName: leadStages.name,
      createdAt: leads.createdAt,
      lastActivityAt: leads.lastActivityAt,
    })
    .from(leads)
    .leftJoin(leadStages, eq(leadStages.id, leads.stageId))
    .where(and(eq(leads.contactId, contact.id), isNull(leads.mergedIntoId)))
    .orderBy(desc(leads.createdAt));
  const same: SQL[] = [sql`lintel_normalize(${contacts.name}) = lintel_normalize(${contact.name})`];
  if (contact.email) same.push(eq(contacts.email, contact.email));
  if (contact.phone)
    same.push(eq(contacts.phone, contact.phone), eq(contacts.whatsapp, contact.phone));
  const duplicates = contact.mergedIntoId
    ? []
    : await db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.agencyId, agency),
            isNull(contacts.mergedIntoId),
            ne(contacts.id, contact.id),
            or(...same),
          ),
        )
        .orderBy(asc(contacts.createdAt))
        .limit(10);
  const pick = (c: typeof contact) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    whatsapp: c.whatsapp,
    nationality: c.nationality,
    preferredContact: c.preferredContact,
    preferredLanguage: c.preferredLanguage,
    marketingConsent: c.marketingConsent,
    tags: c.tags,
    mergedIntoId: c.mergedIntoId,
    createdAt: c.createdAt.toISOString(),
  });
  return {
    contact: pick(contact),
    leads: leadRows.map((l) => ({
      ...l,
      createdAt: l.createdAt.toISOString(),
      lastActivityAt: l.lastActivityAt.toISOString(),
    })),
    duplicates: duplicates.map(pick),
  };
}

export type ContactPageData = NonNullable<Awaited<ReturnType<typeof loadContactPage>>>;
