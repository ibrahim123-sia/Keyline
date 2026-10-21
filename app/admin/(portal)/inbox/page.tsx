import { redirect } from "next/navigation";
import { InboxView } from "@/components/admin/inbox/inbox-view";
import { PageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db/client";
import {
  inboxCounts,
  listApprovals,
  listConversations,
  listQuickReplies,
  loadConversation,
  type InboxFilter,
} from "@/features/inbox/queries";
import { leadConversation } from "@/features/inbox/store";
import { loadSettings } from "@/features/settings/queries";
import { requireAdminPage } from "@/lib/auth/guards";
import { inbox as t } from "@/lib/i18n/dictionaries/inbox";

export const metadata = { title: "Inbox" };
export const instant = false;

const statuses = ["open", "all", "ai", "needs_human", "human", "closed"] as const;
const channels = ["all", "web_chat", "whatsapp", "email"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const pick = <T extends string>(list: readonly T[], v: string, fallback: T): T =>
  (list as readonly string[]).includes(v) ? (v as T) : fallback;

/** Admin -> Inbox (09 §6). `?lead=<id>` opens (or starts) that lead's conversation. */
export default async function InboxPage({ searchParams }: PageProps<"/admin/inbox">) {
  const { user } = await requireAdminPage();
  const sp = await searchParams;
  const db = await getDb();

  const leadId = one(sp.lead);
  if (UUID.test(leadId)) {
    // Read-only viewers can open an existing conversation but never start one.
    const conv = user.readOnly
      ? null
      : await leadConversation(
          db,
          leadId,
          new Date(),
          pick(channels, one(sp.channel), "all") === "email" ? "email" : undefined,
        );
    if (conv) redirect(`/admin/inbox?c=${conv.id}`);
  }

  const filter: InboxFilter = {
    status: pick(statuses, one(sp.status), "open"),
    channel: pick(channels, one(sp.channel), "all"),
    q: one(sp.q).slice(0, 100),
    unread: one(sp.unread) === "1",
  };
  const view = one(sp.view) === "approvals" ? "approvals" : "conversations";
  const selectedId = one(sp.c);
  const list = await listConversations(db, filter);
  const counts = await inboxCounts(db);
  const quickReplies = await listQuickReplies(db);
  const { whatsapp } = await loadSettings("integrations", db);
  const selected = UUID.test(selectedId) ? await loadConversation(db, selectedId) : null;
  const approvals = view === "approvals" ? await listApprovals(db) : [];
  const templates = Object.entries(whatsapp.templates)
    .filter(([, m]) => m.name)
    .map(([key, m]) => ({ key, name: m.name, variables: m.variables }));

  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      <InboxView
        filter={filter}
        view={view}
        list={list}
        counts={counts}
        selected={selected}
        approvals={approvals}
        quickReplies={quickReplies}
        templates={templates}
        readOnly={user.readOnly}
      />
    </>
  );
}
