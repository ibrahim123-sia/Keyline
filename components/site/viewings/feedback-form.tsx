"use client";

import { StarIcon } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "cn";
import { FormAlert } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { saveViewingFeedbackAction } from "@/features/viewings/actions";
import { format } from "@/lib/i18n";
import { viewings as t } from "@/lib/i18n/dictionaries/viewings";

/** After a viewing: a rating out of five and a few words (09 §5). */
export function FeedbackForm({ token }: { token: string }) {
  const id = useId();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (sent) return <FormAlert tone="success">{t.feedback.thanks}</FormAlert>;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!rating) return setError("Choose a rating");
        setBusy(true);
        const res = await saveViewingFeedbackAction({ token, rating, text });
        setBusy(false);
        if (res.ok) return setSent(true);
        setError(res.error);
      }}
    >
      {error && <FormAlert>{error}</FormAlert>}
      <fieldset>
        <legend className="mb-2 text-[14px] font-semibold text-ink">{t.feedback.rating}</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n}>
              <input
                type="radio"
                name={`${id}-rating`}
                className="peer sr-only"
                checked={rating === n}
                onChange={() => setRating(n)}
              />
              <span className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full peer-focus-visible:outline-2">
                <StarIcon
                  aria-hidden
                  className={cn("size-7", n <= rating ? "fill-accent text-accent" : "text-border")}
                />
                <span className="sr-only">{format(t.feedback.stars, { n })}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1.5">
        <span className="text-[14px] font-semibold text-ink">{t.feedback.text}</span>
        <textarea
          rows={4}
          maxLength={2000}
          className="rounded-input border border-input bg-surface px-3 py-2 text-[15px]"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <Button type="submit" size="md" disabled={busy}>
        {t.feedback.send}
      </Button>
    </form>
  );
}
