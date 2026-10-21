"use client";

import { RefreshCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { runSeoCheck } from "@/features/seo/report-actions";
import { useAction } from "@/lib/use-action";

/** Queues the broken-link check now (it also runs every Monday). */
export function RunCheckButton({ pending }: { pending: boolean }) {
  const router = useRouter();
  const run = useAction(runSeoCheck, {
    success: (d) =>
      d.queued ? "Check started: refresh in a few minutes" : "A check is already running",
    onSuccess: () => router.refresh(),
  });
  return (
    <Button variant="outline" disabled={pending || run.pending} onClick={() => void run.run({})}>
      <RefreshCwIcon /> {pending ? "Check running…" : "Run the link check now"}
    </Button>
  );
}
