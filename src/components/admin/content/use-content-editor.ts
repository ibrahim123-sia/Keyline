"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { SaveState } from "@/components/admin/properties/editor/editor-panel";
import { useUnsavedGuard } from "@/components/admin/properties/editor/use-unsaved-guard";
import type { ContentStatus } from "@/db/schema/content";
import type { ContentProblem, Publishing } from "@/features/content/schema";
import type { ActionResult } from "@/lib/action-result";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type Saved = { updatedAt: string; slug: string };
type Published = { updatedAt: string; status: string; publishAt: string | null };

/**
 * The editing state shared by the post and area guide editors: autosave every 10 s (and
 * Ctrl+S) with conflict detection, the publish rules, publish / schedule / unpublish and the
 * unsaved-changes guard.
 */
export function useContentEditor<I extends { title: string; slug: string }>(opts: {
  id: string;
  /** "post" or "guide", for messages. */
  noun: string;
  initial: I;
  status: ContentStatus;
  publishAt: string | null;
  publishedAt: string | null;
  version: string;
  readOnly: boolean;
  rules: (data: I) => ContentProblem[];
  saveAction: (input: {
    id: string;
    data: I;
    expectedUpdatedAt: string;
  }) => Promise<ActionResult<Saved>>;
  publishAction: (input: Publishing) => Promise<ActionResult<Published>>;
}) {
  const { id, noun, readOnly, rules, saveAction, publishAction } = opts;
  const router = useRouter();
  const [data, setData] = useState(opts.initial);
  const [saved, setSaved] = useState(opts.initial);
  const [status, setStatus] = useState<ContentStatus>(opts.status);
  const [publishAt, setPublishAt] = useState(opts.publishAt);
  const [publishedAt, setPublishedAt] = useState(opts.publishedAt);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  const dirty = !same(data, saved);
  const problems = useMemo(() => rules(data), [rules, data]);

  // Latest values for the autosave timer and keyboard shortcut.
  const ref = useRef({ data, saved, status, problems, version: opts.version, saving: false });
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
          toast.error(`This ${noun} is ${r.status}, so these must stay filled in.`, {
            description: r.problems.map((p) => p.message).join("\n"),
          });
        return false;
      }
      r.saving = true;
      setSaveState({ kind: "saving" });
      const res = await saveAction({ id, data: snapshot, expectedUpdatedAt: r.version });
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
    [id, noun, readOnly, saveAction],
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
    const res = await publishAction({ ...input, id });
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
    const title = ref.current.data.title;
    toast.success(
      input.action === "publish"
        ? `${title} is published`
        : input.action === "schedule"
          ? `${title} is scheduled`
          : `${title} is no longer on the site`,
    );
    router.refresh();
  }

  const guard = useUnsavedGuard(dirty);
  const set = useCallback((patch: Partial<I>) => setData((d) => ({ ...d, ...patch })), []);
  const errorFor = (field: string) => fieldErrors[field]?.[0];
  const errorUnder = (prefix: string) =>
    Object.entries(fieldErrors).find(([k]) => k === prefix || k.startsWith(`${prefix}.`))?.[1][0];

  return {
    data,
    set,
    saved,
    status,
    publishAt,
    publishedAt,
    saveState,
    dirty,
    problems,
    busy,
    errorFor,
    errorUnder,
    save,
    publishing,
    guard,
  };
}
