import { PageHeader } from "@/components/admin/page-header";
import { TestimonialsManager } from "@/components/admin/testimonials/testimonials-manager";
import { getDb } from "@/db/client";
import { listTestimonialsAdmin } from "@/features/testimonials/queries";
import { requireAdminPage } from "@/lib/auth/guards";

export const metadata = { title: "Testimonials" };
export const instant = false;

export default async function TestimonialsPage() {
  const { user } = await requireAdminPage();
  const db = await getDb();
  const testimonials = await listTestimonialsAdmin(db);
  return (
    <>
      <PageHeader
        title="Testimonials"
        description="What clients say. Drag to set the order; only the ones shown on the site appear."
        breadcrumb={[{ label: "Website" }, { label: "Testimonials" }]}
      />
      <TestimonialsManager testimonials={testimonials} readOnly={user.readOnly} />
    </>
  );
}
