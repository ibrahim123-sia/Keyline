import { getAuth } from "@/lib/auth/server";

/** Better Auth endpoints (/api/auth/*). The auth instance is created per request (Workers). */
async function handle(request: Request): Promise<Response> {
  const auth = await getAuth();
  return auth.handler(request);
}

export const GET = handle;
export const POST = handle;
