import { describe, expect, it } from "vitest";
import { decodeEntities, safeUrl, sanitizeHtml } from "@/lib/html-sanitize";

const clean = (html: string, allowScripts = false) => sanitizeHtml(html, { allowScripts }).html;

describe("custom HTML cleaner", () => {
  it("keeps ordinary markup", () => {
    expect(clean('<h2 class="x">Hello</h2><p>One <strong>two</strong> &amp; three</p>')).toBe(
      '<h2 class="x">Hello</h2><p>One <strong>two</strong> &amp; three</p>',
    );
    expect(clean('<img src="https://cdn.example.com/a.jpg" alt="A view" loading="lazy">')).toBe(
      '<img src="https://cdn.example.com/a.jpg" alt="A view" loading="lazy">',
    );
    expect(clean("<ul><li>a<li>b</ul>")).toBe("<ul><li>a<li>b</li></li></ul>");
  });

  it("removes scripts, event handlers and dangerous links", () => {
    expect(clean("<script>alert(1)</script><p>ok</p>")).toBe("<p>ok</p>");
    expect(clean("<SCRIPT >alert(1)</script ><p>ok</p>")).toBe("<p>ok</p>");
    expect(clean('<img src=x onerror="alert(1)">')).toBe('<img src="x">');
    expect(clean('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(clean('<a href="JaVaScRiPt:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(clean('<a href=" java\tscript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(clean('<a href="&#106;avascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(clean('<a href="&#x6A;avascript&colon;alert(1)">x</a>')).toBe("<a>x</a>");
    expect(clean('<a href="data:text/html,<script>alert(1)</script>">x</a>')).toBe("<a>x</a>");
    expect(clean('<a href="vbscript:msgbox">x</a>')).toBe("<a>x</a>");
    expect(clean('<img src="x" srcset="javascript:alert(1) 1x">')).toBe('<img src="x">');
    expect(clean('<div style="background:url(javascript:alert(1))">x</div>')).toBe("<div>x</div>");
    expect(clean('<div style="color: red">x</div>')).toBe('<div style="color: red">x</div>');
  });

  it("drops elements that are not allowed, keeping only harmless text", () => {
    expect(clean("<svg><script>alert(1)</script><text>hi</text></svg>")).toBe("hi");
    expect(
      clean('<form action="https://evil.example"><input name="pw"><button>Go</button></form>'),
    ).toBe("Go");
    expect(clean("<style>body{display:none}</style><p>x</p>")).toBe("<p>x</p>");
    expect(clean("<object data=x>fallback</object>")).toBe("");
    expect(clean('<base href="https://evil.example/"><meta http-equiv="refresh">')).toBe("");
    expect(clean("<!-- note --><p>x</p><!doctype html>")).toBe("<p>x</p>");
  });

  it("can't break out of its section, and stray brackets become text", () => {
    expect(clean("</div></section><p>x")).toBe("<p>x</p>");
    expect(clean("<div><p>open")).toBe("<div><p>open</p></div>");
    expect(clean("1 < 2 and 3 > 2")).toBe("1 &lt; 2 and 3 &gt; 2");
    expect(clean('<a href="x" <b>y</b>')).toBe('<a href="x">y</a>');
    expect(clean('<p title="a&quot;onmouseover=alert(1)">x</p>')).toBe(
      '<p title="a&quot;onmouseover=alert(1)">x</p>',
    );
    expect(clean("<img src='x' alt=\"<script>\">")).toBe('<img src="x" alt="&lt;script&gt;">');
    expect(clean("<p")).toBe("&lt;p");
  });

  it("sandboxes embeds and opens new tabs safely", () => {
    expect(
      clean('<iframe src="https://www.youtube-nocookie.com/embed/x" width="560"></iframe>'),
    ).toBe(
      '<iframe src="https://www.youtube-nocookie.com/embed/x" width="560" sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>',
    );
    expect(clean('<iframe src="http://insecure.example"></iframe>')).toMatch(/^<iframe sandbox=/);
    expect(clean('<iframe src="https://x.example"><img src=y onerror=alert(1)></iframe>p')).toMatch(
      /<\/iframe>p$/,
    );
    expect(clean('<a href="https://x.example" target="_blank" rel="opener">x</a>')).toBe(
      '<a href="https://x.example" target="_blank" rel="noopener noreferrer">x</a>',
    );
  });

  it("returns scripts separately only when Settings allow them", () => {
    const off = sanitizeHtml(
      '<div id="w"></div><script src="https://widget.example/a.js"></script>',
    );
    expect(off.scripts).toEqual([]);
    const on = sanitizeHtml(
      '<div id="w"></div><script src="https://widget.example/a.js"></script><script>init()</script><script src="http://x.example/b.js"></script>',
      { allowScripts: true },
    );
    expect(on.html).toBe('<div id="w"></div>');
    expect(on.scripts).toEqual([{ src: "https://widget.example/a.js" }, { code: "init()" }]);
  });

  it("decodes character references the way a browser reads them", () => {
    expect(decodeEntities("&#106;&#x61;v&colon;&amp;&unknown;")).toBe("jav:&&unknown;");
    expect(safeUrl("/contact")).toBe("/contact");
    expect(safeUrl("mailto:a@b.example")).toBe("mailto:a@b.example");
    expect(safeUrl("ftp://x")).toBeNull();
    expect(safeUrl("http://x", { httpsOnly: true })).toBeNull();
  });
});

describe("custom HTML cleaner, odd input", () => {
  it("treats names of built-in object keys as unknown tags and entities", () => {
    expect(clean("<constructor>x</constructor><tostring>y</tostring>")).toBe("xy");
    expect(decodeEntities("&constructor;")).toBe("&constructor;");
  });
});
