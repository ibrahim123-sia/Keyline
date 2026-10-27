"use client";

import { MapIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ContentStatusPill } from "@/components/admin/content/publish-panel";
import { EmptyState } from "@/components/admin/empty-state";
import { LocationSelect } from "@/components/admin/properties/editor/location-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createGuide } from "@/features/area-guides/actions";
import type { GuideListRow, GuideLocationNode } from "@/features/area-guides/queries";
import { useAction } from "@/lib/use-action";

/** Admin -> Website -> Area guides (08 §4): one guide per area. */
export function GuidesManager({
  guides,
  locations,
  readOnly,
}: {
  guides: GuideListRow[];
  locations: GuideLocationNode[];
  readOnly?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {!readOnly && (
        <div className="flex justify-end">
          <NewGuideDialog locations={locations} />
        </div>
      )}
      {guides.length === 0 ? (
        <EmptyState
          icon={<MapIcon className="size-6" />}
          title="No area guides yet"
          description="A guide tells visitors what it is like to live in an area. Its intro and questions also appear on the area's search pages."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
          {guides.map((g) => (
            <li key={g.id} className="flex items-center gap-3 px-4 py-3">
              <div className="h-11 w-16 shrink-0 overflow-hidden rounded-md bg-photo-placeholder">
                {g.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- /media resizes on its own
                  <img
                    src={`${g.coverUrl}?w=128&q=60`}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/website/area-guides/${g.id}`}
                  className="block truncate font-semibold text-ink hover:underline"
                >
                  {g.title}
                </Link>
                <p className="truncate text-[12.5px] text-text-muted">
                  {g.locationName} · /areas/{g.slug} · {g.questions}{" "}
                  {g.questions === 1 ? "question" : "questions"}
                </p>
              </div>
              <ContentStatusPill status={g.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewGuideDialog({ locations }: { locations: GuideLocationNode[] }) {
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [locationId, setLocationId] = useState<string | null>(null);
  const create = useAction(createGuide, {
    success: "Area guide created",
    onSuccess: (d) => {
      setOpen(false);
      router.push(`/admin/website/area-guides/${d.id}`);
    },
  });
  const taken = locations.filter((l) => l.hasGuide).map((l) => l.name);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon /> New area guide
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New area guide</DialogTitle>
          <DialogDescription>
            One guide per area. It stays a draft until you publish it.
            {taken.length > 0 && ` Areas with a guide: ${taken.join(", ")}.`}
          </DialogDescription>
        </DialogHeader>
        <form
          id={formId}
          onSubmit={(e) => {
            e.preventDefault();
            void create.run({ locationId: locationId ?? "" });
          }}
        >
          <LocationSelect
            label="Area"
            required
            nodes={locations}
            value={locationId}
            onChange={setLocationId}
            error={create.errorFor("locationId")}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={create.pending}>
            {create.pending ? "Creating…" : "Create guide"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
