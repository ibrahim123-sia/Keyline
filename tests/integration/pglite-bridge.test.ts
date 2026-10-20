import { inject, describe, expect, it, afterAll } from "vitest";
import { Client, Pool } from "pg";

/**
 * Locks in the wire-protocol behaviour of scripts/pglite.ts (the local/test database).
 * A regression here means silently wrong query results after an error.
 */
const url = inject("databaseUrl");
const pool = new Pool({ connectionString: url, max: 4 });

afterAll(async () => {
  await pool.end();
});

describe("PGlite wire bridge", () => {
  it("keeps responses aligned after errors in parameterised queries", async () => {
    const c = new Client({ connectionString: url });
    await c.connect();
    try {
      await expect(c.query("select * from missing_table where id = $1", [1])).rejects.toThrow(
        /does not exist/,
      );
      expect((await c.query("select $1::int as v", [7])).rows).toEqual([{ v: 7 }]);
      await expect(c.query("select 1/$1::int as v", [0])).rejects.toThrow(/division by zero/);
      expect((await c.query("select 'ok' as s")).rows).toEqual([{ s: "ok" }]);
    } finally {
      await c.end();
    }
  });

  it("aborts and rolls back a failed transaction correctly", async () => {
    const c = new Client({ connectionString: url });
    await c.connect();
    try {
      await c.query("begin");
      await expect(c.query("select * from missing_table where id = $1", [1])).rejects.toThrow();
      await expect(c.query("select 1")).rejects.toThrow(/current transaction is aborted/);
      await c.query("rollback");
      expect((await c.query("select 2 as two")).rows).toEqual([{ two: 2 }]);
    } finally {
      await c.end();
    }
  });

  it("isolates an open transaction from other connections", async () => {
    const a = new Client({ connectionString: url });
    const b = new Client({ connectionString: url });
    await a.connect();
    await b.connect();
    try {
      await a.query("delete from rate_limits where key like 'bridge:%'");
      await a.query("begin");
      await a.query("insert into rate_limits (key, count, expires_at) values ($1, 1, now())", [
        "bridge:k",
      ]);
      const seen = b
        .query("select count(*)::int as n from rate_limits where key = $1", ["bridge:k"])
        .then((r) => r.rows[0].n as number);
      await new Promise((r) => setTimeout(r, 100));
      await a.query("rollback");
      // b waited for a's transaction to end, and the insert was rolled back.
      expect(await seen).toBe(0);
    } finally {
      await a.end();
      await b.end();
    }
  });

  it("serves a pool with interleaved failures", async () => {
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        pool
          .query(i % 5 === 0 ? "select * from missing_table where x = $1" : "select $1::int as v", [
            i,
          ])
          .then(
            (r) => r.rows[0].v as number,
            () => -1,
          ),
      ),
    );
    expect(results).toEqual(Array.from({ length: 30 }, (_, i) => (i % 5 === 0 ? -1 : i)));
  });

  it("has PostGIS, pgvector, pg_trgm and unaccent", async () => {
    const r = await pool.query(
      `select
         round(ST_Distance(ST_MakePoint(55.14,25.08)::geography, ST_MakePoint(55.15,25.08)::geography)) as m,
         '[1,0]'::vector <=> '[1,0]'::vector as d,
         similarity('marina', 'marena') > 0.3 as fuzzy,
         lintel_normalize('Marína') as n`,
    );
    expect(r.rows[0]).toMatchObject({ d: 0, fuzzy: true, n: "marina" });
    expect(Number(r.rows[0].m)).toBeGreaterThan(900);
  });
});
