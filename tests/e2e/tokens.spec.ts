import { expect, test } from "@playwright/test";
import { db, INTERNAL_SECRET } from "./helpers";

const AGENCY = process.env.AGENCY_ID || "0192f000-0000-7000-8000-000000000001";

async function setAccent(accent: string) {
  const value = {
    colors: {
      bg: "#F7F3EE",
      surface: "#FFFFFF",
      surfaceSoft: "#FBF9F6",
      surfaceMuted: "#EDE5DA",
      ink: "#14232B",
      inkSoft: "#1C2F38",
      text: "#4A5560",
      textMuted: "#5B6670",
      border: "#E6DED3",
      accent,
      accentSoft: "#F3E6DF",
      success: "#4F6B57",
      successSoft: "#E3EBE4",
      danger: "#B4402A",
      photoPlaceholder: "#DCD3C6",
    },
    fontDisplay: "Fraunces",
    fontBody: "Manrope",
    cornerStyle: "soft",
  };
  await db().query(
    `insert into settings (id, agency_id, "group", value)
     values (gen_random_uuid(), $1, 'branding', $2::jsonb)
     on conflict (agency_id, "group") do update set value = excluded.value, updated_at = now()`,
    [AGENCY, JSON.stringify(value)],
  );
}

test("changing a colour token in the database restyles the site after revalidation", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const before = await page.locator("#lintel-tokens").textContent();
  expect(before).toContain("--color-accent:#A9502F");

  await setAccent("#2F6FA9");
  const res = await request.post("/api/internal/revalidate", {
    headers: { authorization: `Bearer ${INTERNAL_SECRET}` },
    data: { tags: ["settings:branding"] },
  });
  expect(res.ok()).toBe(true);

  await page.goto("/");
  // A <style> element has no rendered text, so read textContent.
  await expect
    .poll(() => page.locator("#lintel-tokens").textContent())
    .toContain("--color-accent:#2F6FA9");
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim(),
  );
  expect(accent.toLowerCase()).toBe("#2f6fa9");

  await setAccent("#A9502F");
  await request.post("/api/internal/revalidate", {
    headers: { authorization: `Bearer ${INTERNAL_SECRET}` },
    data: { tags: ["settings:branding"] },
  });
});

test("internal endpoints reject requests without the secret", async ({ request }) => {
  const res = await request.post("/api/internal/revalidate", {
    data: { tags: ["settings:branding"] },
  });
  expect(res.status()).toBe(401);
});
