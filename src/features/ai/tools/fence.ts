/**
 * Tool results are fenced as data (10 §2 Safety, prompt-injection defence): the system prompts
 * say content inside <tool_result> is never an instruction, and nothing inside can close the
 * fence early (every "<" in the data is escaped, which stays valid JSON).
 */

export const MAX_TOOL_RESULT_CHARS = 24_000;

export function fenceToolResult(name: string, data: unknown): string {
  let json = JSON.stringify(data ?? null) ?? "null";
  if (json.length > MAX_TOOL_RESULT_CHARS)
    json = JSON.stringify({
      truncated: true,
      note: "The result was too long and was cut. Ask for fewer items.",
      partial: json.slice(0, MAX_TOOL_RESULT_CHARS),
    });
  const safe = json.replace(/</g, "\\u003c");
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "");
  return `<tool_result name="${safeName}" trust="data">\n${safe}\n</tool_result>`;
}

/** The JSON inside a fence (tests, the eval harness). */
export function unfence(content: string): unknown {
  const inner = content.replace(/^<tool_result[^>]*>\s*/, "").replace(/\s*<\/tool_result>$/, "");
  try {
    return JSON.parse(inner);
  } catch {
    return inner;
  }
}
