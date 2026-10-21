import { BlogTabs } from "@/components/admin/blog/blog-tabs";
import { CategoriesManager } from "@/components/admin/blog/categories-manager";
import { PageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db/client";
import { listCategories, listTags } from "@/features/blog/queries";
import { loadSettings } from "@/features/settings/queries";
import { requireAdminPage } from "@/lib/auth/guards";

export const metadata = { title: "Blog categories and tags" };
export const instant = false;

export default async function BlogCategoriesPage() {
  const { user } = await requireAdminPage();
  const db = await getDb();
  const categories = await listCategories(db);
  const tags = await listTags(db);
  const general = await loadSettings("general", db);
  return (
    <>
      <PageHeader
        title="Blog"
        description="Categories become tabs and pages on the site; tags group related posts."
        breadcrumb={[
          { label: "Website" },
          { label: "Blog", href: "/admin/website/blog" },
          { label: "Categories and tags" },
        ]}
      />
      <BlogTabs current="categories" />
      <CategoriesManager
        categories={categories}
        tags={tags}
        siteName={general.agencyName}
        readOnly={user.readOnly}
      />
    </>
  );
}
