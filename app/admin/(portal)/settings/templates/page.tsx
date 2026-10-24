import { PageHeader } from "@/components/admin/page-header";
import { TemplatesEditor } from "@/components/admin/settings/templates-editor";
import { getDb } from "@/db/client";
import { templatesForAdmin } from "@/features/messages/admin";
import { requireAdminPage } from "@/lib/auth/guards";

export const metadata = { title: "Message templates" };
export const instant = false;

/** Settings -> Message templates (13 §1, §3): the wording of every email and WhatsApp message. */
export default async function MessageTemplatesPage() {
  const { user } = await requireAdminPage();
  const rows = await templatesForAdmin(await getDb());
  return (
    <>
      <PageHeader
        title="Message templates"
        description="The emails and WhatsApp messages Keyline sends to visitors and to your team. Change the wording, turn a message off, or go back to the built-in text at any time."
        breadcrumb={[
          { label: "Settings", href: "/admin/settings" },
          { label: "Message templates" },
        ]}
      />
      <TemplatesEditor rows={rows} readOnly={user.readOnly} />
    </>
  );
}
