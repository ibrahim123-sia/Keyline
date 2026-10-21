import { BlogTabs } from "@/components/admin/blog/blog-tabs";
import { PostsManager } from "@/components/admin/blog/posts-manager";
import { PageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db/client";
import { categoryOptions, listPosts, postSortable } from "@/features/blog/queries";
import { requireAdminPage } from "@/lib/auth/guards";
import { parseTableParams } from "@/lib/table-params";

export const metadata = { title: "Blog" };
export const instant = false;

export default async function BlogPage(props: PageProps<"/admin/website/blog">) {
  const { user } = await requireAdminPage();
  const params = parseTableParams(await props.searchParams, {
    sortable: postSortable,
    defaultSort: { id: "updated", desc: true },
  });
  const db = await getDb();
  const { rows, total } = await listPosts(params, db);
  const categories = await categoryOptions(db);
  return (
    <>
      <PageHeader
        title="Blog"
        description="Insights posts: write, schedule and publish. Posts can show listing cards and link to your areas."
        breadcrumb={[{ label: "Website" }, { label: "Blog" }]}
      />
      <BlogTabs current="posts" />
      <PostsManager
        rows={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        sort={params.sort}
        categories={categories}
        readOnly={user.readOnly}
      />
    </>
  );
}
