"use client";

import { AiDraftDialog } from "@/components/admin/ai/ai-draft-dialog";
import { aiDraftBlogPost } from "@/features/ai/helper-actions";

import { SparklesIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { ContentStatusPill } from "@/components/admin/content/publish-panel";
import { DataTable, UrlFilterSelect, type ColumnDef } from "@/components/admin/data-table";
import { contentStatuses } from "@/db/schema/content";
import type { CategoryOption, PostListRow } from "@/features/blog/queries";
import { contentStatusLabels } from "@/features/blog/schema";
import { useHydrated } from "@/lib/use-hydrated";
import { NewPostDialog } from "./new-post-dialog";

const dateFormat = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const dateTimeFormat = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** The publish date, or when it is scheduled to go out (in the browser's time). */
function PublishDate({ post }: { post: PostListRow }) {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  if (post.status === "scheduled" && post.publishAt)
    return (
      <span className="whitespace-nowrap">{dateTimeFormat.format(new Date(post.publishAt))}</span>
    );
  if (post.publishedAt)
    return (
      <span className="whitespace-nowrap">{dateFormat.format(new Date(post.publishedAt))}</span>
    );
  return <span className="text-text-muted">—</span>;
}

/** Admin -> Website -> Blog (08 §3): posts with status, category, author, date and views. */
export function PostsManager({
  rows,
  total,
  page,
  pageSize,
  sort,
  categories,
  readOnly,
  aiHelpers,
}: {
  rows: PostListRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: { id: string; desc: boolean };
  categories: CategoryOption[];
  readOnly?: boolean;
  /** Settings -> AI writing helpers: a draft from a brief. */
  aiHelpers?: boolean;
}) {
  const router = useRouter();
  const columns = useMemo<ColumnDef<PostListRow, unknown>[]>(
    () => [
      {
        id: "post",
        header: "Post",
        meta: { sortKey: "title", label: "Post" },
        cell: ({ row: { original: p } }) => (
          <div className="flex min-w-64 items-center gap-3">
            <div className="h-11 w-16 shrink-0 overflow-hidden rounded-md bg-photo-placeholder">
              {p.coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- /media resizes on its own
                <img
                  src={`${p.coverUrl}?w=128&q=60`}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="min-w-0">
              <Link
                href={`/admin/website/blog/${p.id}`}
                onClick={(e) => e.stopPropagation()}
                className="block truncate font-semibold text-ink hover:underline"
              >
                {p.title}
              </Link>
              <p className="flex items-center gap-1.5 truncate text-[12px] text-text-muted">
                /insights/{p.slug}
                {p.isAiDrafted && (
                  <span className="inline-flex items-center gap-0.5 text-accent">
                    <SparklesIcon className="size-3" aria-hidden /> AI draft
                  </span>
                )}
              </p>
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        meta: { label: "Status" },
        cell: ({ row: { original: p } }) => <ContentStatusPill status={p.status} />,
      },
      {
        id: "category",
        header: "Category",
        meta: { label: "Category" },
        cell: ({ row: { original: p } }) =>
          p.categoryName ?? <span className="text-text-muted">—</span>,
      },
      {
        id: "author",
        header: "Author",
        meta: { label: "Author" },
        cell: ({ row: { original: p } }) => p.author ?? <span className="text-text-muted">—</span>,
      },
      {
        id: "published",
        header: "Date",
        meta: { sortKey: "published", label: "Date" },
        cell: ({ row: { original: p } }) => <PublishDate post={p} />,
      },
      {
        id: "views",
        header: "Views",
        meta: { sortKey: "views", label: "Views", className: "text-end" },
        cell: ({ row: { original: p } }) => <span className="tabular">{p.viewsCount}</span>,
      },
    ],
    [],
  );

  return (
    <DataTable
      tableId="posts"
      columns={columns}
      rows={rows}
      total={total}
      page={page}
      pageSize={pageSize}
      sort={sort}
      getRowId={(r) => r.id}
      onRowClick={(r) => router.push(`/admin/website/blog/${r.id}`)}
      searchPlaceholder="Search posts"
      toolbar={
        <>
          <UrlFilterSelect
            param="status"
            label="Status"
            options={contentStatuses.map((s) => ({ value: s, label: contentStatusLabels[s] }))}
          />
          <UrlFilterSelect
            param="category"
            label="Category"
            options={[
              ...categories.map((c) => ({ value: c.id, label: c.name })),
              { value: "none", label: "No category" },
            ]}
          />
          {!readOnly && aiHelpers && (
            <AiDraftDialog
              buttonLabel="Draft with AI"
              title="Draft a post with AI"
              description="Say what the post is about and any facts to use. You get a draft to edit; figures it does not know are marked [add source]."
              fieldLabel="Brief"
              placeholder="e.g. Moving to Dubai Hills with children: schools, parks and commutes"
              run={(brief) => aiDraftBlogPost({ brief })}
              editorPath={(id) => `/admin/website/blog/${id}`}
            />
          )}
          {!readOnly && <NewPostDialog />}
        </>
      }
      empty="No posts match these filters."
    />
  );
}
