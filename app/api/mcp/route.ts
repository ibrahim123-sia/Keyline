import { handleMcpRequest } from "@/features/ai/mcp/server";

/**
 * Keyline over MCP (10 §4), Streamable HTTP without sessions: POST JSON-RPC, get JSON back.
 * There is no server-sent stream, so GET (and DELETE of a session) are not offered.
 */
export async function POST(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function GET(): Promise<Response> {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}

export async function DELETE(): Promise<Response> {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
