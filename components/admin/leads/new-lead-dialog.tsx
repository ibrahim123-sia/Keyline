"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SelectField, TextareaField, TextInputField } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createManualLead } from "@/features/leads/import-actions";
import { manualLeadKinds } from "@/features/leads/schema";
import { useAction } from "@/lib/use-action";

type Option = { id: string; name: string };

const kindLabels: Record<(typeof manualLeadKinds)[number], string> = {
  "walk-in": "Walked in",
  "phone call": "Phoned us",
  referral: "Referred by someone",
  other: "Something else",
};

const ANY = "__auto";

/** Add lead (09 §1 #19): it goes through the same pipeline as the website's forms. */
export function NewLeadDialog({
  leadTypes,
  agents,
  listings,
}: {
  leadTypes: string[];
  agents: Array<Option & { isActive: boolean }>;
  listings: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const empty = {
    name: "",
    email: "",
    phone: "",
    how: "phone call" as (typeof manualLeadKinds)[number],
    type: ANY,
    propertyId: ANY,
    agentId: ANY,
    message: "",
  };
  const [form, setForm] = useState(empty);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const { run, pending, errorFor } = useAction(createManualLead, {
    success: (d) => (d.isNew ? "Lead added" : "Added to their open lead"),
    onSuccess: (d) => {
      setOpen(false);
      setForm(empty);
      router.push(`/admin/leads/${d.id}`);
    },
  });
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon aria-hidden /> Add lead
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a lead</DialogTitle>
            <DialogDescription>
              If they are already a contact (same email or phone), this joins their open lead.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <TextInputField
              label="Name"
              value={form.name}
              onChange={(v) => set("name", v)}
              error={errorFor("name")}
              required
            />
            <TextInputField
              label="Email"
              type="email"
              value={form.email}
              onChange={(v) => set("email", v)}
              error={errorFor("email")}
            />
            <TextInputField
              label="Phone"
              type="tel"
              value={form.phone}
              onChange={(v) => set("phone", v)}
              error={errorFor("phone")}
            />
            <SelectField
              label="How they reached us"
              value={form.how}
              onChange={(v) => set("how", v)}
              options={manualLeadKinds.map((k) => ({ value: k, label: kindLabels[k] }))}
            />
            <SelectField
              label="Lead type"
              value={form.type}
              onChange={(v) => set("type", v)}
              options={[
                { value: ANY, label: "Work it out" },
                ...leadTypes.map((x) => ({ value: x, label: x[0]!.toUpperCase() + x.slice(1) })),
              ]}
            />
            <SelectField
              label="About a listing"
              value={form.propertyId}
              onChange={(v) => set("propertyId", v)}
              options={[
                { value: ANY, label: "No listing" },
                ...listings.map((l) => ({ value: l.id, label: l.name })),
              ]}
            />
            <SelectField
              label="Agent"
              value={form.agentId}
              onChange={(v) => set("agentId", v)}
              options={[
                { value: ANY, label: "By the assignment rule" },
                ...agents.filter((a) => a.isActive).map((a) => ({ value: a.id, label: a.name })),
              ]}
            />
            <TextareaField
              label="Notes"
              value={form.message}
              onChange={(v) => set("message", v)}
              rows={3}
              maxLength={2000}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run({
                  name: form.name,
                  email: form.email,
                  phone: form.phone,
                  how: form.how,
                  type: form.type === ANY ? null : form.type,
                  propertyId: form.propertyId === ANY ? null : form.propertyId,
                  agentId: form.agentId === ANY ? null : form.agentId,
                  message: form.message,
                })
              }
            >
              Add lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
