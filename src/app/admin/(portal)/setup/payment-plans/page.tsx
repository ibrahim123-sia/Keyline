import { PageHeader } from "@/components/admin/page-header";
import { PlanTemplatesManager } from "@/components/admin/payment-plans/plan-templates-manager";
import { getDb } from "@/db/client";
import { listTemplates, planInput } from "@/features/payment-plans/store";
import { loadSettings } from "@/features/settings/queries";
import { requireAdminPage } from "@/lib/auth/guards";

export const metadata = { title: "Payment plans" };
export const instant = false;

export default async function PaymentPlansPage() {
  const { user } = await requireAdminPage();
  const db = await getDb();
  const [templates, market] = await Promise.all([listTemplates(db), loadSettings("market", db)]);
  return (
    <>
      <PageHeader
        title="Payment plans"
        description="Templates for off-plan payment plans. Projects and listings start from one and can change it."
        breadcrumb={[{ label: "Setup" }, { label: "Payment plans" }]}
      />
      <PlanTemplatesManager
        templates={templates.map((t) => ({
          id: t.id,
          plan: planInput(t),
          updatedAt: t.updatedAt.toISOString(),
        }))}
        currency={market.baseCurrency}
        readOnly={user.readOnly}
      />
    </>
  );
}
