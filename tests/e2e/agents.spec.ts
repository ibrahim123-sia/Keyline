import { expect, test } from "@playwright/test";
import { clearListings, db, deleteLocations, field, signInAsAdmin, snap } from "./helpers";

const AGENCY = process.env.AGENCY_ID || "0192f000-0000-7000-8000-000000000001";

test("agents: profile with languages, areas and hours; team order; hide", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  await clearListings();
  await db().query("delete from agents");
  await deleteLocations();
  await db().query(
    `insert into locations (id, agency_id, level, name, slug) values (gen_random_uuid(), $1, 'area', 'Harbour District', 'harbour-district')`,
    [AGENCY],
  );
  await signInAsAdmin(page, request);
  await page.goto("/admin/setup/agents");
  await expect(page.getByText("No agent profiles yet")).toBeVisible();

  await page.getByRole("button", { name: "New agent" }).click();
  const panel = page.getByRole("dialog", { name: "New agent" });
  await field(page, "Name").fill("Layla Haddad");
  await field(page, "Job title").fill("Senior Property Consultant");
  await page.getByRole("textbox", { name: "Phone" }).fill("020 7946 0018");
  await field(page, "Email").fill("Layla@Example.com");
  const languages = panel.getByRole("combobox", { name: "Languages" });
  await languages.fill("English");
  await languages.press("Enter");
  await languages.fill("Arabic");
  await languages.press("Enter");
  await panel.getByRole("textbox", { name: /Find an area/ }).fill("harb");
  await panel.getByRole("checkbox", { name: /Harbour District/ }).check();
  await panel.getByRole("switch", { name: /Same as the agency's viewing hours/ }).click();
  await panel.getByRole("switch", { name: "Sunday: working" }).uncheck();
  await panel.getByRole("button", { name: "Save" }).click();
  // The phone number needs the international format.
  await expect(panel.getByText(/Use the international format/)).toBeVisible();
  await page.getByRole("textbox", { name: "Phone" }).fill("+44 20 7946 0018");
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(panel).toBeHidden();

  const layla = page.getByRole("button", { name: "Edit Layla Haddad" });
  await expect(layla).toContainText("Senior Property Consultant · English, Arabic · 1 area");
  const [row] = (
    await db().query(
      "select phone, email, languages, working_hours from agents where name = 'Layla Haddad'",
    )
  ).rows as Array<{
    phone: string;
    email: string;
    languages: string[];
    working_hours: Record<string, string[][]>;
  }>;
  expect(row!.phone).toBe("+442079460018");
  expect(row!.email).toBe("layla@example.com");
  expect(row!.languages).toEqual(["English", "Arabic"]);
  expect(row!.working_hours.sun).toEqual([]);
  expect(row!.working_hours.mon!.length).toBeGreaterThan(0);

  // A second agent, then move them to the top with the keyboard.
  await page.getByRole("button", { name: "New agent" }).click();
  await field(page, "Name").fill("Omar Nasser");
  await page
    .getByRole("dialog", { name: "New agent" })
    .getByRole("button", { name: "Save" })
    .click();
  await expect(page.getByRole("button", { name: "Edit Omar Nasser" })).toBeVisible();
  const ids = Object.fromEntries(
    (await db().query("select id, name from agents")).rows.map((r) => [r.name, r.id]),
  ) as Record<string, string>;
  const omarHandle = page
    .getByRole("listitem")
    .filter({ hasText: "Omar Nasser" })
    .getByRole("button", { name: "Drag to reorder (team page order)" });
  const announcement = page.getByRole("status").filter({ hasText: /droppable area/ });
  // Each step waits for dnd-kit to catch up: a fast browser can send the arrow key before
  // the keyboard drag has started.
  await omarHandle.focus();
  await page.keyboard.press("Space");
  await expect(omarHandle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowUp");
  await expect(announcement).toHaveText(
    `Draggable item ${ids["Omar Nasser"]} was moved over droppable area ${ids["Layla Haddad"]}.`,
  );
  await page.keyboard.press("Space");
  await expect(omarHandle).not.toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () =>
      (await db().query("select name from agents order by sort_order")).rows.map((r) => r.name),
    )
    .toEqual(["Omar Nasser", "Layla Haddad"]);

  // Hide Layla from the site.
  await page.getByRole("switch", { name: "Show Layla Haddad on the site" }).click();
  await expect(page.getByText("Layla Haddad is hidden from the site")).toBeVisible();
  await expect
    .poll(
      async () =>
        (await db().query("select is_active from agents where name = 'Layla Haddad'")).rows[0]!
          .is_active,
    )
    .toBe(false);
  await snap(page, "agents");
});
