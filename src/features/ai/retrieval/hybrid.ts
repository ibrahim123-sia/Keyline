import "server-only";
import { and, desc, inArray, or, sql, type SQL } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { embeddings, type EmbeddingEntityType } from "@/db/schema/ai";
import { properties } from "@/db/schema/properties";
import { loadListingCards, type ListingCardData } from "@/features/listings/cards";
import { parseSearch, type SearchFilters } from "@/features/search/params";
import { searchConditions } from "@/features/search/query";
import { loadSettings } from "@/features/settings/queries";
import { currentEmbeddingProvider } from "../embeddings";
import { pgArrayLiteral } from "../sql";
import { vectorLiteral, type EmbeddingProvider } from "../embeddings/provider";
import {
  confidenceAdvice,
  confidenceFor,
  fuseRankings,
  listingQueryText,
  orTsQuery,
  type Confidence,
} from "./rank";

/**
 * Hybrid search (10 §1): the structured filters of the site search (purpose, price, beds,
 * area, drawn polygon, completion... reused from features/search) decide which listings may
 * appear; vector similarity and full text over the indexed chunks rank them; the results are
 * fused and re-ranked, and the listing cards are always loaded live from the database (price,
 * status), never from the embedding text.
 */

export type HybridFilters = Partial<Omit<SearchFilters, "sort" | "page" | "q">>;

export type HybridMatch = {
  id: string;
  score: number;
  similarity: number | null;
  textMatch: boolean;
};

export type HybridSearchResult = {
  listings: ListingCardData[];
  matches: HybridMatch[];
  /** How sure the match is; "low"/"none" mean the assistant must say it doesn't know. */
  confidence: Confidence;
  /** What the assistant should do with these results. */
  advice: string;
  topSimilarity: number | null;
  /** Listings that pass the structured filters (before ranking). */
  candidates: number;
};

const MAX_CANDIDATES = 500;
const RANK_DEPTH = 60;

function hasSpecificFilters(f: HybridFilters): boolean {
  return Object.entries(f).some(([key, value]) => {
    if (key === "purpose" || value === null || value === undefined) return false;
    return Array.isArray(value) ? value.length > 0 : value !== "";
  });
}

async function vectorRanking(
  db: DbOrTx,
  type: EmbeddingEntityType,
  query: number[],
  model: string,
  ids: string[] | null,
): Promise<Array<{ id: string; sim: number }>> {
  const scope = ids ? sql`and entity_id = any(${pgArrayLiteral(ids)}::uuid[])` : sql``;
  const rows = await db.execute<{ id: string; sim: number }>(sql`
    select entity_id as id, max(1 - (embedding <=> ${vectorLiteral(query)}::vector))::float8 as sim
    from ${embeddings}
    where agency_id = ${currentAgencyId()} and entity_type = ${type} and model = ${model} ${scope}
    group by entity_id
    order by sim desc
    limit ${RANK_DEPTH}`);
  return rows.rows.map((r) => ({ id: r.id, sim: Number(r.sim) }));
}

async function textRanking(
  db: DbOrTx,
  type: EmbeddingEntityType,
  tsquery: string,
  ids: string[] | null,
): Promise<string[]> {
  const scope = ids ? sql`and entity_id = any(${pgArrayLiteral(ids)}::uuid[])` : sql``;
  const rows = await db.execute<{ id: string }>(sql`
    select entity_id as id, max(ts_rank(content_vector, to_tsquery('simple', ${tsquery}))) as rank
    from ${embeddings}
    where agency_id = ${currentAgencyId()} and entity_type = ${type}
      and content_vector @@ to_tsquery('simple', ${tsquery}) ${scope}
    group by entity_id
    order by rank desc
    limit ${RANK_DEPTH}`);
  return rows.rows.map((r) => r.id);
}

export async function hybridSearch(
  input: { text?: string | null; filters?: HybridFilters; limit?: number },
  options: { db?: DbOrTx; provider?: EmbeddingProvider } = {},
): Promise<HybridSearchResult> {
  const db = options.db ?? (await getDb());
  const limit = Math.min(Math.max(input.limit ?? 6, 1), 20);
  const filters = input.filters ?? {};
  const text = listingQueryText(input.text?.trim() ?? "");
  const market = await loadSettings("market", db);

  // Structured filters: the same SQL as the site search, for one purpose or both.
  const base = parseSearch(new URLSearchParams());
  const purposes: Array<"sale" | "rent"> = filters.purpose ? [filters.purpose] : ["sale", "rent"];
  const where: SQL | undefined = or(
    ...purposes.map((purpose) =>
      and(...searchConditions({ ...base, ...filters, purpose, q: "" }, market)),
    ),
  );
  const candidateRows = await db
    .select({ id: properties.id })
    .from(properties)
    .where(where)
    .orderBy(
      desc(properties.isFeatured),
      sql`${properties.publishedAt} desc nulls last`,
      desc(properties.id),
    )
    .limit(MAX_CANDIDATES);
  const candidates = candidateRows.map((r) => r.id);
  const specific = hasSpecificFilters(filters);

  let ordered: string[];
  let matches: HybridMatch[];
  let topSimilarity: number | null = null;
  let textMatchTop = false;

  if (!text || candidates.length === 0) {
    ordered = candidates.slice(0, limit);
    matches = ordered.map((id, i) => ({
      id,
      score: 1 / (60 + i + 1),
      similarity: null,
      textMatch: false,
    }));
  } else {
    const provider = options.provider ?? (await currentEmbeddingProvider(db));
    const tsquery = orTsQuery(text);
    const [{ vectors }, words] = await Promise.all([
      provider.embed([text]),
      tsquery ? textRanking(db, "property", tsquery, candidates) : Promise.resolve([]),
    ]);
    const vector = await vectorRanking(db, "property", vectors[0]!, provider.model, candidates);
    // Title, building and reference matches (works even before a listing is indexed).
    const titles = tsquery
      ? (
          await db
            .select({ id: properties.id })
            .from(properties)
            .where(
              and(
                inArray(properties.id, candidates),
                sql`(${properties.searchVector} @@ to_tsquery('simple', ${tsquery}) or lintel_normalize(${properties.title}) % lintel_normalize(${text}) or ${properties.reference} ilike ${text})`,
              ),
            )
            .orderBy(
              sql`ts_rank(${properties.searchVector}, to_tsquery('simple', ${tsquery})) desc`,
            )
            .limit(RANK_DEPTH)
        ).map((r) => r.id)
      : [];

    const fused = fuseRankings([
      { name: "vector", weight: 1, ids: vector.map((v) => v.id) },
      { name: "text", weight: 0.8, ids: words },
      { name: "title", weight: 0.6, ids: titles },
      // A small pull towards featured and newer homes when the rest is equal.
      { name: "structured", weight: 0.15, ids: candidates.slice(0, RANK_DEPTH) },
    ]);
    const sims = new Map(vector.map((v) => [v.id, v.sim]));
    const textHits = new Set([...words, ...titles]);
    matches = fused.slice(0, limit).map((f) => ({
      id: f.id,
      score: f.score,
      similarity: sims.get(f.id) ?? null,
      textMatch: textHits.has(f.id),
    }));
    ordered = matches.map((m) => m.id);
    const withSim = matches.filter((m) => m.similarity !== null).map((m) => m.similarity!);
    topSimilarity = withSim.length ? Math.max(...withSim) : null;
    textMatchTop = matches[0]?.textMatch ?? false;

    const confidence = confidenceFor({
      candidates: candidates.length,
      specificFilters: specific,
      hasText: true,
      topSimilarity,
      textMatch: textMatchTop,
      thresholds: provider.thresholds,
    });
    return finish(confidence);
  }

  return finish(
    confidenceFor({
      candidates: candidates.length,
      specificFilters: specific,
      hasText: false,
      topSimilarity: null,
      textMatch: false,
      thresholds: { high: 1, low: 1 },
    }),
  );

  async function finish(confidence: Confidence): Promise<HybridSearchResult> {
    const cards = await loadListingCards(db, ordered);
    const byId = new Map(cards.map((c) => [c.id, c]));
    return {
      listings: ordered.map((id) => byId.get(id)).filter((c): c is ListingCardData => Boolean(c)),
      matches,
      confidence,
      advice: confidenceAdvice[confidence],
      topSimilarity,
      candidates: candidates.length,
    };
  }
}

export type KnowledgeHit = {
  entityType: EmbeddingEntityType;
  entityId: string;
  /** The best matching chunk (for FAQs and pages: the text itself). */
  content: string;
  similarity: number | null;
  textMatch: boolean;
};

export type KnowledgeResult = { hits: KnowledgeHit[]; confidence: Confidence; advice: string };

/** Retrieval over FAQs, pages, posts, area guides, projects and developers (`answer_faq`). */
export async function searchKnowledge(
  input: { text: string; types?: EmbeddingEntityType[]; limit?: number },
  options: { db?: DbOrTx; provider?: EmbeddingProvider } = {},
): Promise<KnowledgeResult> {
  const db = options.db ?? (await getDb());
  const types = input.types ?? ["faq", "page", "post", "area_guide", "project", "developer"];
  const limit = Math.min(Math.max(input.limit ?? 4, 1), 10);
  const provider = options.provider ?? (await currentEmbeddingProvider(db));
  const text = input.text.trim();
  if (!text) return { hits: [], confidence: "none", advice: confidenceAdvice.none };

  const { vectors } = await provider.embed([text]);
  const tsquery = orTsQuery(text);
  const rows = await db.execute<{
    entity_type: EmbeddingEntityType;
    entity_id: string;
    content: string;
    sim: number;
    text_match: boolean;
  }>(sql`
    select distinct on (entity_type, entity_id)
      entity_type, entity_id, content,
      (1 - (embedding <=> ${vectorLiteral(vectors[0]!)}::vector))::float8 as sim,
      ${tsquery ? sql`content_vector @@ to_tsquery('simple', ${tsquery})` : sql`false`} as text_match
    from ${embeddings}
    where agency_id = ${currentAgencyId()} and model = ${provider.model}
      and entity_type in ${types}
    order by entity_type, entity_id, sim desc`);
  const all = rows.rows.map((r) => ({
    entityType: r.entity_type,
    entityId: r.entity_id,
    content: r.content,
    similarity: Number(r.sim),
    textMatch: Boolean(r.text_match),
  }));
  const fused = fuseRankings([
    {
      name: "vector",
      weight: 1,
      ids: [...all].sort((a, b) => b.similarity - a.similarity).map((h) => h.entityId),
    },
    { name: "text", weight: 0.8, ids: all.filter((h) => h.textMatch).map((h) => h.entityId) },
  ]);
  const byId = new Map(all.map((h) => [h.entityId, h]));
  const hits = fused.slice(0, limit).map((f) => byId.get(f.id)!);
  const top = hits[0];
  const confidence = confidenceFor({
    candidates: all.length,
    specificFilters: false,
    hasText: true,
    topSimilarity: top?.similarity ?? null,
    textMatch: top?.textMatch ?? false,
    thresholds: provider.thresholds,
  });
  return { hits, confidence, advice: confidenceAdvice[confidence] };
}
