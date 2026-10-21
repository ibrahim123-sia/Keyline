import { describe, expect, it } from "vitest";
import { checkInquiry } from "@/features/inquiries/check";
import { inquirySchema, type InquiryInput } from "@/features/inquiries/schema";

const valid: InquiryInput = {
  propertyId: "0192f000-0000-7000-8000-000000000001",
  kind: "inquiry",
  name: "Sam Visitor",
  email: "sam@example.com",
  phone: "050 123 4567",
  message: "Is it still available?",
  preferredTime: "",
  similar: false,
  consent: true,
  website: "",
  captchaToken: null,
};

/** The server's first message per field, like the form shows them. */
function serverErrors(input: InquiryInput): Record<string, string> {
  const res = inquirySchema.safeParse(input);
  if (res.success) return {};
  const out: Record<string, string> = {};
  for (const issue of res.error.issues) {
    const key = String(issue.path[0]);
    out[key] ??= issue.message;
  }
  return out;
}

const cases: Array<[string, Partial<InquiryInput>]> = [
  ["valid", {}],
  ["short name", { name: "S" }],
  ["long name", { name: "x".repeat(81) }],
  ["bad email", { email: "sam@" }],
  ["no consent", { consent: false as unknown as true }],
  ["no way to reply", { email: "", phone: "" }],
  ["callback without a phone", { kind: "callback", phone: "", email: "" }],
  ["long phone", { phone: "1".repeat(31) }],
  ["long message", { message: "x".repeat(2001) }],
  ["tour with a long time", { kind: "tour", preferredTime: "x".repeat(121) }],
];

describe("listing form checks in the browser match the server", () => {
  it.each(cases)("%s", (_, patch) => {
    const input = { ...valid, ...patch } as InquiryInput;
    expect(checkInquiry(input)).toEqual(serverErrors(input));
  });
});
