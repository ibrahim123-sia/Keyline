"use client";

import { UploadIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { importRedirects } from "@/features/seo/redirect-actions";

type Result = {
  created: number;
  updated: number;
  problems: Array<{ line: number; message: string }>;
};

/** Bulk import (08 §6): a CSV of old address, new address and an optional type. */
export function RedirectImport({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const fileId = useId();

  const reset = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setCsv("");
      setResult(null);
    }
  };
  const run = async () => {
    setBusy(true);
    const res = await importRedirects({ csv }).catch(() => null);
    setBusy(false);
    if (!res) return toast.error("Could not reach the server. Try again.");
    if (!res.ok) return toast.error(res.error);
    setResult(res.data);
    toast.success(`${res.data.created} added, ${res.data.updated} updated`);
    onDone();
  };

  return (
    <>
      <Button variant="outline" onClick={() => reset(true)}>
        <UploadIcon /> Import CSV
      </Button>
      <Dialog open={open} onOpenChange={reset}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Import redirects</DialogTitle>
            <DialogDescription>
              One redirect per line: old address, new address, and 301 or 302 (optional, 301 if left
              out). A header row is fine.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <label htmlFor={fileId} className="text-[13px] font-semibold text-ink">
              CSV file
            </label>
            <input
              id={fileId}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="text-[13px]"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setCsv(await file.text());
              }}
            />
            <Textarea
              aria-label="CSV text"
              rows={8}
              value={csv}
              placeholder={"from,to,type\n/old-page,/new-page,301"}
              onChange={(e) => setCsv(e.target.value)}
              className="font-mono text-[12.5px]"
            />
            {result && result.problems.length > 0 && (
              <div
                role="alert"
                className="max-h-40 overflow-y-auto rounded-md border border-border p-2"
              >
                <p className="mb-1 text-[12.5px] font-semibold text-danger">
                  {result.problems.length} line{result.problems.length === 1 ? "" : "s"} not
                  imported
                </p>
                <ul className="text-[12.5px] text-text-muted">
                  {result.problems.map((p) => (
                    <li key={`${p.line}-${p.message}`}>
                      Line {p.line}: {p.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => reset(false)}>
              Close
            </Button>
            <Button disabled={busy || !csv.trim()} onClick={() => void run()}>
              {busy ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
