"use client";

import { CopyIcon, DownloadIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { renderSVG } from "uqr";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { DataTable, type ColumnDef } from "@/components/admin/data-table";
import { TextInputField } from "@/components/admin/fields";
import { SidePanel } from "@/components/admin/side-panel";
import { Button } from "@/components/ui/button";
import { deleteUtmLink, saveUtmLink } from "@/features/utm/actions";
import {
  campaignUrl,
  emptyUtmLink,
  shortLinkPath,
  sitePath,
  utmMediumSuggestions,
  utmSourceSuggestions,
  type UtmLinkInput,
} from "@/features/utm/links";
import type { UtmLinkRow } from "@/features/utm/queries";
import { useAction } from "@/lib/use-action";

type Editing = { id: string | null; shortCode: string | null; data: UtmLinkInput };

const pageSuggestions = [
  "/",
  "/buy",
  "/rent",
  "/off-plan",
  "/projects",
  "/agents",
  "/tools/mortgage",
  "/tools/rental-returns",
];

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Could not copy. Select the text and copy it instead.");
  }
}

function download(href: string, fileName: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  a.click();
}

/** The QR code for a short link, with SVG and PNG downloads (09 §2). */
function QrCode({ url, fileName }: { url: string; fileName: string }) {
  const svg = useMemo(() => renderSVG(url, { ecc: "M", border: 2, pixelSize: 8 }), [url]);
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const png = () => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 1024;
      const g = canvas.getContext("2d");
      if (!g) return;
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 1024, 1024);
      g.imageSmoothingEnabled = false;
      g.drawImage(img, 0, 0, 1024, 1024);
      download(canvas.toDataURL("image/png"), `${fileName}.png`);
    };
    img.src = src;
  };
  return (
    <div className="flex items-start gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- generated in the browser */}
      <img
        src={src}
        alt={`QR code for ${url}`}
        className="size-36 rounded-md border border-border bg-white p-1"
      />
      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" onClick={() => download(src, `${fileName}.svg`)}>
          <DownloadIcon /> SVG
        </Button>
        <Button type="button" variant="outline" onClick={png}>
          <DownloadIcon /> PNG
        </Button>
      </div>
    </div>
  );
}

/** Admin -> Campaigns: UTM links with short links, QR codes, clicks and the leads they brought. */
export function UtmLinksManager({
  rows,
  total,
  page,
  pageSize,
  sort,
  siteOrigin,
  readOnly,
}: {
  rows: UtmLinkRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: { id: string; desc: boolean };
  siteOrigin: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const formId = useId();
  const [editing, setEditing] = useState<Editing | null>(null);
  const close = () => setEditing(null);
  const save = useAction(saveUtmLink, {
    success: "Link saved",
    onSuccess: (res) => {
      setEditing((e) => (e ? { ...e, id: res.id, shortCode: res.shortCode } : e));
      router.refresh();
    },
  });
  const set = (patch: Partial<UtmLinkInput>) =>
    setEditing((e) => (e ? { ...e, data: { ...e.data, ...patch } } : e));

  const columns = useMemo<ColumnDef<UtmLinkRow, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Link",
        meta: { sortKey: "name", label: "Link" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{row.original.name}</p>
            <p className="truncate text-[12px] text-text-muted">
              {shortLinkPath(row.original.shortCode)} → {row.original.baseUrl}
            </p>
          </div>
        ),
      },
      {
        id: "tags",
        header: "Source / medium / campaign",
        meta: { label: "Source / medium / campaign" },
        cell: ({ row }) =>
          `${row.original.utmSource} / ${row.original.utmMedium} / ${row.original.utmCampaign}`,
      },
      {
        id: "clicks",
        header: "Clicks",
        meta: { sortKey: "clicks", label: "Clicks" },
        cell: ({ row }) => row.original.clicks.toLocaleString(),
      },
      {
        id: "leads",
        header: "Leads",
        meta: { label: "Leads (last touch)" },
        cell: ({ row }) => row.original.leads.toLocaleString(),
      },
      {
        id: "created",
        header: "Created",
        meta: { sortKey: "created", label: "Created" },
        cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
      },
    ],
    [],
  );

  const data = editing?.data;
  const basePath = data ? sitePath(data.baseUrl, siteOrigin) : null;
  const preview =
    data && basePath && data.utmSource && data.utmMedium && data.utmCampaign
      ? campaignUrl(siteOrigin, basePath, data)
      : null;
  const shortUrl = editing?.shortCode
    ? new URL(shortLinkPath(editing.shortCode), siteOrigin).toString()
    : null;

  return (
    <>
      <DataTable
        tableId="utm-links"
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        getRowId={(r) => r.id}
        searchPlaceholder="Search links"
        onRowClick={(r) =>
          setEditing({
            id: r.id,
            shortCode: r.shortCode,
            data: {
              name: r.name,
              baseUrl: r.baseUrl,
              utmSource: r.utmSource,
              utmMedium: r.utmMedium,
              utmCampaign: r.utmCampaign,
              utmTerm: r.utmTerm,
              utmContent: r.utmContent,
            },
          })
        }
        toolbar={
          !readOnly && (
            <Button onClick={() => setEditing({ id: null, shortCode: null, data: emptyUtmLink() })}>
              <PlusIcon /> New link
            </Button>
          )
        }
        empty="No campaign links yet. Make one for each ad, post, email or printed QR code."
      />

      <SidePanel
        wide
        open={editing !== null}
        onOpenChange={(o) => !o && close()}
        title={editing?.id ? `Edit ${editing.data.name || "link"}` : "New campaign link"}
        footer={
          !readOnly && (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div>
                {editing?.id && (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" className="text-danger">
                        Delete
                      </Button>
                    }
                    title={`Delete ${editing.data.name}?`}
                    description="Its short link and QR code stop working and go to the home page instead."
                    confirmLabel="Delete"
                    destructive
                    onConfirm={async () => {
                      const res = await deleteUtmLink({ id: editing.id! });
                      if (!res.ok) return toast.error(res.error);
                      toast.success("Link deleted");
                      close();
                      router.refresh();
                    }}
                  />
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={close}>
                  Close
                </Button>
                <Button type="submit" form={formId} disabled={save.pending}>
                  {save.pending ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          )
        }
      >
        {editing && data && (
          <form
            id={formId}
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save.run({
                id: editing.id,
                data: {
                  ...data,
                  utmTerm: data.utmTerm || null,
                  utmContent: data.utmContent || null,
                },
              });
            }}
          >
            <TextInputField
              label="Name"
              required
              description="For you, e.g. “Instagram ad, Marina 2-beds, October”."
              value={data.name}
              onChange={(name) => set({ name })}
              error={save.errorFor("name")}
            />
            <TextInputField
              label="Page"
              required
              description="A page or listing on this site: a path like /buy/dubai-marina or its full address."
              value={data.baseUrl}
              onChange={(baseUrl) => set({ baseUrl })}
              suggestions={pageSuggestions}
              error={save.errorFor("baseUrl")}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <TextInputField
                label="Source"
                required
                placeholder="instagram"
                value={data.utmSource}
                onChange={(utmSource) => set({ utmSource })}
                suggestions={[...utmSourceSuggestions]}
                error={save.errorFor("utmSource")}
              />
              <TextInputField
                label="Medium"
                required
                placeholder="paid_social"
                description="Use qr for printed codes."
                value={data.utmMedium}
                onChange={(utmMedium) => set({ utmMedium })}
                suggestions={[...utmMediumSuggestions]}
                error={save.errorFor("utmMedium")}
              />
              <TextInputField
                label="Campaign"
                required
                placeholder="marina-2bed-oct"
                value={data.utmCampaign}
                onChange={(utmCampaign) => set({ utmCampaign })}
                error={save.errorFor("utmCampaign")}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInputField
                label="Term"
                description="Optional: the keyword of a search ad."
                value={data.utmTerm ?? ""}
                onChange={(v) => set({ utmTerm: v || null })}
                error={save.errorFor("utmTerm")}
              />
              <TextInputField
                label="Content"
                description="Optional: which ad, post or flyer."
                value={data.utmContent ?? ""}
                onChange={(v) => set({ utmContent: v || null })}
                error={save.errorFor("utmContent")}
              />
            </div>

            <section
              aria-label="Your link"
              className="flex flex-col gap-3 border-t border-border pt-4"
            >
              <h3 className="text-[13px] font-semibold text-ink">Your link</h3>
              {preview ? (
                <div className="flex items-start gap-2">
                  <code className="min-w-0 flex-1 rounded-md bg-surface-muted px-3 py-2 text-[12.5px] break-all text-ink">
                    {preview}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Copy the full address"
                    onClick={() => copy(preview)}
                  >
                    <CopyIcon />
                  </Button>
                </div>
              ) : (
                <p className="text-[12.5px] text-text-muted">
                  Fill in the page, source, medium and campaign to see the address.
                </p>
              )}
              {shortUrl ? (
                <>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-md bg-surface-muted px-3 py-2 text-[13px] font-semibold text-ink">
                      {shortUrl}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Copy the short link"
                      onClick={() => copy(shortUrl)}
                    >
                      <CopyIcon />
                    </Button>
                  </div>
                  <QrCode url={shortUrl} fileName={`qr-${editing.shortCode}`} />
                </>
              ) : (
                <p className="text-[12.5px] text-text-muted">
                  Save to get the short link and its QR code.
                </p>
              )}
            </section>
          </form>
        )}
      </SidePanel>
    </>
  );
}
