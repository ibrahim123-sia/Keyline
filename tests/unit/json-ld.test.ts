import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JsonLd } from "@/components/site/json-ld";

describe("structured data", () => {
  it("cannot close its script tag, whatever the data says", () => {
    const html = renderToStaticMarkup(
      createElement(JsonLd, { data: { name: "</script><script>alert(1)</script>" } }),
    );
    expect(html).not.toContain("</script><script>");
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    const json = html.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
    expect(JSON.parse(json)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});
