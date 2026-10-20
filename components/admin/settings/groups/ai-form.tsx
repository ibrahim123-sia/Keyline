"use client";

import {
  CheckboxListField,
  ListField,
  NumberField,
  SelectField,
  SwitchField,
  TextInputField,
  TextareaField,
} from "@/components/admin/fields";
import { FormSection } from "@/components/admin/page-header";
import { adminAiActions, type SettingsOf } from "@/features/settings/schema";
import { SettingsForm } from "../settings-form";

const actionLabels: Record<(typeof adminAiActions)[number], string> = {
  create_listing_draft: "Create listing drafts",
  update_listing: "Update listings",
  write_listing_copy: "Write listing descriptions",
  draft_blog_post: "Draft blog posts",
  send_lead_reply: "Reply to leads",
  manage_viewing: "Book and change viewings",
  create_task: "Create tasks",
  update_lead: "Update leads",
  create_utm_link: "Create tracking links",
  send_listings_to_lead: "Send listings to a lead",
};

/** 04 §9 AI: website assistant behaviour, admin assistant permissions, spend limit. */
export function AiSettingsForm({
  initial,
  readOnly,
}: {
  initial: SettingsOf<"ai">;
  readOnly: boolean;
}) {
  return (
    <SettingsForm group="ai" initial={initial} readOnly={readOnly}>
      {({ value, set, errorFor }) => (
        <>
          <FormSection title="Website assistant">
            <TextInputField
              label="Name"
              maxLength={40}
              value={value.assistantName}
              onChange={(assistantName) => set({ assistantName })}
              error={errorFor("assistantName")}
            />
            <TextareaField
              label="Greeting"
              rows={2}
              maxLength={300}
              value={value.greeting}
              onChange={(greeting) => set({ greeting })}
              error={errorFor("greeting")}
            />
            <SelectField
              label="Tone"
              value={value.tone}
              onChange={(tone) => set({ tone })}
              options={[
                { value: "friendly", label: "Friendly" },
                { value: "formal", label: "Formal" },
                { value: "short", label: "Short and to the point" },
              ]}
            />
            <CheckboxListField
              label="Ask for these before booking a viewing"
              columns={3}
              value={(["name", "phone", "email"] as const).filter(
                (k) => value.requiredBeforeBooking[k],
              )}
              onChange={(keys) =>
                set({
                  requiredBeforeBooking: {
                    name: keys.includes("name"),
                    phone: keys.includes("phone"),
                    email: keys.includes("email"),
                  },
                })
              }
              options={[
                { value: "name", label: "Name" },
                { value: "phone", label: "Phone" },
                { value: "email", label: "Email" },
              ]}
            />
            <ListField
              label="Topics handed to a person"
              description="The assistant does not answer these; it offers to connect the visitor with the team."
              max={30}
              value={value.humanTopics}
              onChange={(humanTopics) => set({ humanTopics })}
              error={errorFor("humanTopics")}
            />
            <SelectField
              label="“Talk to a person” button"
              value={value.showHumanButton}
              onChange={(showHumanButton) => set({ showHumanButton })}
              options={[
                { value: "always", label: "Always shown" },
                { value: "after_3", label: "After three messages" },
              ]}
            />
            <TextareaField
              label="Outside office hours"
              rows={2}
              maxLength={300}
              value={value.outsideHoursMessage}
              onChange={(outsideHoursMessage) => set({ outsideHoursMessage })}
              error={errorFor("outsideHoursMessage")}
            />
            <SwitchField
              label="Instant first reply to new enquiries"
              checked={value.firstReplyEnabled}
              onChange={(firstReplyEnabled) => set({ firstReplyEnabled })}
            />
          </FormSection>

          <FormSection
            title="Admin assistant"
            description="It proposes changes; nothing is changed until an admin confirms."
          >
            <SwitchField
              label="Admin assistant on"
              checked={value.adminAssistantEnabled}
              onChange={(adminAssistantEnabled) => set({ adminAssistantEnabled })}
            />
            <CheckboxListField
              label="Actions it may propose"
              columns={2}
              value={adminAiActions.filter((a) => value.allowedActions[a])}
              onChange={(allowed) =>
                set({
                  allowedActions: Object.fromEntries(
                    adminAiActions.map((a) => [a, allowed.includes(a)]),
                  ) as SettingsOf<"ai">["allowedActions"],
                })
              }
              options={adminAiActions.map((a) => ({ value: a, label: actionLabels[a] }))}
            />
          </FormSection>

          <FormSection title="Spending">
            <NumberField
              label="Monthly limit"
              suffix="USD (0 = no limit)"
              min={0}
              step={1}
              value={value.monthlySpendLimitCents / 100}
              onChange={(v) => set({ monthlySpendLimitCents: Math.round((v ?? 0) * 100) })}
              error={errorFor("monthlySpendLimitCents")}
            />
            <NumberField
              label="Warn at"
              suffix="% of the limit"
              min={1}
              max={100}
              step={1}
              value={value.spendAlertPct}
              onChange={(v) => set({ spendAlertPct: v ?? 80 })}
              error={errorFor("spendAlertPct")}
            />
          </FormSection>
        </>
      )}
    </SettingsForm>
  );
}
