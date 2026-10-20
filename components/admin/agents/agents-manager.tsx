"use client";

import { CalendarIcon, PlusIcon, UserRoundIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { EmptyState } from "@/components/admin/empty-state";
import { ListField, SwitchField, TextInputField, TextareaField } from "@/components/admin/fields";
import { MediaPicker } from "@/components/admin/media/media-picker";
import { SeoFields } from "@/components/admin/seo-fields";
import { SidePanel } from "@/components/admin/side-panel";
import { SortableList } from "@/components/admin/sortable-list";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { deleteAgent, reorderAgents, saveAgent, setAgentActive } from "@/features/agents/actions";
import type { AgentRow } from "@/features/agents/queries";
import { commonLanguages, emptyAgent, type AgentInput } from "@/features/agents/schema";
import type { LocationNode } from "@/features/locations/queries";
import { describeUsage } from "@/lib/usage-registry";
import { useAction } from "@/lib/use-action";
import { LocationMultiSelect } from "./location-multi-select";
import { WorkingHoursEditor, type WeekHours } from "@/components/admin/working-hours-editor";

type Editing = { id: string | null; data: AgentInput; row: AgentRow | null };

/**
 * Setup -> Agents (03, 07 §1): agent profiles shown on the site and used for assignment.
 * Agents do not log in; their notifications go to the email and WhatsApp set here.
 */
export function AgentsManager({
  agents: initial,
  locations,
  agencyHours,
  firstDayOfWeek,
  calendarEnabled,
  siteName,
  readOnly,
}: {
  agents: AgentRow[];
  locations: LocationNode[];
  agencyHours: WeekHours;
  firstDayOfWeek: number;
  calendarEnabled: boolean;
  siteName: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const formId = useId();
  const [agents, setAgents] = useState(initial);
  const [agentsFrom, setAgentsFrom] = useState(initial);
  if (agentsFrom !== initial) {
    setAgentsFrom(initial);
    setAgents(initial);
  }
  const [editing, setEditing] = useState<Editing | null>(null);
  const save = useAction(saveAgent, {
    success: "Agent saved",
    onSuccess: () => {
      setEditing(null);
      router.refresh();
    },
  });
  const set = (patch: Partial<AgentInput>) =>
    setEditing((e) => (e ? { ...e, data: { ...e.data, ...patch } } : e));

  async function reorder(next: AgentRow[]) {
    const previous = agents;
    setAgents(next);
    const res = await reorderAgents({ ids: next.map((a) => a.id) });
    if (!res.ok) {
      setAgents(previous);
      toast.error(res.error);
    }
  }

  async function toggleActive(agent: AgentRow, active: boolean) {
    setAgents((list) => list.map((a) => (a.id === agent.id ? { ...a, isActive: active } : a)));
    const res = await setAgentActive({ id: agent.id, active });
    if (!res.ok) {
      toast.error(res.error);
      router.refresh();
    } else {
      toast.success(
        active ? `${agent.name} is shown on the site` : `${agent.name} is hidden from the site`,
      );
    }
  }

  const data = editing?.data;
  const usage = editing?.row?.usage;

  return (
    <div className="flex flex-col gap-3">
      {!readOnly && (
        <div className="flex justify-end">
          <Button onClick={() => setEditing({ id: null, data: emptyAgent(), row: null })}>
            <PlusIcon /> New agent
          </Button>
        </div>
      )}
      {agents.length === 0 ? (
        <EmptyState
          icon={<UserRoundIcon className="size-6" />}
          title="No agent profiles yet"
          description="Agents appear on listings, the team page and in lead assignment. They do not log in."
        />
      ) : (
        <SortableList
          items={agents}
          disabled={readOnly}
          label="Drag to reorder (team page order)"
          onReorder={(next) => void reorder(next)}
          renderItem={(agent) => (
            <div className="flex items-center gap-3 py-1">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setEditing({ id: agent.id, data: agent.data, row: agent })}
                aria-label={`Edit ${agent.name}`}
              >
                <span
                  className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-muted"
                  style={agent.photoColor ? { backgroundColor: agent.photoColor } : undefined}
                >
                  {agent.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- /media resizes on its own
                    <img
                      src={
                        agent.photoUrl.endsWith(".svg")
                          ? agent.photoUrl
                          : `${agent.photoUrl}?w=128&q=75`
                      }
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <UserRoundIcon className="size-5 text-text-muted" aria-hidden />
                  )}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block truncate font-semibold",
                      agent.isActive ? "text-ink" : "text-text-muted",
                    )}
                  >
                    {agent.name}
                  </span>
                  <span className="block truncate text-[12.5px] text-text-muted">
                    {[
                      agent.title,
                      agent.data.languages.join(", "),
                      agent.data.areas.length
                        ? `${agent.data.areas.length} area${agent.data.areas.length === 1 ? "" : "s"}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No details yet"}
                  </span>
                </span>
              </button>
              {!agent.isActive && (
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[12px] font-semibold text-text-muted">
                  Hidden
                </span>
              )}
              <Switch
                checked={agent.isActive}
                disabled={readOnly}
                onCheckedChange={(on) => void toggleActive(agent, on)}
                aria-label={`Show ${agent.name} on the site`}
              />
            </div>
          )}
        />
      )}

      <SidePanel
        wide
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.id ? `Edit ${editing.row?.name ?? "agent"}` : "New agent"}
        footer={
          !readOnly && (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div>
                {editing?.id && (
                  <ConfirmDialog
                    trigger={
                      <Button
                        variant="ghost"
                        className="text-danger"
                        disabled={(usage?.total ?? 0) > 0}
                      >
                        Delete
                      </Button>
                    }
                    title={`Delete ${editing.row?.name}?`}
                    description="The profile and its page are removed. To keep its history, turn it off instead."
                    confirmLabel="Delete"
                    destructive
                    onConfirm={async () => {
                      const res = await deleteAgent({ id: editing.id! });
                      if (!res.ok) return toast.error(res.error);
                      toast.success("Agent deleted");
                      setEditing(null);
                      router.refresh();
                    }}
                  />
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" form={formId} disabled={save.pending}>
                  {save.pending ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          )
        }
      >
        {editing && data && (
          <form
            id={formId}
            className="flex flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              void save.run({ id: editing.id, data });
            }}
          >
            {usage && usage.total > 0 && (
              <p className="rounded-md border border-border bg-surface-soft p-3 text-[13px]">
                Assigned to {describeUsage(usage)}. It cannot be deleted; turn it off to hide it.
              </p>
            )}
            <Section title="Profile">
              <MediaPicker
                label="Photo"
                description="A square head-and-shoulders photo works best."
                value={data.photoId}
                onChange={(photoId) => set({ photoId })}
                error={save.errorFor("photoId")}
              />
              <TextInputField
                label="Name"
                required
                value={data.name}
                onChange={(name) => set({ name })}
                error={save.errorFor("name")}
              />
              <TextInputField
                label="Job title"
                placeholder="e.g. Senior Property Consultant"
                value={data.title ?? ""}
                onChange={(v) => set({ title: v || null })}
                error={save.errorFor("title")}
              />
              <TextareaField
                label="Short bio"
                rows={4}
                maxLength={1500}
                value={data.bio ?? ""}
                onChange={(v) => set({ bio: v || null })}
                error={save.errorFor("bio")}
              />
              <ListField
                label="Languages"
                placeholder="Type a language, then Enter"
                suggestions={commonLanguages}
                max={20}
                value={data.languages}
                onChange={(languages) => set({ languages })}
                error={save.errorUnder("languages")}
              />
              <SwitchField
                label="Show on the site"
                description="Turned off: hidden from listings, the team page and lead assignment."
                checked={data.isActive}
                onChange={(isActive) => set({ isActive })}
              />
            </Section>

            <Section
              title="Contact"
              description="Agents do not log in. New leads and viewings for this agent are sent here."
            >
              <TextInputField
                label="Phone"
                type="tel"
                description="International format: + and the country code, then the number."
                value={data.phone ?? ""}
                onChange={(v) => set({ phone: v.trim() || null })}
                error={save.errorFor("phone")}
              />
              <TextInputField
                label="WhatsApp"
                type="tel"
                description="Leave empty if it is the same number as above and WhatsApp is not used."
                value={data.whatsapp ?? ""}
                onChange={(v) => set({ whatsapp: v.trim() || null })}
                error={save.errorFor("whatsapp")}
              />
              <TextInputField
                label="Email"
                type="email"
                value={data.email ?? ""}
                onChange={(v) => set({ email: v.trim() || null })}
                error={save.errorFor("email")}
              />
              <TextInputField
                label="Reply time"
                placeholder="e.g. Usually replies within an hour"
                description="Shown on the contact card."
                maxLength={80}
                value={data.replyTimeText ?? ""}
                onChange={(v) => set({ replyTimeText: v || null })}
                error={save.errorFor("replyTimeText")}
              />
            </Section>

            <Section
              title="Areas covered"
              description="Used by the “area match” lead assignment rule."
            >
              <LocationMultiSelect
                label="Areas"
                nodes={locations}
                value={data.areas}
                onChange={(areas) => set({ areas })}
                error={save.errorUnder("areas")}
              />
            </Section>

            <Section
              title="Working hours"
              description="Viewing slots and the response timer follow these hours."
            >
              <SwitchField
                label="Same as the agency's viewing hours"
                description="Set in Settings -> Viewings."
                checked={data.workingHours === null}
                onChange={(same) =>
                  set({ workingHours: same ? null : structuredClone(agencyHours) })
                }
              />
              {data.workingHours && (
                <WorkingHoursEditor
                  value={data.workingHours as WeekHours}
                  onChange={(workingHours) => set({ workingHours })}
                  firstDayOfWeek={firstDayOfWeek}
                  error={save.errorUnder("workingHours")}
                />
              )}
            </Section>

            <Section title="Calendar">
              <div className="flex items-start gap-3 text-[13px]">
                <CalendarIcon className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
                <div>
                  <p className="font-medium text-ink">
                    Google Calendar:{" "}
                    {editing.row?.calendarConnected ? "connected" : "not connected"}
                  </p>
                  <p className="text-text-muted">
                    {calendarEnabled
                      ? "Each agent connects their own calendar so booked viewings appear there and busy times are blocked."
                      : "Turn on Google Calendar in Settings -> Integrations to connect agent calendars."}
                  </p>
                </div>
              </div>
            </Section>

            <Section title="SEO">
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
                urlPrefix="/agents/"
                fallbackTitle={`${data.name || "Agent"}${data.title ? `, ${data.title}` : ""} | ${siteName}`}
                fallbackDescription={data.bio ?? undefined}
                siteName={siteName}
                errorFor={save.errorFor}
              />
            </Section>
          </form>
        )}
      </SidePanel>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-4 border-t border-border pt-4 first:border-0 first:pt-0"
    >
      <div>
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        {description && <p className="text-[12.5px] text-text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}
