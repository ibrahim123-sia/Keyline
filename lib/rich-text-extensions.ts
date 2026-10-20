import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { isSafeHref } from "@/lib/rich-text";

/**
 * The editor's document model: headings (2 and 3), bold, italic, lists, links and line
 * breaks. It must produce only what `richDocSchema` accepts; tests/unit/rich-text.test.ts
 * builds this schema and checks the two stay in step.
 */
export function richTextExtensions(placeholder = "") {
  return [
    StarterKit.configure({
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      strike: false,
      underline: false,
      heading: { levels: [2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        protocols: ["mailto", "tel"],
        isAllowedUri: (url) => isSafeHref(url),
      },
    }),
    Placeholder.configure({ placeholder }),
  ];
}
