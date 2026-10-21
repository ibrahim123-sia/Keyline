"use client";

import { CalendarCheckIcon, DownloadIcon, MessageCircleIcon, PhoneIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { InquiryKind } from "@/features/inquiries/schema";
import { property as t } from "@/lib/i18n/dictionaries/property";
import { InquiryForm } from "./inquiry-form";

export type ContactInfo = {
  propertyId: string;
  reference: string;
  /** wa.me link with the reference and page address already in the message, or null. */
  whatsappHref: string | null;
  phone: string | null;
  brochureUrl: string | null;
};

const titles: Record<InquiryKind, string> = {
  inquiry: t.form.inquiryTitle,
  tour: t.form.tourTitle,
  callback: t.form.callbackTitle,
};

/** One dialog for "Book a tour" and "Request a callback" (the tour flow proper is Phase 6). */
export function useInquiryDialog(info: ContactInfo) {
  const [kind, setKind] = useState<InquiryKind | null>(null);
  const dialog = (
    <Dialog open={kind !== null} onOpenChange={(o) => !o && setKind(null)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{kind ? titles[kind] : ""}</DialogTitle>
          <DialogDescription>{info.reference}</DialogDescription>
        </DialogHeader>
        {kind && (
          <InquiryForm
            key={kind}
            propertyId={info.propertyId}
            reference={info.reference}
            kind={kind}
            onDone={() => setKind(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
  return { open: setKind, dialog };
}

/** Buttons in the sticky contact card (06 §5): tour, WhatsApp, call, callback, brochure. */
export function ContactActions({ info }: { info: ContactInfo }) {
  const { open, dialog } = useInquiryDialog(info);
  const [showNumber, setShowNumber] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Button size="md" onClick={() => open("tour")}>
        <CalendarCheckIcon aria-hidden /> {t.contact.tour}
      </Button>
      {info.whatsappHref && (
        <Button asChild variant="outline-site" size="md">
          <a href={info.whatsappHref} target="_blank" rel="noopener noreferrer">
            <MessageCircleIcon aria-hidden /> {t.contact.whatsapp}
          </a>
        </Button>
      )}
      {info.phone &&
        (showNumber ? (
          <Button asChild variant="outline-site" size="md">
            <a href={`tel:${info.phone}`}>
              <PhoneIcon aria-hidden /> {info.phone}
            </a>
          </Button>
        ) : (
          <Button variant="outline-site" size="md" onClick={() => setShowNumber(true)}>
            <PhoneIcon aria-hidden /> {t.contact.call} · {t.contact.showNumber}
          </Button>
        ))}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[14px]">
        <button
          type="button"
          onClick={() => open("callback")}
          className="font-semibold text-accent underline-offset-4 hover:underline"
        >
          {t.contact.callback}
        </button>
        {info.brochureUrl && (
          <a
            href={info.brochureUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-ink underline-offset-4 hover:underline"
          >
            <DownloadIcon className="size-4" aria-hidden /> {t.contact.brochure}
          </a>
        )}
      </div>
      {dialog}
    </div>
  );
}

/** Phone bottom bar (02 §5 property page): Book a tour and WhatsApp, always in reach. */
export function ContactBottomBar({ info }: { info: ContactInfo }) {
  const { open, dialog } = useInquiryDialog(info);
  return (
    <div
      role="region"
      aria-label={t.contact.bottomBar}
      className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur lg:hidden print:hidden"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <Button size="md" className="flex-1" onClick={() => open("tour")}>
        <CalendarCheckIcon aria-hidden /> {t.contact.tour}
      </Button>
      {info.whatsappHref ? (
        <Button asChild variant="outline-site" size="md" className="flex-1">
          <a href={info.whatsappHref} target="_blank" rel="noopener noreferrer">
            <MessageCircleIcon aria-hidden /> {t.contact.whatsapp}
          </a>
        </Button>
      ) : info.phone ? (
        <Button asChild variant="outline-site" size="md" className="flex-1">
          <a href={`tel:${info.phone}`}>
            <PhoneIcon aria-hidden /> {t.contact.call}
          </a>
        </Button>
      ) : null}
      {dialog}
    </div>
  );
}
