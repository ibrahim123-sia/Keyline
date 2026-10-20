import { newId } from "@/lib/ids";
import type { SessionUser } from "@/lib/permissions";

/**
 * Integration tests call Server Actions directly. Only the session lookup is replaced (see
 * admin-guards-mock.ts): validation, permission checks, audit and database writes are real.
 * In a test file: vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));
 */
export const testAdmin: SessionUser = {
  id: newId(),
  name: "Test Admin",
  email: "admin@test.lintel",
  emailVerified: true,
  image: null,
  role: "admin",
  phone: null,
  isActive: true,
  readOnly: false,
  twoFactorEnabled: true,
  adminTheme: "light",
};

/** `signedInAt` defaults to "just now"; set it in the past to test re-authentication. */
export const adminState: { user: SessionUser | null; signedInAt?: Date } = { user: testAdmin };
