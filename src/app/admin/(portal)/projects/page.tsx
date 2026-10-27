import { PageHeader } from "@/components/admin/page-header";
import { ProjectsManager } from "@/components/admin/projects/projects-manager";
import { getDb } from "@/db/client";
import { listProjects, projectFilterOptions, projectSortable } from "@/features/projects/queries";
import { requireAdminPage } from "@/lib/auth/guards";
import { parseTableParams } from "@/lib/table-params";

export const metadata = { title: "Projects" };
export const instant = false;

export default async function ProjectsPage(props: PageProps<"/admin/projects">) {
  const { user } = await requireAdminPage();
  const params = parseTableParams(await props.searchParams, {
    sortable: projectSortable,
    defaultSort: { id: "updated", desc: true },
  });
  const db = await getDb();
  const { rows, total } = await listProjects(params, db);
  const options = await projectFilterOptions(db);
  return (
    <>
      <PageHeader
        title="Projects"
        description="Off-plan developments: unit types, payment plan and progress. Their listings inherit the handover and plan."
        breadcrumb={[{ label: "Projects" }]}
      />
      <ProjectsManager
        rows={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        sort={params.sort}
        developers={options.developers}
        locations={options.locations}
        readOnly={user.readOnly}
      />
    </>
  );
}
