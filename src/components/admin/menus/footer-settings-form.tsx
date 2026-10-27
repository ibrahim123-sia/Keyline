"use client";

import Link from "next/link";
import { useState } from "react";
import { FormSection } from "@/components/admin/page-header";
import { SwitchField, TextInputField, TextareaField } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import type { FooterSettings } from "@/features/settings/schema";
import { saveFooterSettings } from "@/features/website/actions";
import { useAction } from "@/lib/use-action";

/** Website -> Menus -> Footer: the text under the logo and an extra legal line. */
export function FooterSettingsForm({
  initial,
  shortDescription,
  readOnly,
}: {
  initial: FooterSettings;
  /** General -> Short description: used when the footer text is empty. */
  shortDescription: string;
  readOnly?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const save = useAction(saveFooterSettings, {
    success: "Footer saved",
    onSuccess: (saved) => {
      setValue(saved);
      setDirty(false);
    },
  });
  const set = (patch: Partial<FooterSettings>) => {
    setValue((v) => ({ ...v, ...patch }));
    setDirty(true);
  };
  return (
    <FormSection
      title="Footer"
      description="The rest of the footer comes from settings: logo and licence number (General), phone, email, address and social links (Contact), policy pages (Legal and privacy)."
      actions={
        !readOnly && (
          <div className="flex shrink-0 items-center gap-2">
            {dirty && <span className="text-[12px] text-text-muted">Unsaved changes</span>}
            <Button
              size="sm"
              disabled={save.pending || !dirty}
              onClick={() => void save.run(value)}
            >
              {save.pending ? "Saving…" : "Save"}
            </Button>
          </div>
        )
      }
    >
      <TextareaField
        label="Text under the logo"
        rows={3}
        value={value.text}
        placeholder={shortDescription || "A sentence about the agency"}
        description="Leave empty to use the short description from General settings."
        onChange={(text) => set({ text })}
        error={save.errorFor("text")}
      />
      <TextInputField
        label="Legal line"
        value={value.legalText}
        maxLength={300}
        placeholder="e.g. Regulated by the Real Estate Regulatory Agency"
        description="Shown next to the copyright and the licence number."
        disabled={readOnly}
        onChange={(legalText) => set({ legalText })}
        error={save.errorFor("legalText")}
      />
      <SwitchField
        label="Newsletter signup"
        description="An email box in the footer. People confirm by email before they are on the list (Campaigns -> Newsletter)."
        checked={value.newsletter}
        disabled={readOnly}
        onChange={(newsletter) => set({ newsletter })}
      />
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
        <Link
          href="/admin/settings/general"
          className="text-ink underline-offset-2 hover:underline"
        >
          General settings
        </Link>
        <Link
          href="/admin/settings/contact"
          className="text-ink underline-offset-2 hover:underline"
        >
          Contact settings
        </Link>
        <Link href="/admin/settings/legal" className="text-ink underline-offset-2 hover:underline">
          Legal and privacy settings
        </Link>
      </p>
    </FormSection>
  );
}
