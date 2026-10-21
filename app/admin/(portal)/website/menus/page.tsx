import { MenusManager } from "@/components/admin/menus/menus-manager";
import { PageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db/client";
import { loadMenus, menuTargetOptions } from "@/features/menus/queries";
import { requireAdminPage } from "@/lib/auth/guards";

export const metadata = { title: "Menus" };
export const instant = false;

const tabs = ["header", "mobile", "footer"];

export default async function MenusPage(props: PageProps<"/admin/website/menus">) {
  const { user } = await requireAdminPage();
  const { tab } = await props.searchParams;
  const db = await getDb();
  const [menus, options] = await Promise.all([loadMenus(db), menuTargetOptions(db)]);
  return (
    <>
      <PageHeader
        title="Menus"
        description="The links in the site header, the phone menu and the footer columns."
        breadcrumb={[{ label: "Website" }, { label: "Menus" }]}
      />
      <MenusManager
        menus={menus}
        options={options}
        tab={tabs.find((t) => t === tab) ?? "header"}
        readOnly={user.readOnly}
      />
    </>
  );
}
