"use client";

import { BellIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { saveCurrentSearch } from "@/features/account/actions";
import { account } from "@/lib/i18n/dictionaries/account";
import { notify } from "../site-toaster";
import { loadMe } from "./me";
import { setPending } from "./pending";

const AuthPrompt = dynamic(() => import("./auth-prompt").then((m) => m.AuthPrompt), {
  ssr: false,
});

type Frequency = "instant" | "daily" | "weekly" | "off";

/** "Save search" on a search page (12 §2): a name and how often to hear about new homes. */
export function SaveSearchButton({ query, defaultName }: { query: string; defaultName: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(false);
  const [name, setName] = useState(defaultName);
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    const me = await loadMe();
    if (!me?.signedIn) {
      setPending({ kind: "save-search", query, name: defaultName });
      setPrompt(true);
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <Button type="button" variant="outline-site" size="md" onClick={() => void start()}>
        <BellIcon aria-hidden /> {account.searches.save}
      </Button>
      {prompt && (
        <AuthPrompt title={account.searches.promptTitle} open={prompt} onOpenChange={setPrompt} />
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{account.searches.save}</DialogTitle>
            <DialogDescription>{account.searches.saveIntro}</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const res = await saveCurrentSearch({ query, name, frequency });
              setBusy(false);
              if (!res.ok) return setError(res.fieldErrors?.name?.[0] ?? res.error);
              setOpen(false);
              notify.success(account.searches.saved);
            }}
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-[14px] font-semibold text-ink">{account.searches.name}</span>
              <input
                className="h-11 rounded-input border border-input bg-surface px-3 text-[15px]"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-err` : undefined}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[14px] font-semibold text-ink">
                {account.searches.frequency}
              </span>
              <select
                className="h-11 rounded-input border border-input bg-surface px-3 text-[15px]"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as Frequency)}
              >
                {(["instant", "daily", "weekly", "off"] as const).map((f) => (
                  <option key={f} value={f}>
                    {account.searches.frequencies[f]}
                  </option>
                ))}
              </select>
            </label>
            {error && (
              <p id={`${id}-err`} className="text-[13px] font-medium text-danger">
                {error}
              </p>
            )}
            <Button type="submit" size="md" disabled={busy}>
              {account.searches.saveButton}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
