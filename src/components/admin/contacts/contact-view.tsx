"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { mergeContactsAction } from "@/features/contacts/actions";
import type { ContactPageData } from "@/features/contacts/queries";
import { leads as t } from "@/lib/i18n/dictionaries/leads";
import { useAction } from "@/lib/use-action";

type Person = ContactPageData["contact"];

const fields = [
  ["name", "Name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["whatsapp", "WhatsApp"],
  ["nationality", "Nationality"],
  ["preferredContact", "Prefers"],
  ["preferredLanguage", "Language"],
] as const;

type Field = (typeof fields)[number][0];

/** Field-by-field merge: this contact stays, the other is folded into it (09 §4). */
function MergeDialog({
  keep,
  other,
  onClose,
}: {
  keep: Person;
  other: Person | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pick, setPick] = useState<Partial<Record<Field, "keep" | "other">>>({});
  const merge = useAction(mergeContactsAction, {
    success: "Contacts merged",
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });
  return (
    <Dialog open={other !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Merge contacts</DialogTitle>
          <DialogDescription>
            Choose which value to keep for each field. Their leads, viewings and conversations all
            move to this contact.
          </DialogDescription>
        </DialogHeader>
        {other && (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-text-muted">
                <th className="py-1 font-semibold">Field</th>
                <th className="py-1 font-semibold">This contact</th>
                <th className="py-1 font-semibold">The other one</th>
              </tr>
            </thead>
            <tbody>
              {fields.map(([key, label]) => {
                const a = keep[key];
                const b = other[key];
                const choice = pick[key] ?? (a ? "keep" : "other");
                return (
                  <tr key={key} className="border-t border-border">
                    <th scope="row" className="py-1.5 pe-2 text-left font-normal text-text-muted">
                      {label}
                    </th>
                    {(["keep", "other"] as const).map((side) => {
                      const value = side === "keep" ? a : b;
                      return (
                        <td key={side} className="py-1.5 pe-2">
                          <label className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              name={`merge-${key}`}
                              checked={choice === side}
                              disabled={!value}
                              onChange={() => setPick((p) => ({ ...p, [key]: side }))}
                              aria-label={`${label}: ${value ?? "empty"}`}
                            />
                            <span className={value ? "text-ink" : "text-text-muted"}>
                              {value ?? "—"}
                            </span>
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={merge.pending || !other}
            onClick={() => other && merge.run({ keepId: keep.id, otherId: other.id, pick })}
          >
            Merge into this contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ContactView({ data, readOnly }: { data: ContactPageData; readOnly?: boolean }) {
  const [other, setOther] = useState<Person | null>(null);
  const c = data.contact;
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <section
        aria-labelledby="contact-details"
        className="rounded-lg border border-border bg-surface p-4 text-[13px]"
      >
        <h2 id="contact-details" className="mb-2 text-[13px] font-semibold text-ink">
          Details
        </h2>
        <dl className="flex flex-col gap-1.5">
          {fields.map(([key, label]) => (
            <div key={key} className="flex justify-between gap-3">
              <dt className="text-text-muted">{label}</dt>
              <dd className="text-end text-ink">{c[key] ?? "—"}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3">
            <dt className="text-text-muted">Marketing</dt>
            <dd className="text-ink">{c.marketingConsent ? "Agreed" : "Not agreed"}</dd>
          </div>
        </dl>
      </section>
      <div className="flex flex-col gap-4">
        <section
          aria-labelledby="contact-leads"
          className="rounded-lg border border-border bg-surface p-4"
        >
          <h2 id="contact-leads" className="mb-2 text-[13px] font-semibold text-ink">
            Leads
          </h2>
          {data.leads.length === 0 ? (
            <p className="text-[13px] text-text-muted">No leads.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-[13px]">
              {data.leads.map((l) => (
                <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    href={`/admin/leads/${l.id}`}
                    className="font-semibold text-ink capitalize hover:underline"
                  >
                    {l.type} lead · {t.sources[l.source]}
                  </Link>
                  <span className="text-text-muted">
                    {l.stageName ?? "No stage"} · {l.status} ·{" "}
                    {new Date(l.createdAt).toLocaleDateString("en")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        {data.duplicates.length > 0 && (
          <section
            aria-labelledby="contact-duplicates"
            className="rounded-lg border border-border bg-surface p-4"
          >
            <h2 id="contact-duplicates" className="mb-1 text-[13px] font-semibold text-ink">
              Possibly the same person
            </h2>
            <p className="mb-2 text-[12.5px] text-text-muted">Same name, email or phone.</p>
            <ul className="flex flex-col gap-2 text-[13px]">
              {data.duplicates.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2">
                  <span>
                    <Link
                      href={`/admin/contacts/${d.id}`}
                      className="font-semibold text-ink hover:underline"
                    >
                      {d.name}
                    </Link>{" "}
                    <span className="text-text-muted">
                      {[d.email, d.phone].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {!readOnly && (
                    <Button variant="outline" size="sm" onClick={() => setOther(d)}>
                      Merge…
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <MergeDialog keep={c} other={other} onClose={() => setOther(null)} />
    </div>
  );
}
