import { afterEach, describe, expect, it } from "vitest";
import { checkUrl, FetchRefused, isBlockedIp, safeFetch, setSafeFetchDeps } from "@/lib/safe-fetch";

afterEach(() => setSafeFetchDeps(null));

describe("blocked addresses", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.10",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "fe80::1%eth0",
    "fd12:3456::1",
    "ff02::1",
    "64:ff9b::a9fe:a9fe",
    "2001:db8::1",
    "not-an-ip",
  ])("blocks %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "172.32.0.1", "104.16.0.1", "2606:4700::1111", "::ffff:8.8.8.8"])(
    "allows %s",
    (ip) => {
      expect(isBlockedIp(ip)).toBe(false);
    },
  );
});

describe("address checks", () => {
  const refused = async (url: string) => {
    try {
      await checkUrl(url);
      return null;
    } catch (err) {
      return err instanceof FetchRefused ? err.message : String(err);
    }
  };

  it("refuses schemes, ports, credentials and private hosts", async () => {
    setSafeFetchDeps({ lookup: async () => ["93.184.216.34"] });
    expect(await refused("ftp://cdn.example/a.jpg")).toBe(
      "Only http and https addresses can be downloaded.",
    );
    expect(await refused("file:///etc/passwd")).toBe(
      "Only http and https addresses can be downloaded.",
    );
    expect(await refused("https://cdn.example:8443/a.jpg")).toBe(
      "Only the standard web ports (80 and 443) are allowed.",
    );
    expect(await refused("https://user:pw@cdn.example/a.jpg")).toBe(
      "Addresses with a user name or password are not allowed.",
    );
    for (const url of [
      "http://127.0.0.1/a.jpg",
      "http://2130706433/a.jpg", // 127.0.0.1 written as a number
      "http://0x7f.1/a.jpg",
      "http://[::1]/a.jpg",
      "http://169.254.169.254/latest/meta-data",
      "http://localhost/a.jpg",
      "http://printer.local/a.jpg",
      "http://intranet/a.jpg",
    ]) {
      expect(await refused(url), url).toBe("This address points to a private network.");
    }
    expect(await refused("https://cdn.example/a.jpg")).toBeNull();
  });

  it("refuses names that resolve to a private address", async () => {
    setSafeFetchDeps({ lookup: async () => ["93.184.216.34", "10.0.0.7"] });
    expect(await refused("https://sneaky.example/a.jpg")).toBe(
      "This address points to a private network.",
    );
    setSafeFetchDeps({ lookup: async () => [] });
    expect(await refused("https://gone.example/a.jpg")).toBe(
      "The site gone.example could not be found.",
    );
  });
});

describe("downloads", () => {
  const ok = (body: string | Uint8Array<ArrayBuffer>, headers: Record<string, string> = {}) =>
    new Response(body, { status: 200, headers });

  it("follows redirects by hand and checks each target", async () => {
    const seen: string[] = [];
    setSafeFetchDeps({
      lookup: async () => ["93.184.216.34"],
      fetch: (async (input: URL | RequestInfo) => {
        const url = String(input);
        seen.push(url);
        if (url.endsWith("/start"))
          return new Response(null, { status: 302, headers: { location: "/photo.jpg" } });
        if (url.endsWith("/photo.jpg")) return ok("JPEGDATA");
        return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/x" } });
      }) as typeof fetch,
    });
    const got = await safeFetch("https://cdn.example/start", { maxBytes: 100 });
    expect(new TextDecoder().decode(got.bytes)).toBe("JPEGDATA");
    expect(got.url).toBe("https://cdn.example/photo.jpg");
    await expect(safeFetch("https://cdn.example/evil", { maxBytes: 100 })).rejects.toThrow(
      "This address points to a private network.",
    );
    expect(seen).toEqual([
      "https://cdn.example/start",
      "https://cdn.example/photo.jpg",
      "https://cdn.example/evil",
    ]);
  });

  it("stops at the size limit, and tells retryable errors apart", async () => {
    const big = new Uint8Array(1000);
    setSafeFetchDeps({
      lookup: async () => ["93.184.216.34"],
      fetch: (async (input: URL | RequestInfo) => {
        const url = String(input);
        if (url.endsWith("/declared")) return ok(big, { "content-length": "1000" });
        if (url.endsWith("/streamed")) return ok(big);
        if (url.endsWith("/busy")) return new Response("busy", { status: 503 });
        return new Response("no", { status: 404 });
      }) as typeof fetch,
    });
    const err = async (path: string) =>
      safeFetch(`https://cdn.example${path}`, { maxBytes: 500 }).then(
        () => null,
        (e: FetchRefused) => ({ message: e.message, permanent: e.permanent }),
      );
    const tooBig = "The file is larger than the upload limit (Settings -> General).";
    expect(await err("/declared")).toEqual({ message: tooBig, permanent: true });
    expect(await err("/streamed")).toEqual({ message: tooBig, permanent: true });
    expect(await err("/busy")).toEqual({
      message: "The site answered with error 503.",
      permanent: false,
    });
    expect(await err("/missing")).toEqual({
      message: "The site answered with error 404.",
      permanent: true,
    });
  });
});
