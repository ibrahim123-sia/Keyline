"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { SelectField, TextInputField } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createProperty } from "@/features/properties/actions";
import { useAction } from "@/lib/use-action";

type Choice<T extends string> = { value: T; label: string };

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Choice<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-[13px] font-semibold text-ink">{label}</legend>
      <div className="inline-flex w-fit rounded-lg border border-border bg-surface-soft p-0.5">
        {options.map((o) => (
          <label
            key={o.value}
            className="cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-medium text-text-muted has-[:checked]:bg-surface has-[:checked]:text-ink has-[:checked]:shadow-sm has-[:focus-visible]:ring-2"
          >
            <input
              type="radio"
              className="sr-only"
              name={label}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** "New property": the few things that shape the editor, then the draft opens. */
export function NewPropertyDialog({ types }: { types: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [purpose, setPurpose] = useState<"sale" | "rent">("sale");
  const [completion, setCompletion] = useState<"ready" | "off_plan">("ready");
  const [propertyTypeId, setType] = useState("");
  const [title, setTitle] = useState("");
  const create = useAction(createProperty, {
    success: (d) => `Draft ${d.reference} created`,
    onSuccess: (d) => {
      setOpen(false);
      router.push(`/admin/properties/${d.id}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon /> New property
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New property</DialogTitle>
          <DialogDescription>
            Starts as a draft. Nothing shows on the site until you publish it.
          </DialogDescription>
        </DialogHeader>
        <form
          id={formId}
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void create.run({ purpose, completion, propertyTypeId, title });
          }}
        >
          <div className="flex flex-wrap gap-6">
            <Segmented
              label="Purpose"
              value={purpose}
              onChange={setPurpose}
              options={[
                { value: "sale", label: "For sale" },
                { value: "rent", label: "For rent" },
              ]}
            />
            <Segmented
              label="Completion"
              value={completion}
              onChange={setCompletion}
              options={[
                { value: "ready", label: "Ready" },
                { value: "off_plan", label: "Off-plan" },
              ]}
            />
          </div>
          <SelectField
            label="Property type"
            required
            value={propertyTypeId}
            onChange={setType}
            options={types.map((t) => ({ value: t.id, label: t.name }))}
            placeholder="Choose a type"
            error={create.errorFor("propertyTypeId")}
          />
          <TextInputField
            label="Title"
            description="You can change it later."
            maxLength={120}
            placeholder="e.g. Two-bed apartment with marina view"
            value={title}
            onChange={setTitle}
            error={create.errorFor("title")}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={create.pending}>
            {create.pending ? "Creating…" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
