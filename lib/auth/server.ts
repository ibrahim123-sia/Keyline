import "server-only";
import { headers } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";
import { getDb } from "@/db/client";
import { createAuth, type Auth } from "./config";

/** Auth instance for the current request (Workers need a request-scoped DB client). */
export const getAuth = cache(async (): Promise<Auth> => createAuth(await getDb()));

/** Current session or null. Deduped within one request. Reads cookies: render behind <Suspense>. */
export const getSession = cache(async () => {
  const requestHeaders = await headers();
  // Better Auth's setup uses Math.random(), which Next only allows at request time; headers()
  // alone is also resolved during runtime prefetch prerenders, connection() is not.
  await connection();
  const auth = await getAuth();
  return auth.api.getSession({ headers: requestHeaders });
});

export type SessionData = NonNullable<Awaited<ReturnType<typeof getSession>>>;
