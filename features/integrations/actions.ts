"use server";

import { z } from "zod";
import { getDb } from "@/db/client";
import { deleteSecret, listSecretStatus, setSecret } from "@/features/settings/secrets";
import { secretKeys } from "@/features/settings/schema";
import { adminAction } from "@/lib/actions";
import { randomToken } from "@/lib/ids";
import { maskSecret } from "@/lib/crypto";
import { generatableSecrets } from "./catalog";
import { runCheck, testableIntegrations } from "./checks";

async function statusOf(key: (typeof secretKeys)[number]) {
  const all = await listSecretStatus();
  const s = all.find((x) => x.key === key)!;
  return { ...s, lastTestedAt: s.lastTestedAt?.toISOString() ?? null };
}

/** Saves a key encrypted (04 §8). It is never sent back: the screen shows it masked. */
export const saveIntegrationKey = adminAction(
  z.object({ key: z.enum(secretKeys), value: z.string().trim().min(1, "Paste the key").max(4000) }),
  { write: true, sensitive: true },
  async ({ key, value }, ctx) => {
    const db = await getDb();
    await db.transaction((tx) => setSecret(tx, key, value, ctx.actor));
    return statusOf(key);
  },
);

export const removeIntegrationKey = adminAction(
  z.object({ key: z.enum(secretKeys) }),
  { write: true, sensitive: true },
  async ({ key }, ctx) => {
    const db = await getDb();
    await db.transaction((tx) => deleteSecret(tx, key, ctx.actor));
    return statusOf(key);
  },
);

/**
 * Makes a new random token, stores it encrypted and returns it this once, so the admin can
 * paste it into the other service. After that it is only shown masked.
 */
export const generateIntegrationKey = adminAction(
  z.object({ key: z.enum(generatableSecrets) }),
  { write: true, sensitive: true },
  async ({ key }, ctx) => {
    const value = randomToken(40);
    const db = await getDb();
    await db.transaction((tx) => setSecret(tx, key, value, ctx.actor));
    return { value, status: { ...(await statusOf(key)), masked: maskSecret(value) } };
  },
);

export const testIntegration = adminAction(
  z.object({ name: z.enum(testableIntegrations) }),
  { write: true },
  async ({ name }) => {
    const result = await runCheck(name);
    const all = await listSecretStatus();
    return {
      ...result,
      status: all.map((s) => ({ ...s, lastTestedAt: s.lastTestedAt?.toISOString() ?? null })),
    };
  },
);
