"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importPortalCsv, previewPortalCsv } from "@/features/portals/actions";
import { portalCsvFields, type PortalCsvMapping } from "@/features/portals/csv";
import { useAction } from "@/lib/use-action";

const fieldLabels = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  reference: "Listing reference",
  message: "Message",
} as const;

/** Upload, check the columns, import (13 §1 portal CSV import). */
export function PortalImport({ portals, readOnly }: { portals: string[]; readOnly: boolean }) {
  const [csv, setCsv] = useState("");
  const [portal, setPortal] = useState(portals[0] ?? "");
  const [preview, setPreview] = useState<{
    headers: string[];
    sample: string[][];
    total: number;
  } | null>(null);
  const [mapping, setMapping] = useState<PortalCsvMapping | null>(null);
  const [done, setDone] = useState<{ created: number; joined: number; skipped: number } | null>(
    null,
  );
  const check = useAction(previewPortalCsv, {
    onSuccess: (data) => {
      setPreview(data);
      setMapping(data.mapping);
      setDone(null);
    },
  });
  const run = useAction(importPortalCsv, { success: "Import finished", onSuccess: setDone });

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Portal
        <Input
          value={portal}
          onChange={(e) => setPortal(e.target.value)}
          list="portal-names"
          placeholder="Property Finder"
        />
        <datalist id="portal-names">
          {portals.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        CSV file
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const text = await file.text();
            setCsv(text);
            void check.run({ csv: text });
          }}
        />
      </label>
      {preview && mapping && (
        <section aria-label="Columns" className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {preview.total} rows. Check which column holds each detail.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {portalCsvFields.map((field) => (
              <label key={field} className="flex flex-col gap-1 text-sm">
                {fieldLabels[field]}
                <select
                  className="rounded-md border border-border bg-background px-2 py-1.5"
                  value={mapping[field] ?? ""}
                  onChange={(e) =>
                    setMapping({
                      ...mapping,
                      [field]: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                >
                  <option value="">Not in this file</option>
                  {preview.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {preview.headers.map((h, i) => (
                    <th key={i} className="border-b border-border px-2 py-1 text-start">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((row, r) => (
                  <tr key={r}>
                    {preview.headers.map((_, i) => (
                      <td key={i} className="px-2 py-1">
                        {row[i]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            className="self-start"
            disabled={readOnly || run.pending || !portal.trim()}
            onClick={() => run.run({ portal, csv, mapping })}
          >
            Import {preview.total} rows
          </Button>
        </section>
      )}
      {done && (
        <p className="text-sm">
          {done.created} new leads, {done.joined} added to open leads, {done.skipped} skipped (no
          email or phone).
        </p>
      )}
    </div>
  );
}
