"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { FormSection } from "@/components/admin/page-header";
import type { PropertyStatus } from "@/db/schema/properties";
import { getMediaStatuses } from "@/features/media/actions";
import type { MediaItem } from "@/features/media/queries";
import { planProblem } from "@/features/payment-plans/schema";
import type { PropertyPoisView } from "@/features/pois/nearby-queries";
import { saveProperty, setPropertyStatus } from "@/features/properties/editor-actions";
import type { EditorActivity, EditorOptions } from "@/features/properties/editor-data";
import { completeness, publishProblems, type PropertyInput } from "@/features/properties/schema";
import { isLiveStatus, statusLabels } from "@/features/properties/status";
import { wordCount } from "@/lib/rich-text";
import { NearbyPlaces } from "../nearby-places";
import { EditorPanel, type SaveState } from "./editor-panel";
import { MediaSection } from "./media-section";
import {
  BasicsSection,
  InvestmentSection,
  LocationSection,
  OffPlanSection,
  PriceSection,
  SpecsSection,
} from "./sections-a";
import {
  ActivitySection,
  BadgesSection,
  DescriptionSection,
  FacilitiesSection,
  SeoSection,
  TrustSection,
} from "./sections-b";
import type { EditorMarket, SectionProps } from "./types";
import { useUnsavedGuard } from "./use-unsaved-guard";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The property editor (07 §3): section nav, sections, and a sticky panel with status,
 * publishing, completeness and save state. Drafts autosave every 10 seconds.
 */
export function PropertyEditor({
  id,
  reference,
  initial,
  initialUpdatedAt,
  initialStatus,
  media: initialMedia,
  options,
  activity,
  nearby,
  market,
  serverNow,
  readOnly,
}: {
  id: string;
  reference: string;
  initial: PropertyInput;
  initialUpdatedAt: string;
  initialStatus: PropertyStatus;
  media: Record<string, MediaItem>;
  options: EditorOptions;
  activity: EditorActivity;
  nearby: PropertyPoisView;
  market: EditorMarket;
  /** When the page was rendered: "verified in the last 30 days" is measured from it. */
  serverNow: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [status, setStatus] = useState(initialStatus);
  const [mediaMap, setMediaMap] = useState(initialMedia);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [nearbyWatch, setNearbyWatch] = useState(0);

  const dirty = !same(data, saved);
  const live = isLiveStatus(status);
  const type = options.types.find((t) => t.id === data.propertyTypeId);
  const hidden = useMemo(() => new Set<string>(type?.hidden ?? []), [type]);

  const problems = useMemo(
    () =>
      publishProblems(data, {
        hiddenFields: [...hidden],
        permitRequired: market.permit.enabled && market.permit.requiredOnPublish,
        permitLabel: market.permit.label,
        libraryAlt: new Map(Object.values(mediaMap).map((m) => [m.id, m.alt || null])),
        planProblem: data.paymentPlan ? planProblem(data.paymentPlan.steps) : null,
      }),
    [data, hidden, market.permit, mediaMap],
  );
  const score = useMemo(
    () =>
      completeness({
        photos: data.media.filter((m) => m.kind === "photo").length,
        floorPlans: data.media.filter((m) => m.kind === "floor_plan").length,
        descriptionWords: wordCount(data.description),
        facilities: data.facilityIds.length,
        poisComputed: activity.poisComputed,
        seoTitle: data.seoTitle,
        seoDescription: data.seoDescription,
        permitNumber: data.permitNumber,
        permitsEnabled: market.permit.enabled,
        lastVerifiedAt:
          data.isVerified && data.lastVerifiedAt ? new Date(data.lastVerifiedAt) : null,
        now: new Date(serverNow),
      }),
    [data, activity.poisComputed, market.permit.enabled, serverNow],
  );

  // Latest values for the autosave timer and keyboard shortcut.
  const ref = useRef({ data, saved, live, problems, version: initialUpdatedAt, saving: false });
  useEffect(() => {
    ref.current.data = data;
    ref.current.saved = saved;
    ref.current.live = live;
    ref.current.problems = problems;
  });

  const save = useCallback(
    async (mode: "auto" | "manual"): Promise<boolean> => {
      const r = ref.current;
      if (readOnly || r.saving) return false;
      const snapshot = r.data;
      if (same(snapshot, r.saved)) return true;
      if (r.live && r.problems.length > 0) {
        setSaveState({ kind: "blocked" });
        if (mode === "manual")
          toast.error("This listing is live, so these must stay filled in.", {
            description: r.problems.map((p) => p.message).join("\n"),
          });
        return false;
      }
      r.saving = true;
      setSaveState({ kind: "saving" });
      const res = await saveProperty({ id, data: snapshot, expectedUpdatedAt: r.version });
      r.saving = false;
      if (res.ok) {
        r.version = res.data.updatedAt;
        const stored = { ...snapshot, slug: res.data.slug };
        r.saved = stored;
        setSaved(stored);
        setData((d) => (d.slug === snapshot.slug ? { ...d, slug: res.data.slug } : d));
        setFieldErrors({});
        setSaveState({ kind: "saved", at: new Date().toISOString() });
        if (res.data.pointMoved) setNearbyWatch((n) => n + 1);
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

  // New uploads finish processing in the background: refresh their thumbnails.
  const processing = Object.values(mediaMap)
    .filter((m) => m.status === "processing" || m.status === "uploading")
    .map((m) => m.id);
  const processingKey = processing.join(",");
  useEffect(() => {
    if (!processingKey) return;
    const timer = setInterval(async () => {
      const res = await getMediaStatuses({ ids: processingKey.split(",") });
      if (res.ok)
        setMediaMap((m) => ({ ...m, ...Object.fromEntries(res.data.map((i) => [i.id, i])) }));
    }, 3000);
    return () => clearInterval(timer);
  }, [processingKey]);

  async function changeStatus(next: PropertyStatus) {
    if (next === status) return;
    if (dirty && !(await save("manual"))) return;
    setBusy(true);
    const res = await setPropertyStatus({ id, status: next });
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
    setStatus(next);
    toast.success(
      res.data.firstPublish ? `${reference} is live` : `Status changed to ${statusLabels[next]}`,
    );
    router.refresh();
  }

  const guard = useUnsavedGuard(dirty);
  const set = useCallback(
    (patch: Partial<PropertyInput>) => setData((d) => ({ ...d, ...patch })),
    [],
  );
  const errorFor = useCallback((field: string) => fieldErrors[field]?.[0], [fieldErrors]);
  const rememberMedia = useCallback(
    (items: MediaItem[]) =>
      setMediaMap((m) => ({ ...m, ...Object.fromEntries(items.map((i) => [i.id, i])) })),
    [],
  );
  const props: SectionProps = {
    data,
    set,
    errorFor,
    options,
    market,
    media: mediaMap,
    rememberMedia,
    activity,
    status,
    readOnly,
    hidden,
  };

  const sections = [
    { id: "basics", label: "Basics" },
    { id: "location", label: "Location" },
    { id: "price", label: "Price" },
    { id: "specs", label: "Specs" },
    ...(data.completion === "off_plan" ? [{ id: "offplan", label: "Off-plan" }] : []),
    ...(data.purpose === "sale" ? [{ id: "investment", label: "Investment" }] : []),
    { id: "description", label: "Description" },
    { id: "media", label: "Media" },
    { id: "facilities", label: "Facilities" },
    { id: "badges", label: "Badges" },
    { id: "nearby", label: "Nearby" },
    { id: "trust", label: "Trust" },
    { id: "seo", label: "SEO" },
    { id: "activity", label: "Activity" },
  ];

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
        <BasicsSection {...props} reference={reference} />
        <LocationSection {...props} />
        <PriceSection {...props} />
        <SpecsSection {...props} />
        {data.completion === "off_plan" && <OffPlanSection {...props} />}
        {data.purpose === "sale" && <InvestmentSection {...props} />}
        <DescriptionSection {...props} />
        <MediaSection {...props} />
        <FacilitiesSection {...props} />
        <BadgesSection {...props} />
        <FormSection
          id="nearby"
          title="Nearby"
          description="Schools, shops and transport measured from the saved map pin. Moving the pin measures them again."
        >
          <NearbyPlaces
            propertyId={id}
            initial={nearby}
            hasPin={Boolean(saved.point)}
            distanceUnit={market.distanceUnit}
            readOnly={readOnly}
            watch={nearbyWatch}
          />
        </FormSection>
        <TrustSection {...props} />
        <SeoSection {...props} />
        <ActivitySection {...props} />
      </form>

      <div className="order-1 lg:sticky lg:top-20 lg:order-none">
        <EditorPanel
          status={status}
          dirty={dirty}
          saveState={saveState}
          problems={problems}
          score={score.score}
          items={score.items}
          busy={busy}
          readOnly={readOnly}
          publicPath={`/property/${saved.slug}`}
          onSave={() => void save("manual")}
          onStatus={(next) => void changeStatus(next)}
        />
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

export type { EditorMarket };
