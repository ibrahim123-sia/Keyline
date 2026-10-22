import { describe, expect, it } from "vitest";
import { renderPdf } from "@/lib/pdf/render";

describe("renderPdf", () => {
  it("turns an HTML document into a PDF with one page per @page break", async () => {
    const html = `<!doctype html><html><head><style>
      @page { size: A4; margin: 0 }
      section { height: 200mm; }
      section + section { break-before: page; }
    </style></head><body><section>One</section><section>Two</section></body></html>`;
    const pdf = await renderPdf(html);
    const text = new TextDecoder("latin1").decode(pdf);
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text.match(/\/Type\s*\/Page[^s]/g)).toHaveLength(2);
  }, 60_000);
});
