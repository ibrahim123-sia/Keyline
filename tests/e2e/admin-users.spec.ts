import { expect, test } from "@playwright/test";
import { field, latestEmail, linkFrom, signIn, signInAsAdmin, uniqueEmail } from "./helpers";

test("admin users: invite by email, set a password from the link, sign in", async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(300_000);
  await signInAsAdmin(page, request);
  await page.goto("/admin/settings/users");
  await expect(page.getByRole("heading", { name: "Admin users", level: 1 })).toBeVisible();

  const email = uniqueEmail("invited");
  await page.getByRole("button", { name: "Invite an admin" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite an admin" });
  await dialog.getByRole("textbox", { name: "Name" }).fill("Mira Invited");
  await dialog.getByRole("textbox", { name: "Email" }).fill(email);
  await dialog.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText(`Invite sent to ${email}`)).toBeVisible();
  await expect(page.getByRole("row", { name: /Mira Invited/ })).toContainText("Invite sent");

  // The invitee, in their own browser.
  const { html } = await latestEmail(email, "auth.admin-invite");
  const invitee = await (await browser.newContext()).newPage();
  await invitee.goto(linkFrom(html, "/reset-password/"));
  await expect(invitee).toHaveURL(/\/reset-password\?.*invite=1/);
  await expect(invitee.getByText("Choose a password for your admin account")).toBeVisible();
  const password = "lantern-harbour-meadow-58";
  await field(invitee, "Password").fill(password);
  await field(invitee, "Repeat password").fill(password);
  await invitee.getByRole("button", { name: "Save new password" }).click();
  await expect(invitee.getByText("Password changed.")).toBeVisible();
  // The link in the card (the site header has a customer "Sign in" link too).
  await invitee.getByRole("main").getByRole("link", { name: "Sign in" }).click();
  await expect(invitee).toHaveURL(/\/admin\/sign-in/);
  await signIn(invitee, "/admin/sign-in", email, password);
  await expect(invitee).toHaveURL(/\/admin(\?|$)/);
  await expect(invitee.getByText("Welcome, Mira Invited")).toBeVisible();

  // Back on the first admin's screen the invite is accepted.
  await page.reload();
  await expect(page.getByRole("row", { name: /Mira Invited/ })).toContainText("Active");
});
