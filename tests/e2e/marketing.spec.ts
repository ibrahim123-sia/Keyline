import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { clearLeads, db, revalidateTags, setSettings, signInAsAdmin, snap } from "./helpers";

const AGENCY = process.env.AGENCY_ID || "0192f000-0000-7000-8000-000000000001";

test("templates: a changed auto-reply goes out for a lead from a page's contact form", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  await clearLeads();
  await db().query("delete from message_templates");
  await db().query("delete from pages where slug = 'e2e-write-to-us'");
  await setSettings(request, "contact", { email: "hello@agency.example", leadNotifyEmails: [] });
  await signInAsAdmin(page, request);

  // Settings -> Message templates: the visitor's auto-reply gets the agency's own subject.
  await page.goto("/admin/settings/templates");
  await expect(page.getByRole("heading", { name: "Message templates", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Edit Auto-reply to a new lead" }).click();
  const panel = page.getByRole("dialog", { name: "Auto-reply to a new lead" });
  await panel.getByRole("textbox", { name: "Subject", exact: true }).fill("E2E thanks, {{name}}");
  await expect(panel.getByRole("region", { name: "Preview" })).toContainText("E2E thanks, Sam");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Template saved")).toBeVisible();
  await snap(page, "message-templates");
  await page.keyboard.press("Escape");
  await expect(
    page
      .getByRole("region", { name: "To visitors and customers" })
      .getByRole("listitem")
      .filter({ hasText: "Auto-reply to a new lead" }),
  ).toContainText("Edited");

  // A page with a contact form section; a visitor writes in.
  const sections = [
    {
      id: randomUUID(),
      type: "form",
      props: {
        eyebrow: "",
        heading: "Write to us",
        text: "",
        formType: "contact",
        buttonLabel: "",
        successMessage: "",
      },
    },
  ];
  await db().query(
    `insert into pages (id, agency_id, title, slug, status, template, sections)
     values (gen_random_uuid(), $1, 'E2E Write to us', 'e2e-write-to-us', 'published', 'default', $2::jsonb)`,
    [AGENCY, JSON.stringify(sections)],
  );
  await revalidateTags(request, ["pages"]);
  const visitor = await page.context().newPage();
  await visitor.goto("/e2e-write-to-us");
  const form = visitor
    .locator("form")
    .filter({ has: visitor.getByRole("button", { name: "Send message" }) });
  await form.getByRole("textbox", { name: "Name", exact: true }).fill("Sam Writer");
  await form.getByRole("textbox", { name: "Email", exact: true }).fill("e2e-forms@example.com");
  await form.getByRole("textbox", { name: "Message", exact: true }).fill("Do you manage rentals?");
  await form.getByRole("checkbox", { name: "I agree to be contacted about my request." }).check();
  await form.getByRole("button", { name: "Send message" }).click();
  await expect(visitor.getByText(/We have your message/)).toBeVisible();

  await expect
    .poll(async () => (await db().query("select source, source_detail from leads")).rows)
    .toEqual([{ source: "form", source_detail: "contact" }]);
  await expect
    .poll(
      async () =>
        (
          await db().query(
            `select subject from email_log where template = 'lead.auto_reply' and "to" = 'e2e-forms@example.com'`,
          )
        ).rows,
    )
    .toEqual([{ subject: "E2E thanks, Sam" }]);
  await db().query("delete from message_templates");
});

test("newsletter: sign up in the footer, confirm from the email, then unsubscribe", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  await db().query("delete from newsletter_subscribers where email = 'e2e-news@example.com'");
  await setSettings(request, "website", {
    footer: { text: "", legalText: "", newsletter: true },
  });
  await page.goto("/agents");
  const box = page.getByRole("region", { name: "Newsletter" });
  await box.getByRole("textbox", { name: "Email address" }).fill("e2e-news@example.com");
  await box.getByRole("button", { name: "Subscribe" }).click();
  await expect(box.getByRole("status")).toContainText("Check your inbox");

  const mail = async () =>
    (
      await db().query(
        `select text from email_log where template = 'newsletter.confirm' and "to" = 'e2e-news@example.com' order by created_at desc limit 1`,
      )
    ).rows[0]?.text as string | undefined;
  await expect.poll(mail).toContain("/newsletter/confirm/");
  const text = (await mail())!;
  const confirm = text.match(/\/newsletter\/confirm\/[A-Za-z0-9_-]{32}/)![0];
  const unsubscribe = text.match(
    /\/newsletter\/unsubscribe\?u=[0-9a-f-]{36}&t=[A-Za-z0-9_-]{32}/,
  )![0];

  // Opening the link alone confirms nothing (mail scanners open links); the button does.
  await page.goto(confirm);
  await expect(page.getByRole("heading", { name: "Confirm your subscription" })).toBeVisible();
  const state = async () =>
    (
      await db().query(
        "select confirmed_at is not null as confirmed, unsubscribed_at is not null as left from newsletter_subscribers where email = 'e2e-news@example.com'",
      )
    ).rows[0];
  expect(await state()).toEqual({ confirmed: false, left: false });
  await page.getByRole("button", { name: "Confirm my subscription" }).click();
  await expect(page.getByText("You're subscribed. Thank you.")).toBeVisible();
  expect(await state()).toEqual({ confirmed: true, left: false });

  await page.goto(unsubscribe);
  await page.getByRole("button", { name: "Unsubscribe" }).click();
  await expect(page.getByText("Done. You won't get our newsletter any more.")).toBeVisible();
  expect(await state()).toEqual({ confirmed: true, left: true });
});
