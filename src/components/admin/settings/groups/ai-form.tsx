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

export type AiUsageView = {
  todayCents: number;
  monthCents: number;
  days: Array<{ date: string; requests: number; tokens: number; costCents: number }>;
};

const featureSwitches: Array<{ key: keyof SettingsOf<"ai">["features"]; label: string }> = [
  { key: "customerChat", label: "Website assistant" },
  { key: "whatsapp", label: "WhatsApp assistant" },
  { key: "writingHelpers", label: "Writing helpers (descriptions, SEO, alt text, blog drafts)" },
  { key: "leadScoring", label: "Lead scoring and conversation summaries" },
  { key: "mcp", label: "MCP access for AI tools outside Propel" },
];

const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

/** 04 §9 AI: switches per feature, assistant behaviour and rules, admin actions, budgets. */
export function AiSettingsForm({
  initial,
  readOnly,
  usage,
}: {
  initial: SettingsOf<"ai">;
  readOnly: boolean;
  usage?: AiUsageView;
}) {
  return (
    <SettingsForm group="ai" initial={initial} readOnly={readOnly}>
      {({ value, set, errorFor }) => (
        <>
          <FormSection
            title="AI features"
            description="Turn each AI feature on or off. When one is off or over budget, Propel falls back: the team answers chats and leads are scored by the rules."
          >
            {featureSwitches.map((f) => (
              <SwitchField
                key={f.key}
                label={f.label}
                checked={value.features[f.key]}
                onChange={(on) => set({ features: { ...value.features, [f.key]: on } })}
              />
            ))}
            <SwitchField
              label="Admin assistant"
              checked={value.adminAssistantEnabled}
              onChange={(adminAssistantEnabled) => set({ adminAssistantEnabled })}
            />
          </FormSection>

          <FormSection
            title="Website chat"
            description="A chat button on every page. Messages arrive in the inbox; until the assistant is turned on, the team answers them."
          >
            <SwitchField
              label="Show the chat button"
              checked={value.webChat.enabled}
              onChange={(enabled) => set({ webChat: { ...value.webChat, enabled } })}
            />
            <SwitchField
              label="Ask for name and email or phone before the first message"
              checked={value.webChat.askContactFirst}
              onChange={(askContactFirst) =>
                set({ webChat: { ...value.webChat, askContactFirst } })
              }
            />
          </FormSection>

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
            <ListField
              label="The agency's own rules"
              description="Extra instructions the assistant always follows, one per line (for example: always mention that viewings are free)."
              max={20}
              value={value.assistantRules}
              onChange={(assistantRules) => set({ assistantRules })}
              error={errorFor("assistantRules")}
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

          <FormSection
            title="Spending"
            description="Estimated from the provider's list prices. At a limit, AI features pause and fall back to their plain version."
          >
            <NumberField
              label="Daily budget"
              suffix="USD (0 = no daily budget)"
              min={0}
              step={1}
              value={value.dailySpendLimitCents / 100}
              onChange={(v) => set({ dailySpendLimitCents: Math.round((v ?? 0) * 100) })}
              error={errorFor("dailySpendLimitCents")}
            />
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
          {usage && <UsagePanel usage={usage} />}
        </>
      )}
    </SettingsForm>
  );
}

function UsagePanel({ usage }: { usage: AiUsageView }) {
  return (
    <FormSection
      title="Usage"
      description="Requests, tokens and estimated cost per day (agency time)."
    >
      <p className="text-sm text-ink">
        Today {usd(usage.todayCents)} · This month {usd(usage.monthCents)}
      </p>
      {usage.days.length === 0 ? (
        <p className="text-sm text-text-muted">No AI use in the last 14 days.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">AI usage per day</caption>
            <thead>
              <tr className="text-left text-text-muted">
                <th scope="col" className="py-1 pe-4 font-medium">
                  Day
                </th>
                <th scope="col" className="py-1 pe-4 text-end font-medium">
                  Requests
                </th>
                <th scope="col" className="py-1 pe-4 text-end font-medium">
                  Tokens
                </th>
                <th scope="col" className="py-1 text-end font-medium">
                  Cost
                </th>
              </tr>
            </thead>
            <tbody>
              {usage.days.map((d) => (
                <tr key={d.date} className="border-t border-border">
                  <td className="py-1 pe-4">{d.date}</td>
                  <td className="py-1 pe-4 text-end tabular-nums">
                    {d.requests.toLocaleString("en-US")}
                  </td>
                  <td className="py-1 pe-4 text-end tabular-nums">
                    {d.tokens.toLocaleString("en-US")}
                  </td>
                  <td className="py-1 text-end tabular-nums">{usd(d.costCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </FormSection>
  );
}
