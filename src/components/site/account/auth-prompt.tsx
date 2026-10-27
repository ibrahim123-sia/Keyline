"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { account } from "@/lib/i18n/dictionaries/account";
import { returnPath } from "./pending";

/**
 * "Sign in to save" (12 §1): opened from a save action; signing in or up brings the guest
 * back here and the save is finished then.
 */
export function AuthPrompt({
  title,
  open,
  onOpenChange,
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const next = encodeURIComponent(returnPath());
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{account.save.promptText}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button asChild size="md">
            <a href={`/sign-in?next=${next}`}>{account.save.signIn}</a>
          </Button>
          <Button asChild variant="outline-site" size="md">
            <a href={`/sign-up?next=${next}`}>{account.save.signUp}</a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
