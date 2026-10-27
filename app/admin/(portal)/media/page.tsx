import { writingHelpersOn } from "@/features/ai/config";
import { PageHeader } from "@/components/admin/page-header";
import { MediaLibrary } from "@/components/admin/media/media-library";
import { getDb } from "@/db/client";
import { listFolders, listMedia, mediaSortable } from "@/features/media/queries";
import { loadSettings } from "@/features/settings/queries";
import { requireAdminPage } from "@/lib/auth/guards";
import { first, parseTableParams } from "@/lib/table-params";

export const metadata = { title: "Media" };
export const instant = false;

export default async function MediaPage(props: PageProps<"/admin/media">) {
  const { user } = await requireAdminPage();
  const sp = await props.searchParams;
  const params = parseTableParams(sp, {
    sortable: mediaSortable,
    defaultSort: { id: "newest", desc: false },
    pageSize: 48,
    maxPageSize: 96,
  });
  const db = await getDb();
  const [{ rows, total }, folders, general] = await Promise.all([
    listMedia(params, db),
    listFolders(db),
    loadSettings("general", db),
  ]);
  return (
    <>
      <PageHeader
        title="Media"
        description="Photos, logos and documents used across the site and in listings."
      />
      <MediaLibrary
        items={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        sort={params.sort}
        folders={folders}
        folder={params.get("folder") ?? null}
        view={first(sp.view) === "list" ? "list" : "grid"}
        maxUploadMb={general.maxUploadMb}
        readOnly={user.readOnly}
        aiHelpers={!user.readOnly && (await writingHelpersOn(db))}
      />
    </>
  );
}
