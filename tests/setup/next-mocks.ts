import { vi } from "vitest";

/**
 * Next.js runtime APIs do not exist outside a Next request. Cache directives are no-ops in
 * tests, and the invalidation calls are spies so tests can assert which tags were touched.
 */
vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("server-only", () => ({}));

process.env.SECRETS_ENCRYPTION_KEY ??= "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="; // test-only key
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-0123";
process.env.APP_URL ??= "http://localhost:3000";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
