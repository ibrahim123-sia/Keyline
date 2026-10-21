"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
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
import { createPost } from "@/features/blog/actions";
import { useAction } from "@/lib/use-action";

/** "New post": a title, then the draft opens in the editor. */
export function NewPostDialog() {
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const create = useAction(createPost, {
    success: "Draft created",
    onSuccess: (d) => {
      setOpen(false);
      router.push(`/admin/website/blog/${d.id}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon /> New post
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New post</DialogTitle>
          <DialogDescription>It stays a draft until you publish or schedule it.</DialogDescription>
        </DialogHeader>
        <form
          id={formId}
          onSubmit={(e) => {
            e.preventDefault();
            void create.run({ title });
          }}
        >
          <TextInputField
            label="Title"
            required
            maxLength={160}
            placeholder="e.g. What service charges cover"
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
