import { describe, expect, it } from "vitest";
import { adminReadTools } from "@/features/ai/assistant/admin-read-tools";
import { adminWriteTools } from "@/features/ai/assistant/admin-write-tools";
import { customerTools } from "@/features/ai/assistant/customer-tools";
import { blockedToolReason, toolSpec } from "@/features/ai/tools/registry";
import { adminAiActions } from "@/features/settings/schema";

describe("assistant tools (10 §2, §3)", () => {
  it("every tool has a valid name, an object input schema and a description", () => {
    for (const tools of [customerTools, [...adminReadTools, ...adminWriteTools]]) {
      const names = tools.map((t) => t.name);
      expect(new Set(names).size).toBe(names.length);
      for (const tool of tools) {
        const spec = toolSpec(tool);
        expect(spec.inputSchema.type, tool.name).toBe("object");
        expect(spec.description.length, tool.name).toBeGreaterThan(20);
        expect(blockedToolReason(tool.name), tool.name).toBeNull();
      }
    }
  });

  it("the customer assistant has only read tools; every admin change sits behind a Settings checkbox", () => {
    expect(customerTools.every((t) => t.kind === "read")).toBe(true);
    expect(adminReadTools.every((t) => t.kind === "read")).toBe(true);
    const actions = adminWriteTools.map((t) => (t.kind === "write" ? t.action : null));
    expect(actions.every((a) => a && (adminAiActions as readonly string[]).includes(a))).toBe(true);
    expect(new Set(actions)).toEqual(new Set(adminAiActions));
  });

  it("tools that message people count their recipients (never more than 10 at once)", () => {
    const messaging = ["send_lead_reply", "send_listings_to_lead", "manage_viewing"];
    for (const t of adminWriteTools)
      if (messaging.includes(t.name) && t.kind === "write")
        expect(t.recipients?.({} as never), t.name).toBe(1);
  });
});
