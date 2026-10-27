import { AnnouncementForm } from "@/components/admin/menus/announcement-form";
import { FooterSettingsForm } from "@/components/admin/menus/footer-settings-form";
import { MenusManager } from "@/components/admin/menus/menus-manager";
import { PageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db/client";
import { loadMenus, menuTargetOptions } from "@/features/menus/queries";
import { loadSettings } from "@/features/settings/queries";
import { requireAdminPage } from "@/lib/auth/guards";

export const metadata = { title: "Menus" };
export const instant = false;

const tabs = ["header", "mobile", "footer", "announcement"];

export default async function MenusPage(props: PageProps<"/admin/website/menus">) {
  const { user } = await requireAdminPage();
  const { tab } = await props.searchParams;
  const db = await getDb();
  const [menus, options, website, general] = await Promise.all([
    loadMenus(db),
    menuTargetOptions(db),
    loadSettings("website", db),
    loadSettings("general", db),
  ]);
  const now = new Date().getTime();
  return (
    <>
      <PageHeader
        title="Menus"
        description="The links in the site header, the phone menu and the footer, the footer text and the announcement bar."
        breadcrumb={[{ label: "Website" }, { label: "Menus" }]}
      />
      <MenusManager
        menus={menus}
        options={options}
        tab={tabs.find((t) => t === tab) ?? "header"}
        readOnly={user.readOnly}
        footerSettings={
          <FooterSettingsForm
            initial={website.footer}
            shortDescription={general.shortDescription}
            readOnly={user.readOnly}
          />
        }
        announcement={
          <AnnouncementForm
            initial={website.announcement}
            timeZone={general.timeZone}
            now={now}
            readOnly={user.readOnly}
          />
        }
      />
    </>
  );
}
