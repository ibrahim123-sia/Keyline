import { NextRequest, type NextFetchEvent } from "next/server";
import { describe, expect, it } from "vitest";
import { consentFromCookieString } from "@/lib/consent";
import { readEnv } from "@/lib/legacy-env";
import { getStored } from "@/lib/stored";

/** What users and deployments held before the rename to Propel keeps working (decision 89). */

function memoryStorage(initial: Record<string, string>): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

const event = { waitUntil: () => undefined } as unknown as NextFetchEvent;

async function runMiddleware(path: string, cookie: string) {
  const { middleware } = await import("@/middleware");
  return middleware(
    new NextRequest(`https://agency.example${path}`, { headers: { cookie } }),
    event,
  );
}

describe("renamed environment variables", () => {
  it("prefer PROPEL_* and fall back to KEYLINE_*", () => {
    expect(readEnv("PROPEL_ENV", { KEYLINE_ENV: "staging" })).toBe("staging");
    expect(readEnv("PROPEL_ENV", { PROPEL_ENV: "production", KEYLINE_ENV: "staging" })).toBe(
      "production",
    );
    expect(readEnv("PROPEL_RELEASE", { KEYLINE_RELEASE: "v1.2" })).toBe("v1.2");
    expect(readEnv("PROPEL_DATA_DIR", {})).toBeUndefined();
  });
});

describe("renamed browser storage keys", () => {
  it("moves a keyline.* value to its propel.* key once", () => {
    const store = memoryStorage({ "keyline.recent": '["a","b"]', "propel.other": "x" });
    expect(getStored(store, "propel.recent")).toBe('["a","b"]');
    expect(store.getItem("propel.recent")).toBe('["a","b"]');
    expect(store.getItem("keyline.recent")).toBeNull();
    expect(getStored(store, "propel.missing")).toBeNull();
    expect(getStored(store, "propel.other")).toBe("x");
  });
});

describe("renamed cookies", () => {
  it("reads the old consent cookie when there is no new one", () => {
    expect(consentFromCookieString("keyline_consent=v1.a1.m0.1760000000")).toMatchObject({
      analytics: true,
      marketing: false,
    });
    expect(
      consentFromCookieString(
        "keyline_consent=v1.a1.m1.1760000000; propel_consent=v1.a0.m0.1760000000",
      ),
    ).toMatchObject({ analytics: false });
  });

  it("keeps a signed-in admin signed in: the old session cookie moves to the new name", async () => {
    const res = await runMiddleware("/admin/leads", "keyline.session_token=tok.sig");
    // No redirect to sign-in.
    expect(res.headers.get("location")).toBeNull();
    // This request already carries the new cookie, and the browser gets it for the next ones.
    expect(res.headers.get("x-middleware-request-cookie")).toContain(
      "propel.session_token=tok.sig",
    );
    const set = res.cookies.getAll();
    expect(set.find((c) => c.name === "propel.session_token")).toMatchObject({
      value: "tok.sig",
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60,
    });
    expect(set.find((c) => c.name === "keyline.session_token")).toMatchObject({ maxAge: 0 });
  });

  it("a session without 'remember me' stays a browser-session cookie; secure ones keep their prefix", async () => {
    const res = await runMiddleware(
      "/account",
      "__Secure-keyline.session_token=tok.sig; __Secure-keyline.dont_remember=true",
    );
    const moved = res.cookies.getAll().find((c) => c.name === "__Secure-propel.session_token");
    expect(moved).toMatchObject({ value: "tok.sig", secure: true });
    expect(moved?.maxAge).toBeUndefined();
  });

  it("does nothing when the new cookies are already there, and still signs out nobody", async () => {
    const res = await runMiddleware(
      "/admin",
      "keyline.session_token=old.sig; propel.session_token=new.sig",
    );
    expect(res.cookies.getAll().find((c) => c.name === "propel.session_token")).toBeUndefined();
    const signedOut = await runMiddleware("/admin", "");
    expect(signedOut.headers.get("location")).toContain("/admin/sign-in");
  });
});
