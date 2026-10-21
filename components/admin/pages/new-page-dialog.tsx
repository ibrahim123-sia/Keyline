"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { cn } from "cn";
import { TextInputField } from "@/components/admin/fields";
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
import { createPage } from "@/features/cms/page-actions";
import { pageStarterLabels, pageStarters, type PageStarter } from "@/features/cms/page-schema";
import { useAction } from "@/lib/use-action";

/** "New page": a title and what to start from; the page opens in the editor next. */
export function NewPageDialog() {
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [starter, setStarter] = useState<PageStarter>("standard");
  const create = useAction(createPage, {
    success: "Page created",
    onSuccess: (d) => {
      setOpen(false);
      router.push(`/admin/website/pages/${d.id}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon /> New page
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New page</DialogTitle>
          <DialogDescription>
            It stays a draft until you publish it from the page builder.
          </DialogDescription>
        </DialogHeader>
        <form
          id={formId}
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void create.run({ title, starter });
          }}
        >
          <TextInputField
            label="Title"
            required
            maxLength={120}
            placeholder="e.g. About us"
            value={title}
            onChange={setTitle}
            error={create.errorFor("title")}
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[13px] font-semibold text-ink">Start from</legend>
            {pageStarters.map((s) => (
              <label
                key={s}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-lg border p-3 text-[13px]",
                  starter === s ? "border-ink bg-surface-soft" : "border-border",
                )}
              >
                <input
                  type="radio"
                  name="starter"
                  value={s}
                  checked={starter === s}
                  onChange={() => setStarter(s)}
                  className="mt-0.5 accent-[var(--color-accent)]"
                />
                <span>
                  <span className="block font-semibold text-ink">{pageStarterLabels[s].label}</span>
                  <span className="text-text-muted">{pageStarterLabels[s].help}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={create.pending}>
            {create.pending ? "Creating…" : "Create page"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
