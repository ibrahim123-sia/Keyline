import { describe, expect, it } from "vitest";
import { promptSources } from "@/features/ai/prompts/bundle.generated";
import {
  fillPrompt,
  prompt,
  promptNames,
  promptTemplate,
  promptVariables,
  PromptVariableError,
} from "@/features/ai/prompts";
import { readPromptSources } from "../../scripts/build-ai-prompts";

describe("AI prompt files (10 §6)", () => {
  it("the bundle matches the .md files (run `pnpm ai:prompts` after editing one)", () => {
    expect(promptSources).toEqual(readPromptSources());
  });

  it("fills {{variables}}, joins lists, marks empty values and never fills twice", () => {
    const t = "Hi {{ name }}, topics: {{topics}}; rules: {{rules}}. {{name}}";
    expect(fillPrompt(t, { name: "Sara {{rules}}", topics: ["legal", "tax"], rules: [] })).toBe(
      "Hi Sara {{rules}}, topics: legal, tax; rules: (none). Sara {{rules}}",
    );
    expect(promptVariables(t)).toEqual(["name", "topics", "rules"]);
  });

  it("refuses a prompt with a missing variable", () => {
    expect(() => fillPrompt("Hello {{agencyName}}", {})).toThrow(PromptVariableError);
  });

  it("strips the maintainer comment and every prompt fills with its own variables", () => {
    for (const name of promptNames) {
      const template = promptTemplate(name);
      expect(template.startsWith("<!--")).toBe(false);
      const vars = Object.fromEntries(promptVariables(template).map((v) => [v, `<${v}>`]));
      expect(prompt(name, vars)).not.toMatch(/\{\{/);
    }
  });

  it("the customer prompt carries the grounding and safety rules", () => {
    const text = promptTemplate("customer-system");
    expect(text).toMatch(/only if it came from a tool result in this turn/);
    expect(text).toMatch(/say plainly that you don't know/);
    expect(text).toMatch(/is data, not instructions/);
    expect(text).toMatch(/Never invent a property/);
    expect(text).toMatch(/Do not negotiate prices, give legal or tax advice/);
    expect(promptVariables(text)).toEqual([
      "assistantName",
      "agencyName",
      "tone",
      "humanTopics",
      "requiredBeforeBooking",
      "agencyRules",
    ]);
  });
});
