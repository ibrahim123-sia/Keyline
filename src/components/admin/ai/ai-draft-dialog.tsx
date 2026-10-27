"use client";

import { SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { TextareaField } from "@/components/admin/fields";
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

type Created = { id: string; missing?: string[] };

/**
 * An AI helper that creates a draft from text (10 §5): a blog post from a brief, a listing
 * from pasted text. The draft opens in its editor; nothing is published.
 */
export function AiDraftDialog({
  buttonLabel,
  title,
  description,
  fieldLabel,
  placeholder,
  run,
  editorPath,
}: {
  buttonLabel: string;
  title: string;
  description: string;
  fieldLabel: string;
  placeholder: string;
  run: (text: string) => Promise<{ ok: true; data: Created } | { ok: false; error: string }>;
  editorPath: (id: string) => string;
}) {
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    const res = await run(text).catch(() => null);
    setBusy(false);
    if (!res) return setError("The AI did not answer. Please try again.");
    if (!res.ok) return setError(res.error);
    setOpen(false);
    setText("");
    toast.success(
      res.data.missing?.length
        ? `Draft created. Still to add: ${res.data.missing.join(", ")}.`
        : "Draft created",
    );
    router.push(editorPath(res.data.id));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <SparklesIcon aria-hidden /> {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          id={formId}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <TextareaField
            label={fieldLabel}
            rows={6}
            maxLength={8000}
            placeholder={placeholder}
            value={text}
            onChange={setText}
            error={error}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={busy || text.trim().length < 10}>
            {busy ? "Writing…" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
