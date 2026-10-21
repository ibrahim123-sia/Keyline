import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { developers, locations } from "@/db/schema/master-data";
import { agents } from "@/db/schema/people";
import { projects } from "@/db/schema/projects";
import { properties } from "@/db/schema/properties";
import { getPublicAgent, listPublicAgents } from "@/features/agents/public";
import { getPublicDeveloper, listPublicDevelopers } from "@/features/developers/public";
import { newId } from "@/lib/ids";
import { truncate } from "../helpers/db";

let n = 0;
async function listing(values: Partial<typeof properties.$inferInsert>) {
  const db = await getDb();
  n++;
  await db.insert(properties).values({
    reference: `LT-${7000 + n}`,
    title: `Home ${n}`,
    slug: `home-${n}-${newId().slice(-6)}`,
    purpose: "sale",
    ...values,
  });
}

describe("public developer and agent pages", () => {
  beforeEach(async () => {
    await truncate("properties", "projects", "developers", "agents", "locations");
  });

  it("lists developers with their published projects and loads one with its listings", async () => {
    const db = await getDb();
    const north = newId();
    const calder = newId();
    await db.insert(developers).values([
      { id: north, name: "Northline", slug: "northline", sortOrder: 1, establishedYear: 1998 },
      { id: calder, name: "Calder Homes", slug: "calder-homes", sortOrder: 0 },
      { name: "Gone Builders", slug: "gone-builders", deletedAt: new Date() },
    ]);
    const live = newId();
    await db.insert(projects).values([
      { id: live, name: "The Linden", slug: "the-linden", developerId: north, isPublished: true },
      { name: "Draft Tower", slug: "draft-tower", developerId: north },
    ]);
    await listing({
      projectId: live,
      status: "available",
      publishedAt: new Date(),
      title: "Linden 2 bed",
    });
    await listing({ projectId: live, status: "draft", title: "Linden draft" });

    expect((await listPublicDevelopers()).map((d) => [d.name, d.projects])).toEqual([
      ["Calder Homes", 0],
      ["Northline", 1],
    ]);
    const d = await getPublicDeveloper("northline");
    expect(d).toMatchObject({ name: "Northline", establishedYear: 1998 });
    expect(d!.projects.map((p) => p.name)).toEqual(["The Linden"]);
    expect(d!.listings.map((l) => l.title)).toEqual(["Linden 2 bed"]);
    expect(await getPublicDeveloper("gone-builders")).toBeNull();
  });

  it("lists active agents in order and loads one with their live listings", async () => {
    const db = await getDb();
    const marina = newId();
    await db
      .insert(locations)
      .values({ id: marina, level: "area", name: "Marina", slug: "marina" });
    const sara = newId();
    await db.insert(agents).values([
      {
        id: sara,
        name: "Sara Khan",
        slug: "sara-khan",
        sortOrder: 1,
        languages: ["English", "Urdu"],
        areas: [marina],
      },
      { name: "Omar Haddad", slug: "omar-haddad", sortOrder: 0 },
      { name: "Former Agent", slug: "former-agent", isActive: false },
    ]);
    await listing({
      agentId: sara,
      status: "available",
      publishedAt: new Date(),
      title: "Sara's loft",
    });
    await listing({ agentId: sara, status: "sold", publishedAt: new Date(), title: "Sold one" });

    expect((await listPublicAgents()).map((a) => a.name)).toEqual(["Omar Haddad", "Sara Khan"]);
    const a = await getPublicAgent("sara-khan");
    expect(a).toMatchObject({
      name: "Sara Khan",
      languages: ["English", "Urdu"],
      areas: [{ name: "Marina", slug: "marina" }],
    });
    expect(a!.listings.map((l) => l.title)).toEqual(["Sara's loft"]);
    expect(await getPublicAgent("former-agent")).toBeNull();
  });
});
