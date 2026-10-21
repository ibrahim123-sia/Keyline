"use client";

import { SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { ListingMultiPicker } from "@/components/admin/content/listing-picker";
import { PostBodyEditor } from "@/components/admin/content/post-body-editor";
import { PublishPanel } from "@/components/admin/content/publish-panel";
import { ListField, SelectField, TextInputField, TextareaField } from "@/components/admin/fields";
import { MediaPicker } from "@/components/admin/media/media-picker";
import { FormSection } from "@/components/admin/page-header";
import type { SaveState } from "@/components/admin/properties/editor/editor-panel";
import { useUnsavedGuard } from "@/components/admin/properties/editor/use-unsaved-guard";
import { SeoFields } from "@/components/admin/seo-fields";
import type { ContentStatus } from "@/db/schema/content";
import { deletePost, savePost, setPostPublishing } from "@/features/blog/actions";
import type { PostEditorData } from "@/features/blog/queries";
import { postPublishProblems, type PostInput } from "@/features/blog/schema";
import { postWordCount, readingMinutes } from "@/lib/rich-text-post";
import { richTextToPlain } from "@/lib/rich-text";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const sections = [
  { id: "post", label: "Post" },
  { id: "details", label: "Category and author" },
  { id: "related", label: "Related homes" },
  { id: "seo", label: "SEO" },
];

const sectionFor = (field: string) =>
  ["categoryId", "tags", "authorAgentId", "authorUserId"].includes(field)
    ? "details"
    : field === "relatedPropertyIds"
      ? "related"
      : ["slug", "seoTitle", "seoDescription", "canonicalUrl", "ogImageId"].includes(field)
        ? "seo"
        : "post";

/** Byline select values: the agency itself, an agent profile or an admin user. */
const AGENCY = "agency";
const bylineValue = (d: PostInput) =>
  d.authorAgentId ? `agent:${d.authorAgentId}` : d.authorUserId ? `user:${d.authorUserId}` : AGENCY;

/**
 * The post editor (08 §3): title, excerpt, cover, body, category, tags, author, related
 * homes and SEO, with publish / schedule in the side panel. Changes autosave every 10 s.
 */
export function PostEditor({
  data: initialData,
  siteName,
  readOnly,
}: {
  data: PostEditorData;
  siteName: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const { id, options } = initialData;
  const [data, setData] = useState(initialData.input);
  const [saved, setSaved] = useState(initialData.input);
  const [status, setStatus] = useState<ContentStatus>(initialData.status);
  const [publishAt, setPublishAt] = useState(initialData.publishAt);
  const [publishedAt, setPublishedAt] = useState(initialData.publishedAt);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  const dirty = !same(data, saved);
  const problems = useMemo(() => postPublishProblems(data), [data]);

  // Latest values for the autosave timer and keyboard shortcut.
  const ref = useRef({
    data,
    saved,
    status,
    problems,
    version: initialData.updatedAt,
    saving: false,
  });
  useEffect(() => {
    ref.current.data = data;
    ref.current.saved = saved;
    ref.current.status = status;
    ref.current.problems = problems;
  });

  const save = useCallback(
    async (mode: "auto" | "manual"): Promise<boolean> => {
      const r = ref.current;
      if (readOnly || r.saving) return false;
      const snapshot = r.data;
      if (same(snapshot, r.saved)) return true;
      if (r.status !== "draft" && r.problems.length > 0) {
        setSaveState({ kind: "blocked" });
        if (mode === "manual")
          toast.error(`This post is ${r.status}, so these must stay filled in.`, {
            description: r.problems.map((p) => p.message).join("\n"),
          });
        return false;
      }
      r.saving = true;
      setSaveState({ kind: "saving" });
      const res = await savePost({ id, data: snapshot, expectedUpdatedAt: r.version });
      r.saving = false;
      if (res.ok) {
        r.version = res.data.updatedAt;
        const stored = { ...snapshot, slug: res.data.slug };
        r.saved = stored;
        setSaved(stored);
        setData((d) => (d.slug === snapshot.slug ? { ...d, slug: res.data.slug } : d));
        setFieldErrors({});
        setSaveState({ kind: "saved", at: new Date().toISOString() });
        return true;
      }
      setFieldErrors(res.fieldErrors ?? {});
      setSaveState({ kind: res.code === "CONFLICT" ? "conflict" : "error", message: res.error });
      if (mode === "manual" || res.code === "CONFLICT") toast.error(res.error);
      return false;
    },
    [id, readOnly],
  );

  useEffect(() => {
    if (readOnly) return;
    const timer = setInterval(() => void save("auto"), 10_000);
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save("manual");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [save, readOnly]);

  async function publishing(
    input: { action: "publish" | "unpublish" } | { action: "schedule"; publishAt: string },
  ) {
    if (dirty && !(await save("manual"))) return;
    setBusy(true);
    const res = await setPostPublishing({ ...input, id });
    setBusy(false);
    if (!res.ok) {
      setFieldErrors(res.fieldErrors ?? {});
      toast.error(res.error, {
        description: Object.values(res.fieldErrors ?? {})
          .flat()
          .join("\n"),
      });
      return;
    }
    ref.current.version = res.data.updatedAt;
    setStatus(res.data.status as ContentStatus);
    setPublishAt(res.data.publishAt);
    if (res.data.status === "published") setPublishedAt((p) => p ?? new Date().toISOString());
    toast.success(
      input.action === "publish"
        ? `${data.title} is published`
        : input.action === "schedule"
          ? `${data.title} is scheduled`
          : `${data.title} is no longer on the site`,
    );
    router.refresh();
  }

  const guard = useUnsavedGuard(dirty);
  const set = useCallback((patch: Partial<PostInput>) => setData((d) => ({ ...d, ...patch })), []);
  const errorFor = (field: string) => fieldErrors[field]?.[0];
  const errorUnder = (prefix: string) =>
    Object.entries(fieldErrors).find(([k]) => k === prefix || k.startsWith(`${prefix}.`))?.[1][0];
  const words = postWordCount(data.body);
  const plain = useMemo(() => richTextToPlain(data.body).replace(/\s+/g, " "), [data.body]);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[10rem_minmax(0,1fr)_18rem]">
      <nav aria-label="Sections" className="sticky top-20 hidden lg:block">
        <ul className="flex flex-col gap-0.5 text-[13px]">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="block rounded-md px-2 py-1 text-text-muted hover:bg-surface-muted hover:text-ink"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <form
        className="order-2 flex min-w-0 flex-col gap-5 lg:order-none"
        onSubmit={(e) => {
          e.preventDefault();
          void save("manual");
        }}
      >
        {readOnly && (
          <p className="rounded-lg border border-border bg-surface-soft px-4 py-2 text-[13px] text-text-muted">
            You can look around, but changes are not saved in this account.
          </p>
        )}
        {initialData.isAiDrafted && (
          <p className="flex items-start gap-2 rounded-lg border border-border bg-accent-soft px-4 py-2 text-[13px] text-ink">
            <SparklesIcon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            Drafted by the AI assistant. Check every fact and number before publishing; it is never
            published without you.
          </p>
        )}

        <FormSection id="post" title="Post">
          <TextInputField
            label="Title"
            required
            maxLength={160}
            value={data.title}
            onChange={(title) => set({ title })}
            error={errorFor("title")}
          />
          <TextareaField
            label="Excerpt"
            description="One or two sentences for the post list and search results."
            rows={3}
            maxLength={320}
            value={data.excerpt ?? ""}
            onChange={(v) => set({ excerpt: v || null })}
            error={errorFor("excerpt")}
          />
          <MediaPicker
            label="Cover image"
            description="Shown at the top of the post and on its card. Landscape works best."
            value={data.coverId}
            onChange={(coverId) => set({ coverId })}
            error={errorFor("coverId")}
            disabled={readOnly}
          />
          <PostBodyEditor
            label="Text"
            value={data.body}
            onChange={(body) => set({ body })}
            error={errorUnder("body")}
            placeholder="Write the post…"
            disabled={readOnly}
          />
        </FormSection>

        <FormSection id="details" title="Category and author">
          <SelectField
            label="Category"
            value={data.categoryId ?? "none"}
            onChange={(v) => set({ categoryId: v === "none" ? null : v })}
            options={[
              { value: "none", label: "No category" },
              ...options.categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
            error={errorFor("categoryId")}
            disabled={readOnly}
          />
          <ListField
            label="Tags"
            placeholder="Type a tag, then Enter"
            suggestions={options.tags}
            max={15}
            value={data.tags}
            onChange={(tags) => set({ tags })}
            error={errorUnder("tags")}
          />
          <SelectField
            label="Author"
            description="Shown on the post. An agent profile links to their page."
            value={bylineValue(data)}
            onChange={(v) => {
              const [kind, value] = v.split(":");
              set({
                authorAgentId: kind === "agent" ? value! : null,
                authorUserId: kind === "user" ? value! : null,
              });
            }}
            options={[
              { value: AGENCY, label: `${siteName} (no person)` },
              ...options.bylines.agents.map((a) => ({
                value: `agent:${a.id}`,
                label: a.isActive ? `${a.name} (agent)` : `${a.name} (agent, hidden)`,
              })),
              ...options.bylines.users.map((u) => ({ value: `user:${u.id}`, label: u.name })),
            ]}
            error={errorFor("authorAgentId") ?? errorFor("authorUserId")}
            disabled={readOnly}
          />
        </FormSection>

        <FormSection
          id="related"
          title="Related homes"
          description="Shown under the post. Listings that are not on the site are skipped."
        >
          <ListingMultiPicker
            label="Listings"
            value={data.relatedPropertyIds}
            onChange={(relatedPropertyIds) => set({ relatedPropertyIds })}
            known={options.related}
            error={errorUnder("relatedPropertyIds")}
            disabled={readOnly}
          />
        </FormSection>

        <FormSection id="seo" title="SEO">
          <SeoFields
            values={{
              slug: data.slug,
              seoTitle: data.seoTitle,
              seoDescription: data.seoDescription,
              canonicalUrl: data.canonicalUrl,
              noindex: data.noindex,
              ogImageId: data.ogImageId,
            }}
            onChange={(patch) => set(patch)}
            urlPrefix="/insights/"
            fallbackTitle={`${data.title || "Post"} | ${siteName}`}
            fallbackDescription={(data.excerpt || plain).slice(0, 155) || undefined}
            siteName={siteName}
            errorFor={errorFor}
          />
        </FormSection>
      </form>

      <div className="order-1 lg:sticky lg:top-20 lg:order-none">
        <PublishPanel
          noun="post"
          status={status}
          publishAt={publishAt}
          publishedAt={publishedAt}
          dirty={dirty}
          saveState={saveState}
          problems={problems}
          sectionFor={sectionFor}
          busy={busy}
          readOnly={readOnly}
          publicPath={`/insights/${saved.slug}`}
          canDelete={status !== "published"}
          deleteDescription="The post and its tags are removed. This cannot be undone."
          onSave={() => void save("manual")}
          onPublish={() => void publishing({ action: "publish" })}
          onSchedule={(at) => void publishing({ action: "schedule", publishAt: at.toISOString() })}
          onUnpublish={() => void publishing({ action: "unpublish" })}
          onDelete={async () => {
            const res = await deletePost({ id });
            if (!res.ok) return toast.error(res.error);
            toast.success("Post deleted");
            router.push("/admin/website/blog");
          }}
        >
          <div className="rounded-lg border border-border bg-surface p-4 text-[12.5px] text-text-muted">
            <p>
              <span className="font-semibold text-ink">{readingMinutes(data.body)} min read</span> ·{" "}
              {words} {words === 1 ? "word" : "words"}
            </p>
            <p className="mt-1">
              {initialData.viewsCount} {initialData.viewsCount === 1 ? "view" : "views"}
            </p>
          </div>
        </PublishPanel>
      </div>

      <ConfirmDialog
        open={guard.pending !== null}
        onOpenChange={(o) => !o && guard.cancel()}
        title="Leave without saving?"
        description="Your latest changes are not saved yet."
        confirmLabel="Leave"
        destructive
        onConfirm={guard.leave}
      />
    </div>
  );
}
