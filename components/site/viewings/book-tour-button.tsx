"use client";

import { CalendarCheckIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { viewings as t } from "@/lib/i18n/dictionaries/viewings";

// The booking flow loads when someone opens it, not with the page.
const BookingForm = dynamic(() => import("./booking-form").then((m) => m.BookingForm), {
  ssr: false,
});

/** "Book a tour" on a project page (09 §5): the agency's free times for the project. */
export function BookTourButton({
  projectId,
  subject,
  agentName,
}: {
  projectId: string;
  subject: string;
  agentName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="md" className="w-full" onClick={() => setOpen(true)}>
        <CalendarCheckIcon aria-hidden /> {t.booking.title}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.booking.title}</DialogTitle>
            <DialogDescription>{subject}</DialogDescription>
          </DialogHeader>
          {open && <BookingForm projectId={projectId} agentName={agentName} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
