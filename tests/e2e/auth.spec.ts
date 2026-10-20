import { expect, test } from "@playwright/test";
import { secretFromUri, totp } from "../helpers/totp";
import {
  createAdmin,
  expectPath,
  field,
  latestEmail,
  linkFrom,
  setSettings,
  signIn,
  uniqueEmail,
} from "./helpers";

test.describe("Phase 1: access control", () => {
  test("/admin and /account are blocked for guests", async ({ page }) => {
    await page.goto("/admin");
    await expectPath(page, "/admin/sign-in");
    await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();

    await page.goto("/admin/website/pages");
    await expectPath(page, "/admin/sign-in");

    await page.goto("/account");
    await expectPath(page, "/sign-in");
  });

  test("a customer signs up, verifies the email, and is kept out of /admin", async ({ page }) => {
    const email = uniqueEmail("customer");
    await page.goto("/sign-up");
    await field(page, "Full name").fill("Lina Haddad");
    await field(page, "Email").fill(email);
    await field(page, "Password").fill("quiet-dune-lantern-7");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByTestId("signup-check-email")).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

    // The verification email is in the outbox (mocked in development).
    const mail = await latestEmail(email, "auth.verify-email");
    await page.goto(linkFrom(mail.html, "/api/auth/verify-email"));
    await expectPath(page, "/account");
    await expect(page.getByRole("heading", { name: "Hello, Lina" })).toBeVisible();

    // Signed-in customers still cannot use the admin portal.
    await page.goto("/admin");
    await expectPath(page, "/admin/sign-in");
    await expect(page.getByText("This area is only for agency staff.")).toBeVisible();
  });

  test("first admin from the setup command signs in with 2FA", async ({ page, request }) => {
    await setSettings(request, "security", { require2fa: true });
    const email = uniqueEmail("owner");
    const password = "tidal-orchard-lamp-42";
    createAdmin(email, password, "Nadia Owner");

    // First sign-in: 2FA is required by default, so the admin is sent to enrol.
    await signIn(page, "/admin/sign-in", email, password);
    await expectPath(page, "/admin/setup-2fa");
    await field(page, "Password").fill(password);
    await page.getByRole("button", { name: "Create" }).click();

    const key = await page.locator("code").textContent();
    expect(key).toMatch(/^[A-Z2-7]+=*$/);
    const secret = secretFromUri(`otpauth://totp/x?secret=${key}`);
    await field(page, "Authentication code").fill(await totp(secret));
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByTestId("backup-codes").locator("li")).toHaveCount(10);
    await page.getByRole("button", { name: "Continue to the portal" }).click();
    await expectPath(page, "/admin");
    await expect(page.getByText("Welcome, Nadia Owner")).toBeVisible();

    // Sign out, then sign in again: the code is asked for.
    await page.getByRole("button", { name: "Your account" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expectPath(page, "/admin/sign-in");

    await signIn(page, "/admin/sign-in", email, password);
    await expectPath(page, "/admin/two-factor");
    await field(page, "Authentication code").fill("000000");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(
      page.getByText("That code didn't work. Try the newest code from your app."),
    ).toBeVisible();
    await field(page, "Authentication code").fill(await totp(secret));
    await page.getByRole("button", { name: "Verify" }).click();
    await expectPath(page, "/admin");
    await expect(page.getByText("Welcome, Nadia Owner")).toBeVisible();
  });
});
