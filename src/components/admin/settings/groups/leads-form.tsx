"use client";

import { PlusIcon, XIcon } from "lucide-react";
import {
  ListField,
  NumberField,
  SelectField,
  SwitchField,
  TextInputField,
} from "@/components/admin/fields";
import { FormSection } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import type { SettingsOf } from "@/features/settings/schema";
import { SettingsForm } from "../settings-form";

type Leads = SettingsOf<"leads">;

/** 04 §5 Leads and CRM (the pipeline stages are edited above this form). */
export function LeadsSettingsForm({ initial, readOnly }: { initial: Leads; readOnly: boolean }) {
  return (
    <SettingsForm group="leads" initial={initial} readOnly={readOnly}>
      {({ value, set, errorFor }) => (
        <>
          <FormSection title="Lists">
            <ListField
              label="Lead types"
              value={value.leadTypes}
              onChange={(leadTypes) => set({ leadTypes })}
              error={errorFor("leadTypes")}
            />
            <ListField
              label="Reasons a lead is lost"
              value={value.lostReasons}
              onChange={(lostReasons) => set({ lostReasons })}
              error={errorFor("lostReasons")}
            />
          </FormSection>

          <FormSection
            title="Response time"
            description="An alert goes out when a new lead waits too long for a first reply."
          >
            <NumberField
              label="Alert after"
              suffix="minutes without a reply"
              min={1}
              max={1440}
              step={1}
              value={value.responseAlertMinutes}
              onChange={(v) => set({ responseAlertMinutes: v ?? 10 })}
              error={errorFor("responseAlertMinutes")}
            />
            <ListField
              label="Also tell"
              description="Emails, besides the assigned agent."
              placeholder="name@agency.com, then Enter"
              max={10}
              value={value.responseAlertEmails}
              onChange={(responseAlertEmails) => set({ responseAlertEmails })}
              error={errorFor("responseAlertEmails")}
            />
          </FormSection>

          <FormSection title="Assignment and duplicates">
            <SelectField
              label="Who gets a new lead"
              value={value.assignmentRule}
              onChange={(assignmentRule) => set({ assignmentRule })}
              options={[
                { value: "listing_agent", label: "The agent of the listing it came from" },
                { value: "area_match", label: "An agent who covers the area" },
                { value: "round_robin", label: "Active agents in turn (round robin)" },
                { value: "manual", label: "Nobody until an admin assigns it" },
              ]}
            />
            <SelectField
              label="Same person when they match by"
              value={value.duplicateMatching}
              onChange={(duplicateMatching) => set({ duplicateMatching })}
              options={[
                { value: "both", label: "Email or phone" },
                { value: "email", label: "Email only" },
                { value: "phone", label: "Phone only" },
              ]}
            />
            <NumberField
              label="Follow-up task after"
              suffix="days without activity (0 = never)"
              min={0}
              max={90}
              step={1}
              value={value.followUpAfterDays}
              onChange={(v) => set({ followUpAfterDays: v ?? 0 })}
              error={errorFor("followUpAfterDays")}
            />
          </FormSection>

          <FormSection
            title="When a lead is created"
            description="Sign-ups and newsletter subscribers are contacts; these rules decide when they also become leads."
          >
            <SelectField
              label="A new account"
              value={value.signupCreatesLead}
              onChange={(signupCreatesLead) => set({ signupCreatesLead })}
              options={[
                {
                  value: "on_intent",
                  label: "Becomes a lead once they show interest (save, enquire, book)",
                },
                { value: "always", label: "Always becomes a lead" },
                { value: "never", label: "Never becomes a lead by itself" },
              ]}
            />
            <SwitchField
              label="Newsletter sign-ups become leads"
              checked={value.newsletterCreatesLead}
              onChange={(newsletterCreatesLead) => set({ newsletterCreatesLead })}
            />
            <SwitchField
              label="Ask for an email before a brochure download"
              checked={value.brochureEmailGate}
              onChange={(brochureEmailGate) => set({ brochureEmailGate })}
            />
          </FormSection>

          <FormSection title="Automatic first reply">
            <SwitchField
              label="Send an automatic first reply"
              checked={value.autoReply.enabled}
              onChange={(enabled) => set({ autoReply: { ...value.autoReply, enabled } })}
            />
            <SwitchField
              label="Count it as the first response"
              description="Off: the response timer keeps running until a person replies."
              checked={value.autoReply.countsAsFirstResponse}
              disabled={!value.autoReply.enabled}
              onChange={(countsAsFirstResponse) =>
                set({ autoReply: { ...value.autoReply, countsAsFirstResponse } })
              }
            />
          </FormSection>

          <FormSection
            title="Portal inboxes"
            description="Leads that portals send by email are read from these addresses."
          >
            {value.portalInboxes.map((inbox, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <TextInputField
                  label="Portal"
                  className="min-w-40 flex-1"
                  value={inbox.portal}
                  onChange={(portal) =>
                    set({
                      portalInboxes: value.portalInboxes.map((x, j) =>
                        j === i ? { ...x, portal } : x,
                      ),
                    })
                  }
                  error={errorFor(`portalInboxes.${i}.portal`)}
                />
                <TextInputField
                  label="Address"
                  type="email"
                  className="min-w-56 flex-[2]"
                  value={inbox.address}
                  onChange={(address) =>
                    set({
                      portalInboxes: value.portalInboxes.map((x, j) =>
                        j === i ? { ...x, address } : x,
                      ),
                    })
                  }
                  error={errorFor(`portalInboxes.${i}.address`)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${inbox.portal || "inbox"}`}
                  onClick={() =>
                    set({ portalInboxes: value.portalInboxes.filter((_, j) => j !== i) })
                  }
                >
                  <XIcon />
                </Button>
              </div>
            ))}
            {value.portalInboxes.length < 10 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() =>
                  set({ portalInboxes: [...value.portalInboxes, { portal: "", address: "" }] })
                }
              >
                <PlusIcon /> Add an inbox
              </Button>
            )}
          </FormSection>
        </>
      )}
    </SettingsForm>
  );
}
