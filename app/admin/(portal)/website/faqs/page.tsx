import { FaqsManager } from "@/components/admin/faqs/faqs-manager";
import { PageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db/client";
import { listFaqsAdmin } from "@/features/faqs/queries";
import { requireAdminPage } from "@/lib/auth/guards";

export const metadata = { title: "FAQs" };
export const instant = false;

export default async function FaqsPage() {
  const { user } = await requireAdminPage();
  const db = await getDb();
  const faqs = await listFaqsAdmin(db);
  return (
    <>
      <PageHeader
        title="FAQs"
        description="Questions and answers for pages and the assistant. Area guides keep their own."
        breadcrumb={[{ label: "Website" }, { label: "FAQs" }]}
      />
      <FaqsManager faqs={faqs} readOnly={user.readOnly} />
    </>
  );
}
