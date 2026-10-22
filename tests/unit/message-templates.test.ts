import { describe, expect, it } from "vitest";
import { fillTemplate, templateDefaults, unknownVariables } from "@/features/messages/defaults";
import { sampleValues, templateSaveSchema } from "@/features/messages/schema";

describe("message template editor rules", () => {
  it("finds variables a message does not offer", () => {
    expect(unknownVariables("Hi {{name}} from {{ agency }}, {{nmae}}", ["name", "agency"])).toEqual(
      ["nmae"],
    );
    expect(unknownVariables("No variables", ["name"])).toEqual([]);
  });

  it("every built-in text only uses its own variables, and the preview fills them all", () => {
    for (const [key, def] of Object.entries(templateDefaults)) {
      const texts = [
        "email" in def ? def.email.subject : "",
        "email" in def ? def.email.body : "",
        "whatsapp" in def ? def.whatsapp.body : "",
      ];
      for (const text of texts) {
        expect(unknownVariables(text, def.variables), key).toEqual([]);
        expect(fillTemplate(text, sampleValues), key).not.toMatch(/\{\{/);
      }
      for (const v of def.variables) expect(sampleValues, `${key}: ${v}`).toHaveProperty(v);
    }
  });

  it("an email needs a subject; a body is always needed", () => {
    expect(
      templateSaveSchema.safeParse({ key: "lead.new", channel: "email", subject: "", body: "x" })
        .success,
    ).toBe(false);
    expect(
      templateSaveSchema.safeParse({ key: "lead.new", channel: "whatsapp", body: "" }).success,
    ).toBe(false);
    expect(templateSaveSchema.safeParse({ key: "nope", channel: "email", body: "x" }).success).toBe(
      false,
    );
  });
});
