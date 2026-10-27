"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { SelectField, TextInputField } from "@/components/admin/fields";
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
import { createProject } from "@/features/projects/actions";
import { useAction } from "@/lib/use-action";

type Node = { id: string; parentId: string | null; name: string; level: string };

/** "New project": name, developer and location, then the project opens in the editor. */
export function NewProjectDialog({
  developers,
  locations,
}: {
  developers: Array<{ id: string; name: string }>;
  locations: Node[];
}) {
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [developerId, setDeveloperId] = useState("");
  const [locationId, setLocationId] = useState<string | null>(null);
  const create = useAction(createProject, {
    success: "Project created",
    onSuccess: (d) => {
      setOpen(false);
      router.push(`/admin/projects/${d.id}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon /> New project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            It stays unpublished until you publish it from the editor.
          </DialogDescription>
        </DialogHeader>
        <form
          id={formId}
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void create.run({ name, developerId, locationId: locationId ?? "" });
          }}
        >
          <TextInputField
            label="Project name"
            required
            maxLength={120}
            placeholder="e.g. The Linden Residences"
            value={name}
            onChange={setName}
            error={create.errorFor("name")}
          />
          {developers.length === 0 ? (
            <p className="text-[13px] text-text-muted">
              Add the developer first in{" "}
              <Link href="/admin/setup/developers" className="text-ink underline">
                Setup → Developers
              </Link>
              .
            </p>
          ) : (
            <SelectField
              label="Developer"
              required
              value={developerId}
              onChange={setDeveloperId}
              options={developers.map((d) => ({ value: d.id, label: d.name }))}
              placeholder="Choose a developer"
              error={create.errorFor("developerId")}
            />
          )}
          <LocationSelect
            label="Location"
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
            {create.pending ? "Creating…" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
