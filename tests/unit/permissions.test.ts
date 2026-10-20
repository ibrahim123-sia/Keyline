import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth/schemas";
import { passwordStrength } from "@/lib/password-strength";
import { can, checkAdmin, type SessionUser } from "@/lib/permissions";

const policy = { require2fa: true, adminSessionHours: 12, reauthMinutes: 15 };
const now = new Date("2026-10-20T12:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "u1",
    name: "Owner",
    email: "owner@agency.test",
    emailVerified: true,
    image: null,
    role: "admin",
    phone: null,
    isActive: true,
    readOnly: false,
    twoFactorEnabled: true,
    adminTheme: "light",
    ...overrides,
  };
}

describe("permission table (03)", () => {
  it("lets everyone browse, use tools and send forms", () => {
    for (const role of ["guest", "customer", "admin"] as const) {
      expect(can(role, "site.browse")).toBe(true);
      expect(can(role, "tools.use")).toBe(true);
      expect(can(role, "forms.submit")).toBe(true);
      expect(can(role, "chat.use")).toBe(true);
    }
  });

  it("asks guests to sign up to save", () => {
    expect(can("guest", "saved.manage")).toBe(false);
    expect(can("customer", "saved.manage")).toBe(true);
  });

  it("keeps /admin and the admin assistant for admins only", () => {
    expect(can("guest", "admin.access")).toBe(false);
    expect(can("customer", "admin.access")).toBe(false);
    expect(can("admin", "admin.access")).toBe(true);
    expect(can("customer", "admin.assistant")).toBe(false);
  });
});

describe("checkAdmin", () => {
  it("accepts an active admin with 2FA", () => {
    expect(checkAdmin(user(), minutesAgo(5), policy, {}, now)).toBeNull();
  });

  it("rejects guests and customers", () => {
    expect(checkAdmin(null, null, policy, {}, now)).toBe("UNAUTHENTICATED");
    expect(checkAdmin(user({ role: "customer" }), minutesAgo(1), policy, {}, now)).toBe(
      "FORBIDDEN",
    );
    expect(checkAdmin(user({ isActive: false }), minutesAgo(1), policy, {}, now)).toBe("FORBIDDEN");
  });

  it("ends admin sessions after 12 hours", () => {
    expect(checkAdmin(user(), minutesAgo(12 * 60 + 1), policy, {}, now)).toBe("SESSION_EXPIRED");
  });

  it("requires 2FA unless relaxed in settings (demo)", () => {
    const noTotp = user({ twoFactorEnabled: false });
    expect(checkAdmin(noTotp, minutesAgo(1), policy, {}, now)).toBe("TWO_FACTOR_REQUIRED");
    expect(
      checkAdmin(noTotp, minutesAgo(1), policy, { allowWithoutTwoFactor: true }, now),
    ).toBeNull();
    expect(checkAdmin(noTotp, minutesAgo(1), { ...policy, require2fa: false }, {}, now)).toBeNull();
  });

  it("blocks writes for the read-only demo viewer but not reads", () => {
    const viewer = user({ readOnly: true });
    expect(checkAdmin(viewer, minutesAgo(1), policy, {}, now)).toBeNull();
    expect(checkAdmin(viewer, minutesAgo(1), policy, { write: true }, now)).toBe("READ_ONLY");
  });

  it("asks for a fresh sign-in before sensitive actions", () => {
    expect(checkAdmin(user(), minutesAgo(5), policy, { sensitive: true }, now)).toBeNull();
    expect(checkAdmin(user(), minutesAgo(20), policy, { sensitive: true }, now)).toBe(
      "REAUTH_REQUIRED",
    );
  });
});

describe("password strength", () => {
  it("scores length and variety, rejects common and personal passwords", () => {
    expect(passwordStrength("")).toBe(0);
    expect(passwordStrength("password123456")).toBe(0);
    expect(passwordStrength("sara-khan-2026", ["sara@example.com", "Sara Khan"])).toBe(0);
    expect(passwordStrength("aaaaaaaaaaaa")).toBe(0);
    expect(passwordStrength("tidal-orchard")).toBe(1);
    expect(passwordStrength("Tidal-Orchard-Lamp")).toBe(3);
    expect(passwordStrength("quiet dune lantern ferry river")).toBeGreaterThanOrEqual(2);
  });
});

describe("safeNext (no open redirects)", () => {
  it("only allows same-site relative paths", () => {
    expect(safeNext("/account/saved?x=1", "/account")).toBe("/account/saved?x=1");
    expect(safeNext("https://evil.example", "/account")).toBe("/account");
    expect(safeNext("//evil.example", "/account")).toBe("/account");
    expect(safeNext("/\\evil.example", "/account")).toBe("/account");
    expect(safeNext(null, "/admin")).toBe("/admin");
  });
});
