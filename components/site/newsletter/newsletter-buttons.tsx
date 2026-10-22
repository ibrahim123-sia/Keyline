"use client";

import { useState } from "react";
import { FormAlert } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import {
  confirmNewsletterAction,
  unsubscribeNewsletterAction,
} from "@/features/newsletter/actions";
import { newsletter as t } from "@/lib/i18n/dictionaries/newsletter";

/**
 * The button on a confirmation or unsubscribe page. A click, not the link itself, does it:
 * mail scanners open links on their own and must not confirm or unsubscribe anyone.
 */
export function NewsletterButton(
  props: { kind: "confirm"; token: string } | { kind: "unsubscribe"; id: string; token: string },
) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  if (result) return <FormAlert tone={result.ok ? "success" : "error"}>{result.text}</FormAlert>;
  const copy = props.kind === "confirm" ? t.confirm : t.unsubscribe;
  return (
    <Button
      size="md"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res =
          props.kind === "confirm"
            ? await confirmNewsletterAction({ token: props.token })
            : await unsubscribeNewsletterAction({ id: props.id, token: props.token });
        setBusy(false);
        setResult(res.ok ? { ok: true, text: copy.done } : { ok: false, text: res.error });
      }}
    >
      {copy.button}
    </Button>
  );
}
