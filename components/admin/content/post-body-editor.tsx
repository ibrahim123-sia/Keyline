"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import {
  HousePlusIcon,
  ImagePlusIcon,
  SquareMousePointerIcon,
  Table2Icon,
  TextQuoteIcon,
  VideoIcon,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "cn";
import { MediaPickerDialog } from "@/components/admin/media/media-picker";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isPostHref, parseYouTubeUrl, type PostDoc } from "@/lib/rich-text-post";
import { postTextExtensions } from "@/lib/rich-text-post-extensions";
import { ListingSearch } from "./listing-picker";

const LINK_HINT =
  "Use a page on this site (/contact), a full address (https://…), an email (mailto:…) or a phone number (tel:…).";

/**
 * The body of a post or area guide (08 §3): the description tools plus quotes, tables,
 * library images, YouTube videos, listing cards and buttons (lib/rich-text-post.ts).
 */
export function PostBodyEditor(props: {
  label: string;
  description?: ReactNode;
  value: PostDoc | null;
  onChange: (doc: PostDoc) => void;
  error?: string;
  placeholder?: string;
  targetWords?: number;
  disabled?: boolean;
}) {
  return (
    <RichTextEditor<PostDoc>
      {...props}
      extensions={postTextExtensions}
      allowHref={isPostHref}
      linkHint={LINK_HINT}
      minHeight="min-h-80"
      tools={(editor) => <PostTools editor={editor} disabled={props.disabled} />}
    />
  );
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={cn(active && "bg-muted text-ink")}
      onMouseDown={(e) => e.preventDefault()} // keep the selection in the editor
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/** Inserts a block and an empty paragraph after it, so writing can go on below. */
function insertBlock(editor: Editor, node: { type: string; attrs: Record<string, unknown> }) {
  editor
    .chain()
    .focus()
    .insertContent([node, { type: "paragraph" }])
    .run();
}

function PostTools({ editor, disabled }: { editor: Editor | null; disabled?: boolean }) {
  const [picking, setPicking] = useState(false);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      quote: e?.isActive("blockquote") ?? false,
      table: e?.isActive("table") ?? false,
      image: e?.isActive("image") ?? false,
      cta: e?.isActive("ctaButton") ?? false,
    }),
  });
  const off = disabled || !editor;

  return (
    <>
      <ToolButton
        label="Quote"
        active={state?.quote}
        disabled={off}
        onClick={() => editor?.chain().focus().toggleBlockquote().run()}
      >
        <TextQuoteIcon />
      </ToolButton>
      <TableMenu editor={editor} inTable={state?.table ?? false} disabled={off} />
      <ToolButton
        label="Insert an image from the library"
        disabled={off}
        onClick={() => setPicking(true)}
      >
        <ImagePlusIcon />
      </ToolButton>
      {state?.image && editor && <ImageDetails editor={editor} disabled={off} />}
      <VideoButton editor={editor} disabled={off} />
      <ListingCardButton editor={editor} disabled={off} />
      <CtaButtonTool editor={editor} editing={state?.cta ?? false} disabled={off} />
      {picking && editor && (
        <MediaPickerDialog
          type="image"
          selectedId={null}
          onClose={() => setPicking(false)}
          onPick={(item) => {
            setPicking(false);
            insertBlock(editor, {
              type: "image",
              attrs: { mediaId: item.id, src: item.url, alt: null, caption: null },
            });
          }}
        />
      )}
    </>
  );
}

function TableMenu({
  editor,
  inTable,
  disabled,
}: {
  editor: Editor | null;
  inTable: boolean;
  disabled?: boolean;
}) {
  const run = (fn: (e: Editor) => void) => () => editor && fn(editor);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Table"
          disabled={disabled}
          className={cn(inTable && "bg-muted text-ink")}
          onMouseDown={(e) => e.preventDefault()}
        >
          <Table2Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        {!inTable ? (
          <DropdownMenuItem
            onSelect={run((e) =>
              e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
            )}
          >
            Insert a table
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem onSelect={run((e) => e.chain().focus().addRowAfter().run())}>
              Add a row below
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={run((e) => e.chain().focus().addColumnAfter().run())}>
              Add a column to the right
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={run((e) => e.chain().focus().toggleHeaderRow().run())}>
              Header row on or off
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={run((e) => e.chain().focus().deleteRow().run())}>
              Delete this row
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={run((e) => e.chain().focus().deleteColumn().run())}>
              Delete this column
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={run((e) => e.chain().focus().deleteTable().run())}
            >
              Delete the table
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A small form in a popover: fields, a problem line and the apply button. */
function ToolPopover({
  label,
  icon,
  active,
  disabled,
  onOpen,
  title,
  children,
  problem,
  applyLabel,
  onApply,
}: {
  label: string;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onOpen?: () => void;
  title: string;
  children: (close: () => void) => ReactNode;
  problem?: string | null;
  applyLabel?: string;
  /** Returns true when done (the popover closes). */
  onApply?: () => boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) onOpen?.();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          className={cn(active && "bg-muted text-ink")}
          onMouseDown={(e) => e.preventDefault()}
        >
          {icon}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-80 flex-col gap-2">
        <p className="text-[13px] font-semibold text-ink">{title}</p>
        {children(close)}
        {problem && <p className="text-[12.5px] text-danger">{problem}</p>}
        {onApply && (
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => onApply() && close()}>
              {applyLabel ?? "Insert"}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[12.5px] font-medium text-ink">
        {label}
      </label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ImageDetails({ editor, disabled }: { editor: Editor; disabled?: boolean }) {
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  return (
    <ToolPopover
      label="Image details"
      icon={<span className="text-[11px] font-semibold">Alt</span>}
      active
      disabled={disabled}
      title="Image details"
      onOpen={() => {
        const a = editor.getAttributes("image");
        setAlt((a.alt as string | null) ?? "");
        setCaption((a.caption as string | null) ?? "");
      }}
      applyLabel="Apply"
      onApply={() => {
        editor
          .chain()
          .focus()
          .updateAttributes("image", { alt: alt.trim() || null, caption: caption.trim() || null })
          .run();
        return true;
      }}
    >
      {() => (
        <>
          <Field
            label="Alt text"
            value={alt}
            onChange={setAlt}
            maxLength={300}
            placeholder="Empty: the library's alt text is used"
          />
          <Field label="Caption" value={caption} onChange={setCaption} maxLength={300} />
        </>
      )}
    </ToolPopover>
  );
}

function VideoButton({ editor, disabled }: { editor: Editor | null; disabled?: boolean }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <ToolPopover
      label="Insert a YouTube video"
      icon={<VideoIcon />}
      disabled={disabled}
      title="YouTube video"
      onOpen={() => {
        setUrl("");
        setTitle("");
        setProblem(null);
      }}
      problem={problem}
      onApply={() => {
        const video = parseYouTubeUrl(url);
        if (!video) {
          setProblem("Paste the video's YouTube address (youtube.com/watch?v=… or youtu.be/…).");
          return false;
        }
        if (editor)
          insertBlock(editor, {
            type: "youtube",
            attrs: { ...video, title: title.trim() || null },
          });
        return true;
      }}
    >
      {() => (
        <>
          <Field
            label="YouTube address"
            value={url}
            onChange={setUrl}
            placeholder="https://www.youtube.com/watch?v=…"
          />
          <Field
            label="Title (read out by screen readers)"
            value={title}
            onChange={setTitle}
            maxLength={200}
          />
        </>
      )}
    </ToolPopover>
  );
}

function ListingCardButton({ editor, disabled }: { editor: Editor | null; disabled?: boolean }) {
  return (
    <ToolPopover
      label="Insert a listing card"
      icon={<HousePlusIcon />}
      disabled={disabled}
      title="Listing card"
    >
      {(close) => (
        <>
          <p className="text-[12.5px] text-text-muted">
            The card shows the listing&apos;s current photo, price and status.
          </p>
          <ListingSearch
            autoFocus
            onPick={(o) => {
              if (editor)
                insertBlock(editor, {
                  type: "propertyCard",
                  attrs: { propertyId: o.id, label: o.label },
                });
              close();
            }}
          />
        </>
      )}
    </ToolPopover>
  );
}

function CtaButtonTool({
  editor,
  editing,
  disabled,
}: {
  editor: Editor | null;
  editing: boolean;
  disabled?: boolean;
}) {
  const [label, setLabel] = useState("");
  const [href, setHref] = useState("");
  const [secondary, setSecondary] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <ToolPopover
      label={editing ? "Edit the button" : "Insert a button"}
      icon={<SquareMousePointerIcon />}
      active={editing}
      disabled={disabled}
      title={editing ? "Button" : "Insert a button"}
      onOpen={() => {
        const a = editing && editor ? editor.getAttributes("ctaButton") : {};
        setLabel((a.label as string | undefined) ?? "");
        setHref((a.href as string | undefined) ?? "");
        setSecondary(a.variant === "secondary");
        setProblem(null);
      }}
      problem={problem}
      applyLabel={editing ? "Apply" : "Insert"}
      onApply={() => {
        const attrs = {
          label: label.trim(),
          href: href.trim(),
          variant: secondary ? "secondary" : "primary",
        };
        if (!attrs.label) {
          setProblem("Give the button a label.");
          return false;
        }
        if (!isPostHref(attrs.href)) {
          setProblem(LINK_HINT);
          return false;
        }
        if (!editor) return true;
        if (editing) editor.chain().focus().updateAttributes("ctaButton", attrs).run();
        else insertBlock(editor, { type: "ctaButton", attrs });
        return true;
      }}
    >
      {() => (
        <>
          <Field
            label="Label"
            value={label}
            onChange={setLabel}
            maxLength={80}
            placeholder="e.g. Book a viewing"
          />
          <Field label="Link" value={href} onChange={setHref} placeholder="/contact" />
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-accent)]"
              checked={secondary}
              onChange={(e) => setSecondary(e.target.checked)}
            />
            Outline style (less prominent)
          </label>
        </>
      )}
    </ToolPopover>
  );
}
