/**
 * Server side of the admin DataTable: page, sort and search come from the URL so every view
 * can be shared and bookmarked (07 §2 "saved views").
 */
export type SearchParamsRecord = Record<string, string | string[] | undefined>;

export type TableParams<S extends string> = {
  page: number;
  pageSize: number;
  sort: { id: S; desc: boolean };
  q: string;
  get: (key: string) => string | undefined;
  getAll: (key: string) => string[];
};

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseTableParams<S extends string>(
  sp: SearchParamsRecord,
  options: {
    sortable: readonly S[];
    defaultSort: { id: S; desc: boolean };
    pageSize?: number;
    maxPageSize?: number;
  },
): TableParams<S> {
  const pageSize = Math.min(
    options.maxPageSize ?? 100,
    Math.max(5, Number.parseInt(first(sp.size) ?? "", 10) || options.pageSize || 25),
  );
  const page = Math.max(1, Number.parseInt(first(sp.page) ?? "", 10) || 1);
  const rawSort = first(sp.sort) ?? "";
  const desc = rawSort.startsWith("-");
  const id = (desc ? rawSort.slice(1) : rawSort) as S;
  const sort = options.sortable.includes(id) ? { id, desc } : options.defaultSort;
  return {
    page,
    pageSize,
    sort,
    q: (first(sp.q) ?? "").trim().slice(0, 100),
    get: (key) => first(sp[key]),
    getAll: (key) => {
      const v = sp[key];
      return (Array.isArray(v) ? v : v ? v.split(",") : []).filter(Boolean);
    },
  };
}
