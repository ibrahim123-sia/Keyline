"use client";

import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
  type Extensions,
} from "@tiptap/react";
import {
  BoldIcon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  Redo2Icon,
  Undo2Icon,
} from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { emptyDoc, isSafeHref, type RichDoc } from "@/lib/rich-text";
import { richTextExtensions } from "@/lib/rich-text-extensions";

function words(editor: Editor | null): number {
  const text = editor?.getText({ blockSeparator: " " }) ?? "";
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/**
 * Rich text field (02 §4 RichTextEditor; 07 §3.7): headings, bold, italic, lists and links
 * only, matching what the server accepts and renders (lib/rich-text.ts). Posts pass their
 * larger model and its extra tools (components/admin/content/post-body-editor.tsx).
 */
export function RichTextEditor<D extends { type: "doc" } = RichDoc>({
  label,
  description,
  value,
  onChange,
  error,
  placeholder,
  targetWords,
  disabled,
  extensions: makeExtensions = richTextExtensions,
  tools,
  allowHref,
  linkHint,
  minHeight = "min-h-40",
}: {
  label: string;
  description?: ReactNode;
  value: D | null;
  onChange: (doc: D) => void;
  error?: string;
  placeholder?: string;
  /** Shows "120 of 120 words" style progress (e.g. the completeness score target). */
  targetWords?: number;
  disabled?: boolean;
  /** The document model; read once, when the editor is created. */
  extensions?: (placeholder?: string) => Extensions;
  /** More toolbar buttons for that model. */
  tools?: (editor: Editor | null) => ReactNode;
  /** Links the model accepts (and the hint when one is refused). */
  allowHref?: (href: string) => boolean;
  linkHint?: string;
  minHeight?: string;
}) {
  const labelId = useId();
  const descriptionId = useId();
  // Only read when the editor is created.
  const [extensions] = useState(() => makeExtensions(placeholder));
  const attributes = {
    class: `rich-text ${minHeight} px-3 py-2.5 text-[14px] leading-relaxed outline-none`,
    role: "textbox",
    "aria-multiline": "true",
    "aria-labelledby": labelId,
    ...(description ? { "aria-describedby": descriptionId } : {}),
    ...(error ? { "aria-invalid": "true" } : {}),
  };
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions,
    content: value ?? emptyDoc(),
    editorProps: { attributes },
    // The editor's node attributes are not plain objects, so a Server Action receives them as
    // opaque references (the server sees a function): pass plain JSON instead.
    onUpdate: ({ editor: e }) => onChange(JSON.parse(JSON.stringify(e.getJSON())) as D),
  });

  // Changes from outside (discard, an AI draft) replace the text. The editor's own updates
  // come back equal, so typing never resets the cursor.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    let next;
    try {
      next = editor.schema.nodeFromJSON(value ?? emptyDoc());
    } catch {
      return;
    }
    if (!editor.state.doc.eq(next))
      editor.commands.setContent(next.toJSON(), { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setEditable(!disabled, false);
  }, [editor, disabled]);

  const attributesKey = JSON.stringify(attributes);
  useEffect(() => {
    if (editor && !editor.isDestroyed)
      editor.setOptions({ editorProps: { attributes: JSON.parse(attributesKey) } });
  }, [editor, attributesKey]);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      h2: e?.isActive("heading", { level: 2 }) ?? false,
      h3: e?.isActive("heading", { level: 3 }) ?? false,
      bullet: e?.isActive("bulletList") ?? false,
      ordered: e?.isActive("orderedList") ?? false,
      link: e?.isActive("link") ?? false,
      canUndo: e?.can().undo() ?? false,
      canRedo: e?.can().redo() ?? false,
      words: words(e),
    }),
  });

  const tool = (
    labelText: string,
    icon: ReactNode,
    active: boolean | undefined,
    run: () => void,
    enabled = true,
  ) => (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={labelText}
      aria-pressed={active}
      disabled={disabled || !editor || !enabled}
      className={cn(active && "bg-muted text-ink")}
      onMouseDown={(e) => e.preventDefault()} // keep the selection in the editor
      onClick={run}
    >
      {icon}
    </Button>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-[13px] font-semibold text-ink">
        {label}
      </span>
      <div
        className={cn(
          "overflow-hidden rounded-lg border bg-surface focus-within:ring-2 focus-within:ring-ring/30",
          error ? "border-destructive" : "border-input",
        )}
      >
        <div
          role="toolbar"
          aria-label={`${label} formatting`}
          className="flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-1"
        >
          {tool("Bold", <BoldIcon />, state?.bold, () =>
            editor?.chain().focus().toggleBold().run(),
          )}
          {tool("Italic", <ItalicIcon />, state?.italic, () =>
            editor?.chain().focus().toggleItalic().run(),
          )}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          {tool("Heading", <Heading2Icon />, state?.h2, () =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run(),
          )}
          {tool("Subheading", <Heading3Icon />, state?.h3, () =>
            editor?.chain().focus().toggleHeading({ level: 3 }).run(),
          )}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          {tool("Bulleted list", <ListIcon />, state?.bullet, () =>
            editor?.chain().focus().toggleBulletList().run(),
          )}
          {tool("Numbered list", <ListOrderedIcon />, state?.ordered, () =>
            editor?.chain().focus().toggleOrderedList().run(),
          )}
          <LinkButton
            editor={editor}
            active={state?.link ?? false}
            disabled={disabled}
            allowHref={allowHref}
            hint={linkHint}
          />
          {tools && (
            <>
              <span className="mx-1 h-5 w-px bg-border" aria-hidden />
              {tools(editor)}
            </>
          )}
          <span className="ms-auto flex items-center gap-0.5">
            {tool(
              "Undo",
              <Undo2Icon />,
              undefined,
              () => editor?.chain().focus().undo().run(),
              state?.canUndo,
            )}
            {tool(
              "Redo",
              <Redo2Icon />,
              undefined,
              () => editor?.chain().focus().redo().run(),
              state?.canRedo,
            )}
          </span>
        </div>
        <EditorContent editor={editor} />
      </div>
      <div className="flex items-start justify-between gap-3">
        {description ? (
          <p id={descriptionId} className="text-[12.5px] text-text-muted">
            {description}
          </p>
        ) : (
          <span />
        )}
        <span className="shrink-0 text-[12px] text-text-muted tabular" aria-live="polite">
          {targetWords
            ? `${state?.words ?? 0} of ${targetWords} words`
            : `${state?.words ?? 0} words`}
        </span>
      </div>
      {error && (
        <p role="alert" className="text-[12.5px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function LinkButton({
  editor,
  active,
  disabled,
  allowHref = isSafeHref,
  hint = "Use a full address (https://…), an email (mailto:…) or a phone number (tel:…).",
}: {
  editor: Editor | null;
  active: boolean;
  disabled?: boolean;
  allowHref?: (href: string) => boolean;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const inputId = useId();
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setHref((editor?.getAttributes("link").href as string | undefined) ?? "");
          setProblem(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Link"
          aria-pressed={active}
          disabled={disabled || !editor}
          className={cn(active && "bg-muted text-ink")}
          onMouseDown={(e) => e.preventDefault()}
        >
          <LinkIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-80 flex-col gap-2">
        <label htmlFor={inputId} className="text-[13px] font-semibold text-ink">
          Link address
        </label>
        <Input
          id={inputId}
          value={href}
          placeholder="https://"
          onChange={(e) => setHref(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              document.getElementById(`${inputId}-apply`)?.click();
            }
          }}
        />
        {problem && <p className="text-[12.5px] text-danger">{problem}</p>}
        <div className="flex justify-end gap-2">
          {active && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                editor?.chain().focus().extendMarkRange("link").unsetLink().run();
                setOpen(false);
              }}
            >
              Remove link
            </Button>
          )}
          <Button
            id={`${inputId}-apply`}
            type="button"
            size="sm"
            onClick={() => {
              const url = href.trim();
              if (!allowHref(url)) {
                setProblem(hint);
                return;
              }
              editor?.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
